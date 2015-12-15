var fs = require('fs'),
    shell = require('shelljs'),
    base64url = require('base64url'),
    moment = require('moment'),
    async = require('async'),
    ProgressBar = require('progress');

var google = require('googleapis'),
    gmail = google.gmail('v1'),
    getAuth2Client = require('./getAuth2Client');

// TODO: This should be from the command line:
var maxPageResults = 100; // How many messages per page.
var maxMessages = 0; // 0 for all.

getAuth2Client(function(err, auth) {
    console.log('Getting profile and labels...');
        
    async.parallel([
        async.apply(gmail.users.getProfile, { auth: auth, userId: 'me' }),
        async.apply(gmail.users.labels.list, { auth: auth, userId: 'me' })
    ], function(err, results) {
        var profile = results[0][0];
        var labels = results[1][0].labels;
        
        var messagesTotal = profile.messagesTotal;
        var messagesCounter = 0;
        
        if (!shell.test('-e', 'mbox_' + profile.emailAddress)) {
            shell.mkdir('mbox_' + profile.emailAddress);
        }
        
        var normalizeLabel = function(str) {
            if (str !== str.toUpperCase()) return str;
            return str.toLowerCase().replace( /[\s_-](.)|^(.)/g, function($1) { return $1.toUpperCase(); });
        };
        
        var getLabelsFromMessage = function (message) {
            if (!labels || !message.labelIds || message.labelIds.length === 0) return '';
            return message.labelIds
                .map(function (labelId) {
                    var label = labels.find(function (l) { return l.id === labelId; });
                    return (label && label.name) ? normalizeLabel(label.name) : undefined;
                }).filter(function (l) { return l !== undefined }).join();
        };
        
        var writeMessageToFile = function(message) {
            var wstream = fs.createWriteStream('mbox_' + profile.emailAddress + '/' + message.id + '.mbox.part', { flags: 'w' });
            
            var threadId = parseInt(message.threadId, 16);
            var date = moment(parseInt(message.internalDate, 10)).format('ddd MMM DD HH:mm:ss YYYY');
            var labelStr = getLabelsFromMessage(message);
            
            wstream.write('From ' + threadId + '@xxx ' + date + '\r\n');
            wstream.write('X-GM-THRID: ' + threadId + '\r\n');
            
            if (labelStr && labelStr.length != 0) {
                wstream.write('X-Gmail-Labels: ' + labelStr + '\r\n');
            }
            
            wstream.write(base64url.decode(message.raw));
            wstream.write('\r\n');
                            
            wstream.end();
        };
        
        var downloadBar = new ProgressBar('Getting messages... [:bar] :percent - (:current/:total) - :eta seconds left.', { 
            total: Math.min(maxMessages || messagesTotal, messagesTotal), 
            complete: '=', 
            incomplete: ' ',
            width: 40 
        });

        var nextPageToken = undefined;
        
        // While there is a nextPageToken:
        async.doWhilst(function(pageCallback) {
            async.retry({times: 20, interval: 1000}, async.apply(gmail.users.messages.list, { auth: auth, userId: 'me', maxResults: maxPageResults, pageToken: nextPageToken }), function(err, response) {
                if (err)
                    throw 'Failed getting message list: ' + nextPageToken + ' - ' + err;    
                
                nextPageToken = response.nextPageToken;
                var messageIds = response.messages.map(function(m) { return m.id; });
                
                // For each message in page:
                async.eachSeries(messageIds, function(messageId, callback) {
                    messagesCounter++;
                    
                    if (maxMessages && messagesCounter > maxMessages) {
                        async.setImmediate(function () { callback(); });
                        return;
                    }

                    var partFilename = 'mbox_' + profile.emailAddress + '/' + messageId + '.mbox.part';

                    if (shell.test('-f', partFilename) && fs.statSync(partFilename).size != 0) {
                        downloadBar.tick(1);
                        async.setImmediate(function () { callback(); });
                        return;
                    }
                    
                    async.retry({times: 20, interval: 1000}, async.apply(gmail.users.messages.get, { auth: auth, userId: 'me', id: messageId, format: 'raw' }), function(err, message) {
                        if (err)
                            throw 'Failed getting message: ' + message.id + ' - ' + err;    
                
                        writeMessageToFile(message);
                        
                        downloadBar.tick(1);
                        callback();
                    });
                }, function(err) {
                    if (err)
                        throw 'Failed looping messages! ' + messageIds;
                    
                    pageCallback();
                });
            });
        }, 
        function() { return nextPageToken !== undefined && (!maxMessages || messagesCounter < maxMessages); },
        function() {
            var resultFilename = profile.emailAddress + '.mbox';
            var partFilenames = shell.ls('mbox_' + profile.emailAddress + '/*.mbox.part');
            
             var mergeBar = new ProgressBar('Merging files into a mbox... [:bar] :percent - (:current/:total) - :eta seconds left.', { 
                total: partFilenames.length, 
                complete: '=', 
                incomplete: ' ',
                width: 40 
            });
            
            var wstream = fs.createWriteStream(resultFilename, { flags: 'w', defaultEncoding: 'utf8' });
            
            async.eachSeries(partFilenames, function(partFilename, callback) {
                var rstream = fs.createReadStream(partFilename, { flags: 'r'});
                rstream.pipe(wstream, { end: false });
                mergeBar.tick(1);
                rstream.on('end', callback);
            }, function(err) {
                if (err)
                    throw 'Failed to merge files: ' + err;
                
                wstream.end();
            
                console.log('Cleaning up...')
                shell.rm('-rf', 'mbox_' + profile.emailAddress);
                
                console.log('All done! File ' + resultFilename + ' was created.');
                process.exit(0);
            });
        });
    });
});

