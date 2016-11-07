import splunkjs from 'splunk-sdk';
import stringHash from 'string-hash';
import { Observable } from 'rxjs';

const service = new splunkjs.Service({
    host: process.env.SPLUNK_HOST || 'splunk.graphistry.com',
    username: process.env.SPLUNK_USER || 'admin',
    password: process.env.SPLUNK_PWD || 'graphtheplanet'
});

export function searchSplunk({app, pivot}) {

    const login = Observable.bindNodeCallback(service.login.bind(service));
    const searchQuery = pivot.searchQuery;

    console.log('======= Search ======');
    console.log(pivot.searchQuery);

    const searchJobId = `pivot-app::${stringHash(searchQuery)}`;

    console.log('Search job id', searchJobId);

    // Set the search parameters
    const searchParams = {
        id: searchJobId,
        timeout: '14400', // 4 hours
        exec_mode: 'blocking',
        earliest: '-7d'
    };

    const getJob = Observable.bindNodeCallback(service.getJob.bind(service));
    const serviceObservable = Observable.bindNodeCallback(service.search.bind(service));

    return login()
        .catch(err => {
            const msg = err.data ? err.data.messages[0].text : err.error;
            return Observable.throw(new Error(`Failed splunk pivot: ${msg}`));
        })
        .switchMap(succesfulLogin => {
            console.log('Succesful Login');
            return getJob(searchJobId)
                .catch(() => {
                    console.log('No job was found, creating new search job');
                    const serviceResult = serviceObservable(
                        searchQuery,
                        searchParams
                    );
                    return serviceResult.switchMap(job => {
                        const fetchJob = Observable.bindNodeCallback(job.fetch.bind(job));
                        const jobObservable = fetchJob();
                        return jobObservable;
                    });
                }
            )
        })
        .switchMap(job => {
                console.log('Search job properties\n---------------------');
                console.log('Search job ID:         ' + job.sid);
                console.log('The number of events:  ' + job.properties().eventCount);
                console.log('The number of results: ' + job.properties().resultCount);
                console.log('Search duration:       ' + job.properties().runDuration + ' seconds');
                console.log('This job expires in:   ' + job.properties().ttl + ' seconds');
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

