import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';
var _ = require('underscore');

var request = require('request');

var hostname = 'http://labs.graphistry.com/graph/'

//jsonGraph * (err? -> ())? -> ()
function upload (data, cb) {
    cb = cb || function (err, data) {
        if (err) {
            return console.error('exn', err);
        } else {
            return console.log('success', data);
        }
    };
	console.log("About to upload data", data.name);
    
    request.post({
        uri: 'http://labs.graphistry.com/etl',
        qs:   query,
        json: data,
        callback: 
            function (err, resp, body) {
            if (err) { return cb(err); }
            try {
                if (!body.success) {
                    console.log(body);
                    throw new Error(body)
                }
                return cb(undefined, body);
            } catch (e) {
                return cb(e);
            }
            }
        });
}

var query = {
    'key': 'd6a5bfd7b91465fa8dd121002dfc51b84148cd1f01d7a4c925685897ac26f40b',
    'agent': 'pygraphistry',
    'agentversion': '0.9.30',
    'apiversion': 1,
}

var simpleGraph = {
    "name": "myUniqueGraphNamePaden",
    "type": "edgelist",
    "bindings": {
        "sourceField": "src",
        "destinationField": "dst",
        //"idField": "node"
    },
    "graph": [
      {"src": "myNode1", "dst": "myNode2",
       "myEdgeField1": "I'm an edge!", "myCount": 7},
      {"src": "myNode2", "dst": "myNode3",
        "myEdgeField1": "I'm also an edge!", "myCount": 200}
    ],
    "labels": [
      {"node": "myNode1",
       "myNodeField1": "I'm a node!",
       "pointColor": 5},
      {"node": "myNode2",
       "myNodeField1": "I'm a node too!",
       "pointColor": 4},
      {"node": "myNode3",
       "myNodeField1": "I'm a node three!",
       "pointColor": 4}
    ]
}

function uploadGraph(shapedData) {
    
    return shapedData.flatMap(
        function(graph) {
            var uploadDone = Observable.bindNodeCallback(upload.bind(upload));
            var vizUrl = uploadDone(graph);
            return vizUrl.map(
                () => graph.name
            )
        }
    )
}

module.exports = {
    uploadGraph: uploadGraph
}
