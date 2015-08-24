'use strict';

/**

Encrypt/decrypt using config API settings. Throw error if encrypted without including canary value.

For convenience, rate-limited https encryption endpoint: /api/encrypt?plaintext=zzzz .

Same with decrypt, except take care not to reveal canary

(Allow http for localhost)

**/

var crypto = require('crypto');
var _      = require('underscore');
var config = require('config')();
var logger = require('./logger.js').createLogger('central:api');


// cleartext (with canary) -> ciphertext
// encrypt
function encrypt (cleartext) {
    var cipher = crypto.createCipher(config.API.ALGORITHM, config.API.SECRET);
    return cipher.update(cleartext, 'utf8', 'hex') + cipher.final('hex');
}


// ciphertext ->  plaintext, throws Error("Missing canary")
// return decrypted (& strip canary). if canary missing, throw error, else remove.
function decrypt (ciphertext) {
    var decipher = crypto.createDecipher(config.API.ALGORITHM, config.API.SECRET);
    var cleartext = decipher.update(ciphertext, 'hex', 'utf8') + decipher.final('utf8');
    var canaryOffset = cleartext.length - config.API.CANARY.length;
    var canary = cleartext.slice(canaryOffset);
    if (canary !== config.API.CANARY) {
        throw new Error("Missing canary");
    }
    return cleartext.slice(0, canaryOffset);
}

function checkSSL(req) {
    //TODO make an error once prod ssl server enabled
    if (!req.secure && (config.ENVIRONMENT !== 'local')) {
        logger.warn('/encrypt needs https when not local');
        //return res.json({error: 'requires https'});
    }
}


function init (app) {
    var nextEta = Date.now();

    // https://.../api/encrypt?text=... => {encrypted: string} + {error: string}
    // allow at most 1 req per second
    // allow unsecure local
    app.get('/api/encrypt', function(req, res) {
        logger.info('encrypting', req.query.text);

        checkSSL(req);

        //immediate if not used in awhile, otherwise in 1s after next queued
        var now = Date.now();
        nextEta = Math.max(now, nextEta + 1000);
        setTimeout(
            function () {
                try {
                    res.json({success: true, encrypted: encrypt(req.query.text)});
                } catch (err) {
                    logger.error(err, 'encrypter');
                    res.json({success: false, error: 'failed to encrypt'});
                }
            },
            nextEta - now);
    });

    // https://.../api/decrypt?text=... => {decrypted: string} + {error: string}
    // allow at most 1 req per second
    // allow unsecure local
    function decryptOrCheck(checkOnly, req, res) {
        logger.info('decrypting', req.query.text);

        checkSSL(req);

        //immediate if not used in awhile, otherwise in 1s after next queued
        var now = Date.now();
        nextEta = Math.max(now, nextEta + 1000);
        setTimeout(
            function () {
                try {
                    var payload = {success: true, decrypted: decrypt(req.query.text)};
                    res.json(checkOnly ? _.omit(payload, 'decrypted') : payload);
                } catch (err) {
                    logger.error(err, 'decrypter');
                    res.json({success: false, error: 'Invalid key'});
                }
            },
            nextEta - now);
    }

    app.get('/api/decrypt', decryptOrCheck.bind('', false));
    app.get('/api/check', decryptOrCheck.bind('', true));
}


module.exports = {
    init: init,
    encrypt: encrypt,
    decrypt: decrypt
};
