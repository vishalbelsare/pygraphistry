'use strict';

var fs      = require('fs');
var path    = require('path');
var fstools = require('fs-tools');
var crypto  = require('crypto');
var Q       = require('q');
var debug   = require('debug')('graphistry:common:cache');
var _       = require('underscore');
//var util    = require('./util.js');


function Cache(cacheDir, enabled) {
    if (enabled) {
        // Make sure caching directory exists
        fstools.mkdirSync(cacheDir, '0777');
    }

    function getCacheFile(url) {
        var hash = crypto.createHash('sha1').update(url.href).digest('hex');
        var fileName = encodeURIComponent(url.pathname) + '.' + hash;
        return path.resolve(cacheDir, fileName);
    }

    this.get = function(url, timestamp) {
        var res = Q.defer();

        var filePath = getCacheFile(url);
        Q.denodeify(fs.stat)(filePath).then(function (stats) {
            if (!stats.isFile()) {
                res.reject('Error: Cached dataset is not a file!');
            } else if (stats.mtime.getTime() > timestamp.getTime()) {
                debug('Found up-to-date dataset in cache');
                res.resolve(fs.readFileSync(filePath));
            } else {
                debug('Found obsolete dataset in cache (%s), ignoring...', stats.mtime);
                res.reject();
            }
        }).fail(function (err) {
            debug('No matching dataset found in cache', err);
            res.reject(err);
        });

        return res.promise;
    };


    this.put = function(url, data) {
        if (!enabled)
            return Q();

        var path = getCacheFile(url);
        return Q.denodeify(fs.writeFile)(path, data, {encoding: 'utf8'}).then(
            function () {
                debug('Dataset saved in cache:', path);
            },
            //util.makeErrorHandler('Failure while caching dataset')
            function () {
                console.error('Failure while caching dataset');
            }
        );
    };
}

module.exports = Cache;
