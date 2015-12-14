var q = require('q'),
    base64url = require('base64url'),
    moment = require('moment'),
    ProgressBar = require('progress');

var getAuth2Client = require('./getAuth2Client'),
    getStuff = require('./getStuff');

getAuth2Client()
    .then(function (auth) {
        console.log('Getting profile...');
        return getStuff.getProfile(auth).then(function(profile) { return [auth, profile] });
    })
    .spread(function (auth, profile) {
        console.log('Getting labels...');
        return getStuff.getLabels(auth).then(function(labels) { return [auth, profile, labels] });
    })
    .spread(function(auth, profile, labels) {
        var wstream = require('fs').createWriteStream('test.mbox', { flags: 'a' });
        var bar = new ProgressBar(':msg [:bar] :percent :etas', { total: profile.messagesTotal, width: 40 });
        
        var getNextPage = function(pageToken) {
            return getStuff.getMessageIds(auth, 5, pageToken)
                .then(function(response) {
                    bar.tick(5, { msg: 'Getting messages...' });
                    var promises = response.messages.map(function(mId) { return getStuff.getMessage(auth, mId.id); });
                    return q.all(promises).then(function(messages) { return [response.nextPageToken, messages]});
                })
                .spread(function(pageToken, messages) {
                    for(var i = 0; i < messages.length; i++) {
                        var message = messages[i];
                        
                        var threadId = parseInt(message.threadId, 16);
                        var date = moment(parseInt(message.internalDate, 10)).format('ddd MMM DD HH:mm:ss YYYY');
                        var labelStr = getStuff.getLabelsFromMessage(labels, message);
                        
                        wstream.write('From ' + threadId + '@xxx ' + date + '\r\n');
                        wstream.write('X-GM-THRID: ' + threadId + '\r\n');
                        
                        if (labelStr && labelStr.length != 0) {
                            wstream.write('X-Gmail-Labels: ' + labelStr + '\r\n');
                        }
                        
                        wstream.write(base64url.decode(message.raw));
                        wstream.write('\r\n');
                    }
                    
                    return pageToken;
                })
                .then(function(pageToken) {
                    return getNextPage(pageToken);
                });
        };

        return getNextPage().then(function() { wstream.end(); });
    })
    .catch(function(err) {
        console.log('Error: ', err);
    })
    .done(function() {
        console.log('All done!');
    });

