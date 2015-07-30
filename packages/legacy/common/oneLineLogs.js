#!/usr/bin/env node
'use strict';

var readline = require('readline');
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

var lastDate;
rl.on('line', function (line) {
    try {
        var log = JSON.parse(line);
        if (log.msg === undefined || !log.level === undefined) {
            console.log(line);
            return;
        }

        if (log.level === 50) {
            console.log(line);
            return;
        }

        var str = '[' + log.module + '][' + log.level + '] ' + log.msg;
        var date = new Date(log.time);

        var timeDeltaMs;
        if (!lastDate) {
            timeDeltaMs = 0;
        } else {
            timeDeltaMs = date - lastDate;
        }
        lastDate = date;

        str += '\t+' + timeDeltaMs + 'ms';
        console.log(str);

    } catch (err) {
        console.log(line);
    }
});
