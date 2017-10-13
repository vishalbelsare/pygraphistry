'use strict';

/**

Encrypt/decrypt using config API settings. Throw error if encrypted without including canary value.

For convenience, rate-limited https encryption endpoint: /api/encrypt?plaintext=zzzz .

Same with decrypt, except take care not to reveal canary

(Allow http for localhost)

**/

var crypto = require('crypto');
var _ = require('underscore');
var config = require('@graphistry/config')();
var logger = require('./logger.js').createLogger('central:api');

// cleartext (with canary) -> ciphertext
// encrypt
function encrypt(cleartext) {
    var cipher = crypto.createCipher(config.API.ALGORITHM, config.API.SECRET);
    return cipher.update(cleartext, 'utf8', 'hex') + cipher.final('hex');
}

// cleartext -> ciphertext
// Add the canary before calling encrypt().
function provision(cleartext) {
    return encrypt(cleartext + config.API.CANARY);
}

// ciphertext ->  plaintext, throws Error("Missing canary")
// return decrypted (& strip canary). if canary missing, throw error, else remove.
function decrypt(ciphertext) {
    var decipher = crypto.createDecipher(config.API.ALGORITHM, config.API.SECRET);
    var cleartext = decipher.update(ciphertext, 'hex', 'utf8') + decipher.final('utf8');
    var canaryOffset = cleartext.length - config.API.CANARY.length;
    var canary = cleartext.slice(canaryOffset);
    if (canary !== config.API.CANARY) {
        throw new Error('Missing canary');
    }
    return cleartext.slice(0, canaryOffset);
}

// Key (ciphertext) * String -> String
function makeVizToken(key, datasetName) {
    try {
        var who = decrypt(key);
    } catch (err) {
        return undefined;
    }

    var sha1 = crypto.createHash('sha1');
    sha1.update(who);
    sha1.update(datasetName);
    return sha1.digest('hex');
}

function init(app) {
    var nextEta = Date.now();
    var maxReqRate = 1000;

    // https://.../api/encrypt?text=... => {encrypted: string} + {error: string}
    // allow at most 1 req per second
    app.get('/api/encrypt', function(req, res) {
        logger.info('encrypting', req.query.text);

        //immediate if not used in awhile, otherwise in 1s after next queued
        var now = Date.now();
        nextEta = Math.max(now, nextEta + maxReqRate);
        setTimeout(function() {
            try {
                res.json({ success: true, encrypted: encrypt(req.query.text) });
            } catch (err) {
                logger.error(err, 'encrypter');
                res.json({ success: false, error: 'failed to encrypt' });
            }
        }, nextEta - now);
    });

    app.get('/api/internal/provision', function(req, res) {
        logger.info('provisioning', req.query.text);
        try {
            res.json({ success: true, encrypted: provision(req.query.text) });
        } catch (err) {
            logger.error(err, 'encrypter');
            res.json({ success: false, error: 'failed to encrypt' });
        }
    });

    // https://.../api/decrypt?text=... => {decrypted: string} + {error: string}
    // allow at most 1 req per second
    // allow unsecure local
    function decryptOrCheck(checkOnly, req, res) {
        logger.info('decrypting', req.query.text);

        //immediate if not used in awhile, otherwise in 1s after next queued
        var now = Date.now();
        nextEta = Math.max(now, nextEta + maxReqRate);
        setTimeout(function() {
            try {
                var payload = {
                    success: true,
                    decrypted: decrypt(req.query.text),
                    pygraphistry: {
                        minVersion: config.PYGRAPHISTRY.minVersion,
                        latestVersion: config.PYGRAPHISTRY.latestVersion
                    }
                };
                res.json(checkOnly ? _.omit(payload, 'decrypted') : payload);
            } catch (err) {
                logger.info('/api/(decrypt|check): Invalid key');
                res.json({ success: false, error: 'Invalid key' });
            }
        }, nextEta - now);
    }

    app.get('/api/decrypt', decryptOrCheck.bind('', false));
    app.get('/api/check', decryptOrCheck.bind('', true));
}

module.exports = {
    init: init,
    encrypt: encrypt,
    decrypt: decrypt,
    makeVizToken: makeVizToken
};
