var splunkjs = require('splunk-sdk');
import { Observable } from 'rxjs';

var service = new splunkjs.Service({
  host: process.env.SPLUNK_HOST || 'splunk.graphistry.com',
  username: process.env.SPLUNK_USER || "admin",
  password: process.env.SPLUNK_PWD || "graphtheplanet"});

service.login(function(err, success) {
    if (err) {
        throw err;
    }
});

export function searchSplunk(searchQuery, callback) {

    // Set the search parameters
    var searchParams = {
      exec_mode: "blocking",
      earliest_time: "2012-06-20T16:27:43.000-07:00"
    };

    // A blocking search returns the job's SID when the search is done
    console.log("Wait for the search to finish...", searchQuery);

    // Run a blocking search and get back a job
    var output;

    var serviceObservable = Observable.bindNodeCallback(service.search.bind(service));
    var serviceResult = serviceObservable(
      searchQuery,
      searchParams
    );


    return serviceResult.flatMap(
        function(job) {
            var fetchJob = Observable.bindNodeCallback(job.fetch.bind(job));
            var jobObservable = fetchJob();
            return jobObservable;
        },
        function(job, jobFetchResult) {
            return job
        }
    ).flatMap(
        function(job) {
              console.log("Search job properties\n---------------------");
              console.log("Search job ID:         " + job.sid);
              console.log("The number of events:  " + job.properties().eventCount);
              console.log("The number of results: " + job.properties().resultCount);
              console.log("Search duration:       " + job.properties().runDuration + " seconds");
              console.log("This job expires in:   " + job.properties().ttl + " seconds");
            var getResults = Observable.bindNodeCallback(job.results.bind(job),
                function(results, job) {
                return ({results, job});
            });
            var jobResults = getResults({count: job.properties().resultCount});
            return jobResults;
        }
    ).map(
        function({results, job}) {
            var fields = results.fields;
            var rows = results.rows;
            output = new Array(rows.length);
            var values;
            for(var i = 0; i < rows.length; i++) {
              output[i] = {};
              values = rows[i];
              for(var j = 0; j < values.length; j++) {
                var field = fields[j];
                var value = values[j];
                output[i][field] = value;
              }
            }
            return {output, resultCount: job.properties().resultCount};
        }
    )
}

