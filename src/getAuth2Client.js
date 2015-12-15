var fs = require('fs'),
    open = require('open'),
    readline = require('readline');

var GoogleAuth = require('google-auth-library');

var SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
var TOKEN_DIR = './.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'gmail-token.json';

var SECRET_PATH = './client_secret.json';

function authorize(credentials, callback) {
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    var auth = new GoogleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, function (err, token) {
        if (err) {
            getNewToken(oauth2Client, callback);
        } else {
            oauth2Client.credentials = JSON.parse(token);
            callback(undefined, oauth2Client);
        }
    });
}

function getNewToken(oauth2Client, callback) {
    var authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    
    console.log('Opening browser to get authorization...');
    open(authUrl, 'asd', function(err) {
        if (err) {
            console.log('Failed to open browser. Please go to ' + authUrl);
        }
        
        var rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question('Enter the code from that page here: ', function (code) {
            rl.close();
            oauth2Client.getToken(code, function (err, token) {
                if (err)
                    throw 'Error while trying to retrieve access token ' + err;
                    
                oauth2Client.credentials = token;
                storeToken(token);
                callback(undefined, oauth2Client);
            });
        });
    });
}

function storeToken(token) {
    try {
        fs.mkdirSync(TOKEN_DIR);
    } catch (err) {
        if (err.code != 'EEXIST') {
            throw err;
        }
    }
    fs.writeFile(TOKEN_PATH, JSON.stringify(token));
    console.log('Token stored to ' + TOKEN_PATH);
}

module.exports = function (callback) {
    // Load client secrets from a local file.
    fs.readFile(SECRET_PATH, 'utf8', function (err, content) {
        if (err)
            throw 'Error loading client secret file: ' + err;

        // Authorize a client with the loaded credentials, then call the
        // Gmail API.
        authorize(JSON.parse(content), function(err, authClient) {
            if (err)
                throw 'Error getting auth client: ' + err;

            callback(null, authClient);
        });
    });
};