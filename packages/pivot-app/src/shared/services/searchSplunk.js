import splunkjs from 'splunk-sdk';
import stringHash from 'string-hash';
import { Observable } from 'rxjs';
import logger from '../logger.js';
import conf from '../../server/config.js';
import VError from 'verror';

const SPLUNK_HOST = conf.get('splunk.host');
const SPLUNK_USER = conf.get('splunk.user');
const SPLUNK_PWD = conf.get('splunk.key');

const metadata = { splunkHostName: SPLUNK_HOST, splunkUser: SPLUNK_USER }
const log = logger.createLogger('pivot-app', __filename).child(metadata);

const service = new splunkjs.Service({
    host: SPLUNK_HOST,
    username: SPLUNK_USER,
    password: SPLUNK_PWD
});

const splunkLogin = Observable.bindNodeCallback(service.login.bind(service));
const splunkGetJob = Observable.bindNodeCallback(service.getJob.bind(service));
const splunkSearch = Observable.bindNodeCallback(service.search.bind(service));

export function searchSplunk({app, pivot}) {

    const query = pivot.searchQuery;

    // Generate a hash for the query so we can look it up in splunk
    const jobId = `pivot-app::${stringHash(query)}`;

    // Set the splunk search parameters
    const searchParams = {
        id: jobId,
        timeout: '14400', // 4 hours
        exec_mode: 'blocking',
        earliest: '-7d'
    };

    // Used to indentifity logs
    const searchInfo = { query, searchParams };
    log.debug( searchInfo,'Fetching results for splunk job: "%s"', jobId);

    // TODO Add this as part of splunk connector
    return splunkLogin()
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
                            ...searchInfo
                        }
                    }, 'Failed to connect to splunk instance at "%s:%d"', error.address, error.port)
                );
            } else if (status === 401) {
                return Observable.throw(
                    new VError({
                        name: 'UnauthorizedSplunkLogin',
                        info: searchInfo
                    }, 'Splunk Credentials are invalid')
                )
            } else {
                return Observable.throw(
                    new VError({
                        name: 'UnhandledStatus',
                        info: searchInfo
                    }, 'Uknown response')
                )
            }
        })
        .switchMap(() => {
            log.debug('Succesful logon from user "%a"', SPLUNK_USER);
            return splunkGetJob(jobId)
                .catch(() => {
                    log.debug('No job was found, creating new search job');
                    const results = splunkSearch( query, searchParams );
                    return results.switchMap(job => {
                        const splunkFetchJob = Observable.bindNodeCallback(job.fetch.bind(job));
                        return splunkFetchJob();
                    });
                })
                .catch(({data}) => Observable.throw(new VError({
                    name: 'SplunkParseError',
                    info: searchInfo
                }, data.messages[0].text)));
        })
        .switchMap(job => {
                const props = job.properties();
                log.debug({
                    sid: job.sid,
                    eventCount: props.eventCount,
                    resultCount: props.resultCount,
                    runDuration: props.runDuration,
                    ttl: props.ttl
                }, 'Search job properties');

                const getResults = Observable.bindNodeCallback(job.results.bind(job),
                    function(results) {
                        return ({results, job});
                    });
                const jobResults = getResults({count: job.properties().resultCount}).catch(
                    (e) => {
                        return Observable.throw(new Error(
                            `${e.data.messages[0].text} ========>  Splunk Query: ${searchQuery}`));
                    }
                );
                return jobResults;
        }).map(
            function({results, job}) {
                const fields = results.fields;
                const rows = results.rows;
                const events = new Array(rows.length);
                var values;
                for(var i = 0; i < rows.length; i++) {
                    events[i] = {};
                    values = rows[i];
                    for(var j = 0; j < values.length; j++) {
                        var field = fields[j];
                        var value = values[j];
                        events[i][field] = value;
                    }
                }
                pivot.resultCount = job.properties().resultCount;
                pivot.results = events;
                pivot.splunkSearchID = job.sid;
                return {app, pivot};
            }
        );
}

