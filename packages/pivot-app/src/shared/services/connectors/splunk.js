import { DataFrame } from 'dataframe-js';
import { Observable } from 'rxjs';
import _ from 'underscore';
import splunkjs from 'splunk-sdk';
import objectHash from 'object-hash';
import VError from 'verror';
import logger from 'pivot-shared/logger';
import { Connector } from './connector.js';

const conf = global.__graphistry_convict_conf__;

class SplunkConnector extends Connector {
    constructor(config) {
        super(config);

        this.service = new splunkjs.Service({
            host: config.host,
            username: config.username,
            password: config.password,
            scheme: config.scheme,
            port: config.port
        });

        const metadata = { splunkHostName: config.host, splunkUser: config.username };
        this.log = logger.createLogger(__filename).child(metadata);

        this.slogin = Observable.bindNodeCallback(this.service.login.bind(this.service));
        this.getJob = Observable.bindNodeCallback(this.service.getJob.bind(this.service));
        this.runSearch = Observable.bindNodeCallback(this.service.search.bind(this.service));
    }

    healthCheck() {
        return this.slogin()
            .do(this.log.info('Health checks passed for splunk connnector'))
            .map(() => 'Health checks passed')
            .catch(({ error, status }) => {
                if (error) {
                    return Observable.throw(
                        new VError(
                            {
                                name: 'ConnectionError',
                                cause: error,
                                info: {
                                    splunkAddress: error.address,
                                    splunkPort: error.port,
                                    code: error.code
                                }
                            },
                            'Failed to connect to splunk instance at "%s:%d"',
                            error.address,
                            error.port
                        )
                    );
                } else if (status === 401) {
                    return Observable.throw(
                        new VError(
                            {
                                name: 'UnauthorizedSplunkLogin'
                            },
                            'Splunk Credentials are invalid'
                        )
                    );
                } else {
                    return Observable.throw(
                        new VError(
                            {
                                name: 'UnhandledStatus'
                            },
                            'Unknown response'
                        )
                    );
                }
            });
    }

    extractSplunkErrorMsg(splunkErr) {
        if (splunkErr.error && splunkErr.error.message) {
            return splunkErr.error.message;
        } else {
            const messages = (splunkErr.data || {}).messages || [];
            return messages !== []
                ? _.pluck(messages, 'text').join('\n')
                : 'Could not parse splunkErr object';
        }
    }

    getOrCreateJob(jobId, searchInfo) {
        this.log.debug(searchInfo, 'Tentatively fetching cached results for job: "%s"', jobId);

        return this.getJob(jobId)
            .catch(splunkErr => {
                if (splunkErr.response.statusCode === 404) {
                    const splunkMsgs = this.extractSplunkErrorMsg(splunkErr);
                    this.log.debug(
                        { splunkMsgs: splunkMsgs },
                        'No job was found, creating new search job'
                    );

                    const { query, searchParams } = searchInfo;
                    return this.runSearch(query, searchParams).switchMap(job =>
                        Observable.bindNodeCallback(job.fetch.bind(job))()
                    );
                } else {
                    return Observable.throw(splunkErr);
                }
            })
            .catch(splunkErr => {
                return Observable.throw(
                    new VError(
                        { name: 'SplunkSearchError', info: searchInfo },
                        `Splunk returned an error: ${this.extractSplunkErrorMsg(splunkErr)}`
                    )
                );
            });
    }

    retrieveJobResults(job, searchInfo) {
        const props = job.properties();

        this.log.debug(
            {
                sid: job.sid,
                eventCount: props.eventCount,
                resultCount: props.resultCount,
                runDuration: props.runDuration,
                messages: props.messages,
                ttl: props.ttl
            },
            'Search job properties'
        );
        this.log.info(props, 'All job properties');

        const getResults = Observable.bindNodeCallback(job.results.bind(job));
        const timeLimitMsg = props.messages.find(msg =>
            msg.text.startsWith('Search auto-finalized after time limit')
        );

        const t0 = Date.now();
        return getResults({ count: props.resultCount, output_mode: 'json_cols' })
            .do(() => { this.log.info('Splunk result download time', Date.now() - t0, 'ms'); })
            .map(args => ({
                results: args[0],
                job: args[1],
                props: {
                    ...props,
                    isPartial: timeLimitMsg !== undefined
                }
            }))
            .catch(splunkErr => {
                return Observable.throw(
                    new VError(
                        { name: 'SplunkReadResultError', info: searchInfo },
                        `Splunk returned an error: ${this.extractSplunkErrorMsg(splunkErr)}`
                    )
                );
            });
    }

    search(query, searchParamOverrides = {}) {
        // Generate a hash for the query so we can look it up in splunk
        const hash =
            conf.get('splunk.jobCacheTimeout') > 0
                ? objectHash.MD5({ q: query, p: searchParamOverrides })
                : Date.now();
        const jobId = `pivotapp${hash}`;

        // Set the splunk search parameters
        const searchParams = {
            ...SplunkConnector.searchParamDefaults,
            ...searchParamOverrides,
            id: jobId
        };
        const searchInfo = { query, searchParams };

        return this.getOrCreateJob(jobId, searchInfo)
            .switchMap(job => this.retrieveJobResults(job, searchInfo))
            .map(({ results, job, props }) => {
                const columns = results.fields.reduce((result, field, index) => {
                    result[field] = results.columns[index];
                    return result;
                }, {});
                const df = new DataFrame(columns, results.fields);

                return {
                    resultCount: props.resultCount,
                    isPartial: props.isPartial,
                    events: df.toCollection(),
                    df: df,
                    searchId: job.sid
                };
            });
    }
}

SplunkConnector.searchParamDefaults = {
    timeout: Math.max(0, conf.get('splunk.jobCacheTimeout')),
    exec_mode: 'blocking',
    earliest_time: '-7d',
    max_time: conf.get('splunk.searchMaxTime')
};

export const splunkConnector0 = new SplunkConnector({
    id: 'splunk-connector',
    name: 'Splunk',
    host: conf.get('splunk.host'),
    username: conf.get('splunk.user'),
    password: conf.get('splunk.key'),
    scheme: conf.get('splunk.scheme'),
    port: conf.get('splunk.port')
});
