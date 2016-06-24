'use strict';

/* Inspired by https://github.com/idw111/slack-write */

var _           = require('underscore');
var querystring = require('querystring');
var request     = require('request');
var config      = require('@graphistry/config')();

var defaults = {
    username: 'Bob should set a username',
    channel: '#general',
    token: config.SLACK_BOT_ETL_TOKEN
}

function post(payload, done) {
    var params = _.extend({}, defaults, payload);

    if (params.token === undefined) {
        return done(true, 'No slack token');
    }

    var url = 'https://slack.com/api/chat.postMessage?' + querystring.stringify(params);
    request.get({url: url, json: true}, function(err, res, result) {
        if (err === null && 'ok' in result && !result.ok) {
            return done(result.ok, result);
        }
        return done(err, result);
    });
}

module.exports = {
    post: post
};
