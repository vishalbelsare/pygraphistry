const client = require('prom-client');

const collectDefaultMetrics = client.collectDefaultMetrics;

// Probe every 5th second.
collectDefaultMetrics({ timeout: 5000 });

module.exports = {
    createCounter: opts => new client.Counter(opts),
    createGauge: opts => new client.Gauge(opts),
    createHistogram: opts => new client.Histogram(opts),
    createSummary: opts => new client.Summary(opts),
    getMetrics: () => client.register.metrics(),
    getRawPrometheusClient: () => client
};
