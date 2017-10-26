const convict = require('convict');

const { Tracer, BatchRecorder } = require('zipkin');
const CLSContext = require('zipkin-context-cls');
const { HttpLogger } = require('zipkin-transport-http');

// Send spans to Zipkin asynchronously over HTTP
const host = config.get('zipkin.host');
const port = config.get('zipkin.port');
const path = config.get('zipkin.path');
const zipkinBaseUrl = `${host}:${port}/${path}`;

const recorder = new BatchRecorder({
    logger: new HttpLogger({
        endpoint: `${zipkinBaseUrl}/api/v1/spans`
    })
});

const ctxImpl = new CLSContext('zipkin');
const tracer = new Tracer({ ctxImpl, recorder });

module.exports = tracer;
