var shell = require('shelljs'),
    base64url = require('base64url'),
    moment = require('moment'),
    async = require('async');

var google = require('googleapis'),
    gmail = google.gmail('v1'),
    getAuth2Client = require('./getAuth2Client');

if (!shell.test('-e', 'mbox')) {
    shell.mkdir('mbox');
}

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
            var wstream = require('fs').createWriteStream('mbox/' + message.id + '.eml');
            
            var threadId = parseInt(message.threadId, 16);
            var date = moment(parseInt(message.internalDate, 10)).format('ddd MMM DD HH:mm:ss YYYY');
            var labelStr = getLabelsFromMessage(labels, message);
            
            //wstream.write('From ' + threadId + '@xxx ' + date + '\r\n');
            wstream.write('X-GM-THRID: ' + threadId + '\r\n');
            wstream.write('X-GM-DATE: ' + date + '\r\n');
            
            if (labelStr && labelStr.length != 0) {
                wstream.write('X-Gmail-Labels: ' + labelStr + '\r\n');
            }
            
            wstream.write(base64url.decode(message.raw));
            //wstream.write('\r\n');
                            
            wstream.end();
        };
                
        console.log('Getting messages...');


        var maxPageResults = 200;
        var nextPageToken = undefined;
        
        // While there is a nextPageToken:
        async.doWhilst(function(pageCallback) {
            async.retry({times: 5, interval: 500}, async.apply(gmail.users.messages.list, { auth: auth, userId: 'me', maxResults: maxPageResults, pageToken: nextPageToken }), function(err, response) {
                if (err) {
                    throw 'Failed getting message list! ' + nextPageToken;    
                }
                
                nextPageToken = response.nextPageToken;
                var messageIds = response.messages.map(function(m) { return m.id; });
                
                // For each message in page:
                async.eachSeries(messageIds, function(messageId, callback) {
                    messagesCounter++;
                    
                    if (shell.test('-e', 'mbox/' + messageId + '.eml')) {
                        console.log('Skipped message ' + messagesCounter + ' of ' + messagesTotal + ': File found.');
                        async.setImmediate(function () { callback(); });
                        return;
                    }
                    
                    async.retry({times: 5, interval: 500}, async.apply(gmail.users.messages.get, { auth: auth, userId: 'me', id: messageId, format: 'raw' }), function(err, message) {
                        if (err) {
                            throw 'Failed getting message! ' + messageId;    
                        }
                
                        writeMessageToFile(message);
                        console.log('Got message ' + messagesCounter + ' of ' + messagesTotal + '.');
                        callback();
                    });
                }, function(err) {
                    if (err) {
                        throw 'Failed looping messages! ' + messageIds;
                    }
                    
                    pageCallback();
                });
            });
        }, function() { return nextPageToken !== undefined; },
        function() { 
            console.log('All done!');
            process.exit(0);
        });
    });
});

