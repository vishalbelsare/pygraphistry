import splunkjs from 'splunk-sdk';
import stringHash from 'string-hash';
import { Observable } from 'rxjs';
import logger from '@graphistry/common/logger2.js';
import VError from 'verror';

const SPLUNK_HOST = process.env.SPLUNK_HOST;
const SPLUNK_USER = process.env.SPLUNK_USER || 'admin';
const SPLUNK_PWD = process.env.SPLUNK_PWD || 'graphtheplanet'

const service = new splunkjs.Service({
    host: SPLUNK_HOST,
    username: SPLUNK_USER,
    password: SPLUNK_PWD
});

const log = logger.createLogger('pivot-app', __filename)
                .child({splunkHostName: SPLUNK_HOST, splunkUser: SPLUNK_USER})

export function searchSplunk({app, pivot}) {

    const splunkQuery = pivot.searchQuery;
    const splunkJobId = `pivot-app::${stringHash(splunkQuery)}`;

    // Set the search parameters
    const searchParams = {
        id: splunkJobId,
        timeout: '14400', // 4 hours
        exec_mode: 'blocking',
        earliest: '-7d'
    };

    const searchInfo = { splunkQuery, searchParams };

    log.info( searchInfo,'Fetching results for splunk job: "%s"', splunkJobId);

    const splunkLogin = Observable.bindNodeCallback(service.login.bind(service));
    const splunkGetJob = Observable.bindNodeCallback(service.getJob.bind(service));
    const splunkSearch = Observable.bindNodeCallback(service.search.bind(service));

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
                    }, 'Unsucessful logon from user "%s"', SPLUNK_USER)
                )
            }
        })
        .switchMap(succesfulLogin => {
            log.debug('Succesful logon from user "%a"', SPLUNK_USER);
            return getJob(searchJobId)
                .catch(() => {
                    log.debug('No job was found, creating new search job');
                    const results = splunkSearch(
                        searchQuery,
                        searchParams
                    );
                    return results.switchMap(job => {
                        const splunkFetchJob = Observable.bindNodeCallback(job.fetch.bind(job));
                        return splunkFetchJob();
                    });
                }
            )
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

