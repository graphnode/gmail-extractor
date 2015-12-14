var google = require('googleapis'),
    q = require('q');

var normalizeLabel = function(str) {
    if (str !== str.toUpperCase())
        return str;
    
    return str.toLowerCase().replace( /[\s_-](.)|^(.)/g, function($1) { return $1.toUpperCase(); });
};

module.exports = {
    
    getProfile: function (auth) {
        var deferred = q.defer();
        var gmail = google.gmail('v1');

        gmail.users.getProfile({
            auth: auth,
            userId: 'me'
        }, function (err, response) {
            if (err) {
                deferred.reject('The API returned an error: ' + err);
                return;
            }

            deferred.resolve(response);
        });

        return deferred.promise;
    },

    getLabels: function (auth) {
        var deferred = q.defer();
        var gmail = google.gmail('v1');

        gmail.users.labels.list({
            auth: auth,
            userId: 'me'
        }, function (err, response) {
            if (err) {
                deferred.reject('The API returned an error: ' + err);
                return;
            }

            deferred.resolve(response.labels);
        });

        return deferred.promise;
    },

    getMessageIds: function (auth, maxResults, pageToken) {
        var deferred = q.defer();
        var gmail = google.gmail('v1');

        gmail.users.messages.list({
            auth: auth,
            userId: 'me',
            maxResults: maxResults,
            pageToken: pageToken
        }, function (err, response) {
            if (err) {
                deferred.reject('The API returned an error: ' + err);
                return;
            }

            deferred.resolve(response);
        });

        return deferred.promise;
    },

    getMessage: function (auth, id) {
        var deferred = q.defer();
        var gmail = google.gmail('v1');

        gmail.users.messages.get({
            auth: auth,
            id: id,
            userId: 'me',
            format: 'raw'
        }, function (err, response) {
            if (err) {
                deferred.reject('The API returned an error: ' + err);
                return;
            }

            deferred.resolve(response);
        });

        return deferred.promise;
    },

    getLabelsFromMessage: function (labels, message) {
        if (!labels || !message.labelIds || message.labelIds.length === 0)
            return '';

        return message.labelIds
            .map(function (labelId) {
                var label = labels.find(function (l) { return l.id === labelId; });
                return (label && label.name) ? normalizeLabel(label.name) : undefined;
            })
            .filter(function (l) { return l !== undefined })
            .join();
    }
}