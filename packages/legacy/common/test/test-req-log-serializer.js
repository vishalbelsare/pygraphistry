'use strict';

var commonLogger = require('../logger.js');
var logger = commonLogger.createLogger('foo');

var req = {
    "method": "GET",
    "url": "/vbo?id=6HQtG-cqlHvXRX2fAAAA&buffer=curPoints",
    "headers": {
        "host": "staging.example.com",
        "x-real-ip": "1.2.3.4",
        "x-forwarded-for": "5.6.7.8",
        "x-forwarded-proto": "https",
        "connection": "close",
        "x-graphistry-prefix": "/worker/10012",
        "authorization": "Basic XXXXXXXXXXXX",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36",
        "accept": "*/*",
        "referer": "https://staging.example.com/graph/graph.html?dataset=Miserables&workbook=1234",
        "accept-encoding": "gzip, deflate, sdch, br",
        "accept-language": "en-US,en;q=0.8",
        "cookie": "foo=bar;",
        "if-none-match": "W/\"XXXX\""
    },
    "remoteAddress":"172.18.0.7",
    "remotePort":38312
};

logger.info({req: req}, 'A requst came in');
