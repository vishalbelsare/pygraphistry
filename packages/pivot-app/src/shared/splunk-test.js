var splunkjs = require('splunk-sdk');

var service = new splunkjs.Service({username: "admin", password: "changeme"});

service.login(function(err, success) {
    if (err) {
        throw err;
    }
});

// Search everything and return the first 100 results
var searchQuery = "search * | head 10";

// Set the search parameters
var searchParams = {
  exec_mode: "blocking",
  earliest_time: "2012-06-20T16:27:43.000-07:00"
};

// A blocking search returns the job's SID when the search is done
console.log("Wait for the search to finish...");

// Run a blocking search and get back a job
service.search(
  searchQuery,
  searchParams,
  function(err, job) {
    console.log("...done!\n");

    // Get the job from the server to display more info
    job.fetch(function(err){
      // Display properties of the job
      console.log("Search job properties\n---------------------");
      console.log("Search job ID:         " + job.sid);
      console.log("The number of events:  " + job.properties().eventCount); 
      console.log("The number of results: " + job.properties().resultCount);
      console.log("Search duration:       " + job.properties().runDuration + " seconds");
      console.log("This job expires in:   " + job.properties().ttl + " seconds");

      // Get the results and display them
      job.results({}, function(err, results) {
        var fields = results.fields;
        var rows = results.rows;
        for(var i = 0; i < rows.length; i++) {
          var values = rows[i];
          console.log("Row " + i + ": ");
          for(var j = 0; j < values.length; j++) {
            var field = fields[j];
            var value = values[j];
            console.log("  " + field + ": " + value);
          }
        }
      })

    });
    
  }
);
