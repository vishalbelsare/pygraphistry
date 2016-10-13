import splunkjs from 'splunk-sdk';
import stringHash from 'string-hash';
import { Observable } from 'rxjs';

export function searchSplunk({app, pivot}) {

    // TODO This can be moved out of function once template
    // is removed from client
    const service = new splunkjs.Service({
        host: process.env.SPLUNK_HOST || 'splunk.graphistry.com',
        username: process.env.SPLUNK_USER || 'admin',
        password: process.env.SPLUNK_PWD || 'graphtheplanet'
    });

    service.login((err, success) => {
        if (success) {
            console.log('Successful login to splunk');
        }
        if (err) {
            throw err;
        }
    });
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
        earliest_time: '1980-06-20T16:27:43.000-07:00'
    };

    const getJobObservable = Observable.bindNodeCallback(service.getJob.bind(service));
    const serviceObservable = Observable.bindNodeCallback(service.search.bind(service));

    return getJobObservable(searchJobId)
        .catch(
            () => {
                console.log('No job was found, creating new search job');
                const serviceResult = serviceObservable(
                    searchQuery,
                    searchParams
                );
                return serviceResult.flatMap(
                    function(job) {
                        var fetchJob = Observable.bindNodeCallback(job.fetch.bind(job));
                        var jobObservable = fetchJob();
                        return jobObservable;
                    }
                );
            }
        )
        .flatMap(
            function(job) {
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
            }
        ).map(
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

