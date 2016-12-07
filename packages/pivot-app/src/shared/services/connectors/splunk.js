import { DataFrame, Row } from 'dataframe-js';
import { Observable } from 'rxjs';
import _ from 'underscore';
import splunkjs from 'splunk-sdk';
import objectHash from 'object-hash';
import VError from 'verror';
import logger from '../../../shared/logger.js';
import conf from '../../../server/config.js';
import { Connector } from '.';


class SplunkConnector extends Connector {
    constructor(config) {
        super(config);

        this.service = new splunkjs.Service({
            host: config.host,
            username:  config.username,
            password: config.password,
        });

        const metadata = { splunkHostName: config.host, splunkUser: config.user };
        this.log = logger.createLogger('pivot-app', __filename).child(metadata);

        this.slogin = Observable.bindNodeCallback(this.service.login.bind(this.service));
        this.getJob = Observable.bindNodeCallback(this.service.getJob.bind(this.service));
        this.runSearch = Observable.bindNodeCallback(this.service.search.bind(this.service));
    }

    healthCheck() {
        return this.slogin()
            .do(this.log.info('Health checks passed for splunk connnector'))
            .map(() => 'Health checks passed')
            .catch(({error, status}) => {
                if (error) {
                    return Observable.throw(
                        new VError({
                            name: 'ConnectionError',
                            cause: error,
                            info: {
                                splunkAddress: error.address,
                                splunkPort: error.port,
                                code: error.code,
                            }
                        }, 'Failed to connect to splunk instance at "%s:%d"', error.address, error.port)
                    );
                } else if (status === 401) {
                    return Observable.throw(
                        new VError({
                            name: 'UnauthorizedSplunkLogin',
                        }, 'Splunk Credentials are invalid')
                    );
                } else {
                    return Observable.throw(
                        new VError({
                            name: 'UnhandledStatus',
                        }, 'Unknown response')
                    );
                }
            });
    }

    getOrCreateJob(jobId, searchInfo) {
        this.log.debug(searchInfo, 'Tentatively fetching cached results for job: "%s"', jobId);

        return this.getJob(jobId)
            .catch(splunkErr => {
                if (splunkErr.response.statusCode === 404) {
                    const splunkMsgs = _.pluck(splunkErr.data.messages, 'text');
                    this.log.debug({splunkMsgs: splunkMsgs}, 'No job was found, creating new search job');

                    const { query, searchParams } = searchInfo;
                    return this.runSearch(query, searchParams)
                        .switchMap(job =>
                            Observable.bindNodeCallback(job.fetch.bind(job))()
                        );
                }
            })
            .catch(splunkErr => {
                const msg = _.pluck(splunkErr.data.messages, 'text').join('\n');
                return Observable.throw(
                    new VError({name: 'SplunkSearchError', info: searchInfo}, msg)
                )
            });
    }

    retrieveJobResults(job) {
        const props = job.properties();

        this.log.debug({
            sid: job.sid,
            eventCount: props.eventCount,
            resultCount: props.resultCount,
            runDuration: props.runDuration,
            messages: props.messages,
            ttl: props.ttl
        }, 'Search job properties');
        this.log.trace(props, 'All job properties');

        const getResults = Observable.bindNodeCallback(job.results.bind(job));
        const timeLimitMsg = props.messages.find(msg =>
            msg.text.startsWith('Search auto-finalized after time limit')
        );

        return getResults({count: props.resultCount, output_mode: 'json_cols'})
            .map(args => ({
                results: args[0],
                job: args[1],
                props: {
                    ...props,
                    isPartial: timeLimitMsg !== undefined
                }
            }))
            .catch(splunkErr => {
                const msg = _.pluck(splunkErr.data.messages, 'text').join('\n');
                return Observable.throw(
                    new VError({name: 'SplunkReadResultError', info: searchInfo}, msg)
                )
            });
    }

    search(query, searchParamOverrides = {}) {
        // Generate a hash for the query so we can look it up in splunk
        const hash = conf.get('splunk.jobCacheTimeout') > 0 ? objectHash.MD5({q: query, p: searchParamOverrides})
                                                            : Date.now();
        const jobId = `pivot-app::${hash}`;

        // Set the splunk search parameters
        const searchParams = {
            ...SplunkConnector.searchParamDefaults,
            ...searchParamOverrides,
            id: jobId,
        };
        const searchInfo = { query, searchParams };

        return this.getOrCreateJob(jobId, searchInfo)
            .switchMap(job =>
                this.retrieveJobResults(job)
            )
            .map(({results, job, props}) => {
                const columns = {};
                results.fields.map((field, i) => {
                    columns[field] = results.columns[i];
                });
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
    id:'splunk-connector',
    name : 'Splunk',
    host: conf.get('splunk.host'),
    username: conf.get('splunk.user'),
    password: conf.get('splunk.key'),
});
