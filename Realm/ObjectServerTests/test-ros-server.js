const ROS = require('realm-object-server');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

// Bypass the mandatory email prompt.
process.env.ROS_TOS_EMAIL_ADDRESS = 'ci@realm.io';
process.env.DOCKER_DATA_PATH = '/tmp';

// Don't bother calling fsync() because we're throwing away all the files
// between runs anyway
process.env.REALM_DISABLE_SYNC_TO_DISK = 'true';

// Workaround for <https://github.com/realm/realm-object-server-private/issues/950>.
process.env.ROS_SUPERAGENT_RETRY_DELAY = '0';

// Enable timestamps in the logs
process.env.ROS_LOG_TIMESTAMP = '1';

// Accept invalid TLS certificates so that the ROS services can talk to each
// other despite using a self-signed certificate
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

if (!process.env.SYNC_WORKER_FEATURE_TOKEN) {
    try {
        require(os.homedir() + '/.ros-feature-token.js');
    }
    catch (e) {
        console.error('ROS feature token not found. Running Object Server tests requires setting the SYNC_WORKER_FEATURE_TOKEN environment variable.');
        process.exit(1);
    }
}

// A "email handler" which actually just writes the tokens to files that the
// tests can read
class PasswordEmailHandler {
    constructor(dataRoot) {
        this.dataRoot = dataRoot;
        fs.mkdirSync(this.dataRoot);
    }

    resetPassword(email, token, userAgent, remoteIp) {
        fs.writeFileSync(path.join(this.dataRoot, email), token);
        return new Promise(r => setTimeout(r, 0));
    }

    confirmEmail(email, token) {
        fs.writeFileSync(path.join(this.dataRoot, email), token);
        return new Promise(r => setTimeout(r, 0));
    }
}

const server = new ROS.BasicServer();
server.start({
    // The desired logging threshold. Can be one of: all, trace, debug, detail, info, warn, error, fatal, off)
    logLevel: 'off',

    // For all the full list of configuration parameters see:
    // https://realm.io/docs/realm-object-server/latest/api/ros/interfaces/serverconfig.html

    address: '0.0.0.0',
    port: 9080,
    httpsPort: 9443,

    https: true,
    httpsKeyPath: __dirname + '/certificates/localhost-cert-key.pem',
    httpsCertChainPath: __dirname + '/certificates/localhost-cert.pem',

    dataPath: process.argv[2],
    authProviders: [
        new ROS.auth.DebugAuthProvider(),
        new ROS.auth.PasswordAuthProvider({
            autoCreateAdminUser: true,
            emailHandler: new PasswordEmailHandler(path.join(process.argv[2], 'email')),
        }),
    ],
    autoKeyGen: true,
    serviceAgent: new https.Agent({rejectUnauthorized: false})
}).then(() => {
    console.log('started');
    fs.closeSync(1);
}).catch(err => {
    console.error(`Error starting Realm Object Server: ${err.message}`)
});
