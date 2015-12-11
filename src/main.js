var q = require('q'),
    base64url = require('base64url'),
    moment = require('moment'),
    google = require('googleapis');

var ProgressBar = require('progress');

var getAuth2Client = require('./getAuth2Client');

var capitalizeFirstLetter = function(string) {
    return string[0].toUpperCase() + string.slice(1);
};

var getLabels = function(auth) {
    var deferred = q.defer();
    var gmail = google.gmail('v1');
    
    gmail.users.labels.list({
        auth: auth,
        userId: 'me'
    }, function(err, response) {
        if (err) {
            deferred.reject('The API returned an error: ' + err);
            return;
        }
        
        deferred.resolve(response.labels);
    });
    
    return deferred.promise;
};

var getMessages = function(auth) {
    var deferred = q.defer();
    var gmail = google.gmail('v1');
    
    gmail.users.messages.list({
        auth: auth,
        userId: 'me',
        maxResults: 20
    }, function(err, response) {
        if (err) {
            deferred.reject('The API returned an error: ' + err);
            return;
        }
        
        deferred.resolve(response.messages);
    });
    
    return deferred.promise;
};

var getMessage = function(auth, id) {
    var deferred = q.defer();
    var gmail = google.gmail('v1');
    
    gmail.users.messages.get({
        auth: auth,
        id: id,
        userId: 'me',
        format: 'raw'
    }, function(err, response) {
        if (err) {
            deferred.reject('The API returned an error: ' + err);
            return;
        }
        
        deferred.resolve(response);
    });
    
    return deferred.promise;
};

var getLabelsFromMessage = function(labels, message) {
    if (!labels || !message.labelIds || message.labelIds.length === 0)
        return '';
        
    return message.labelIds
        .map(function(labelId) {
            var label = labels.find(function(l) { return l.id === labelId; });
            return (label && label.name) ? capitalizeFirstLetter(label.name) : undefined;
        })
        .filter(function(l) { return l !== undefined })
        .join();
    };

var bar = new ProgressBar(':msg :bar', { total: 5 });

getAuth2Client().then(function (auth) {
  
    bar.tick({ msg: 'Getting labels...' });
    return getLabels(auth).then(function(labels) { return [auth, labels] });
    
}).spread(function(auth, labels) {
    
    bar.tick({ msg: 'Getting message ids...' });
    return getMessages(auth).then(function(messageIds) { return [auth, labels, messageIds] });
    
}).spread(function(auth, labels, messageIds) {
    
    bar.tick({ msg: 'Getting messages...' });
    var promises = messageIds.map(function(mId) { return getMessage(auth, mId.id); });
    return q.all(promises).then(function(messages) { return [auth, labels, messages] });
    
}).spread(function(auth, labels, messages) {
    bar.tick({ msg: 'Writing into file...' });

    var fs = require('fs');
    var wstream = fs.createWriteStream('test.mbox');

    for(var i = 0; i < messages.length; i++) {
        var message = messages[i];
        
        var threadId = parseInt(message.threadId, 16);
        var date = moment(parseInt(message.internalDate, 10)).format('ddd MMM DD HH:mm:ss ZZ YYYY');
        var labelStr = getLabelsFromMessage(labels, message);
        
        wstream.write('From ' + threadId + '@xxx ' + date + '\r\n');
        wstream.write('X-GM-THRID: ' + threadId + '\r\n');
        
        if (labelStr && labelStr.length != 0) {
             wstream.write('X-Gmail-Labels: ' + labelStr + '\r\n');
        }
        
        wstream.write(base64url.decode(message.raw));
        wstream.write('\r\n');
    }
        
    wstream.end();
    
    bar.tick({ msg: 'All done!' });
    
}).catch(function(err) {
   console.log('Error: ', err);
});

