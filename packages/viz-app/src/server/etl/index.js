import { VError } from 'verror';
import { Router } from 'express';
import { maybeTagServer } from '../support/tagSession';

var sprintf     = require('sprintf-js').sprintf;
var bodyParser  = require('body-parser');
var multer      = require('multer');

var Log         = require('@graphistry/common').logger;
var slack       = require('@graphistry/common').slack;
var apiKey      = require('@graphistry/common').api;
var etl1        = require('./etl1.js');
var etl2        = require('./etl2.js');
var logger      = Log.createLogger('etlworker:index');

import { Observable, Subject } from 'rxjs';

const JSONParser = bodyParser.json({ limit: '384mb' }); // This is the uncompressed size
const formParser = multer({ storage: multer.memoryStorage() })
    .fields(
        Array.from({ length: 16 })
            .map((n, k) => ({ name: `data${k}`, maxCount: 1 }))
            .concat({ name: 'metadata', maxCount: 1 })
    );

export { etlWorker };
export default etlWorker;

// Express.App * Socket -> ()
function etlWorker(config, activeCB) {

    const app = Router();

    app.post('/etl', JSONParser, formParser, (req, res, next) => {
        activeCB(null, true);
        maybeTagServer(req);

        etlRequestHandler(req, res, next).subscribe({
            error: activeCB,
            complete: activeCB.bind(null, null, false)
        });
    }, function(err, req, res, next) {

        logger.error({req, res, err}, 'Express raised an error handling the ETL request.');

        if(res.headersSent) {
            let unseenError = new VError(err, 'Unable to report ETL request error to client because a response has already been sent. The error will only be logged here.');
            logger.warn({req, res, err});

            res.end();
            return;
        }

        res.status(500).send({ success: false, msg: err.message });

        activeCB(err);
    });

    return app;
}


// eslint-disable-next-line no-unused-vars
function etlRequestHandler(req, res, next) {
    const params = getETLParams(req.query);

    const requestPipeline = getETLHandler(params)
        .mergeMap((handler) => handler(req, params))
        .catch((err) => {
            logger.error({req, res, err}, 'Error processing ETL request');

            var verr = new VError(err, 'Error processing ETL request');
            res.status(500).send({ success: false, msg: 'Error processing ETL request' });

            return Observable.throw(verr);
        })
        .single()
        // Add 'viztoken' to returned results
        .map((info) => ({ ...info, viztoken: apiKey.makeVizToken(params.key, info.name) }))
        .do((info) => {
            const result = {
                success: true,
                dataset: info.name,
                viztoken: info.viztoken
            };
            if (params.echo) {
                sortedLabels && (result.labels = info.sortedLabels);
                unsortedEdges && (result.edges = info.unsortedEdges);
            }
            return res.status(200).send(result);
        })
        .concatMap(({ sortedLabels, unsortedEdges, ...info }) => {
            return notifySlackAndSplunk({...info, ...params}).ignoreElements();
        });

    return requestPipeline;
}


function getETLHandler(params) {
    switch (params.apiVersion) {
        case 0:
        case 1:
            return Observable.of(etl1.processRequest);
        case 2:
            return Observable.of(etl2.processRequest);
        default:
            return Observable.throw(new VError(`Unsupported API version: ${params.apiVersion}`));
    }
}


function getETLParams(query) {
    const {
        key, echo,
        apiversion = '0',
        usertag = 'unknown',
        agent = 'unknown',
        agentversion = '0.0.0'
    } = query;

    const apiVersionParsed =  parseInt(apiversion) || 0;

    return {
        key, agent, usertag,
        echo: echo !== undefined,
        agentVersion: agentversion,
        apiVersion: apiVersionParsed,
    };
}


// String * String * Sting * Object -> ()
function notifySlackAndSplunk({name, nodeCount, edgeCount, key, apiVersion, usertag, agent, agentVersion}) {
    function makeUrl(server) {
        var type = apiVersion === 2 ? 'jsonMeta' : 'vgraph';
        var domain;
        switch (server) {
            case 'staging':
                domain = 'http://staging.graphistry.com';
                break;
            case 'labs':
                domain = 'http://labs.graphistry.com';
                break;
            case 'localhost':
                domain = 'http://localhost:3000';
                break;
            default:
                domain = 'http://%s.graphistry.com';
        }
        var url = sprintf('%s/graph/graph.html?type=%s&dataset=%s&info=true',
                          domain, type, name);
        return sprintf('<%s|%s>', url, server);
    }

    function isInternal(keyToCheck) {
        var suffix = 'graphistry.com';
        return keyToCheck.slice(-suffix.length) === suffix;
    }

    var descryptedKey = '';
    if (key) {
        try {
            descryptedKey += apiKey.decrypt(key);
        } catch (err) {
            logger.error(err, 'Could not decrypt key');
            descryptedKey += ' COULD NOT DECRYPT';
        }
    } else {
        descryptedKey = 'n/a';
    }

    var links = sprintf('View on %s or %s or %s', makeUrl('labs'), makeUrl('staging'), makeUrl('localhost'));
    var title = sprintf('*New dataset:* `%s`', name);
    var tag = sprintf('`%s`', usertag.split('-')[0]);

    var msg = {
        channel: '#datasets',
        username: descryptedKey,
        text: '',
        attachments: JSON.stringify([{
            fallback: 'New dataset: ' + name,
            text: title + '\n' + links,
            color: isInternal(descryptedKey) ? 'good' : 'bad',
            fields: [
                { title: 'Nodes', value: nodeCount, short: true },
                { title: 'Edges', value: edgeCount, short: true },
                { title: 'API', value: apiVersion, short: true },
                { title: 'Machine Tag', value: tag, short: true },
                { title: 'Agent', value: agent, short: true },
                { title: 'Version', value: agentVersion, short: true }
            ],
            // eslint-disable-next-line camelcase
            mrkdwn_in: ['text', 'pretext', 'fields']
        }])
    };

    // Log info forwarded to Slack so we can access it in Splunk
    logger.info({
        user: descryptedKey,
        internal: isInternal(descryptedKey),
        dataset: name,
        tag: tag,
        params: { apiVersion, agent, agentVersion },
        nodes: nodeCount,
        edges: edgeCount,
    }, 'New dataset');

    const slackPost$ = Observable.bindNodeCallback(slack.post);

    return slackPost$(msg)
        .do({
            next(slackResult) {
                logger.trace({result: slackResult}, `Notified Slack about ETL results`);
            }
        })
        .catch((err) => {
            const slackError = new VError(err, 'Error posting to slack');
            logger.warn({err: slackError}, 'Error posting to slack');
            return Observable.empty();
        });
}
