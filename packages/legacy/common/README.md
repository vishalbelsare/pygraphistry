# common
Utility functions for server-side code

# api key

## To use:
### Create a key

http://proxy-staging.graphistry.com/api/encrypt?text=foo@bar.comSEECANARYVALUEINSIDECONFIGJSON

=>  `{"encrypted":"9cdee03e7b3604af139cda92e3b91461d8918e7545804005a6d127b7b4becec7"}`

Note: must include suffix corresponding to “SEECANARYVALUEINSIDECONFIGJSON” (canary)

### Specify key in notebook

```
import graphistry

graphistry = graphistry.settings(key=”9cdee03e7b3604af139cda92e3b91461d8918e7545804005a6d127b7b4becec7")

graphistry.plot(...)
```

### Test

http://proxy-staging.graphistry.com/api/decrypt?text=9cdee03e7b3604af139cda92e3b91461d8918e7545804005a6d127b7b4becec7

=> `{"decrypted":"foo@bar.com"}`

http://proxy-staging.graphistry.com/api/decrypt?text=badkey

=> `{"error":"failed to decrypt"}`

## Implementation

### Where

`common/api.js`

### Crypto

AES-256-CBC cypher (w/ secret key in config) encrypts a value that *must* contain the canary suffix (fill in for SEECANARYVALUEINSIDECONFIGJSON). When the decryption runs, it then makes sure the canary is there, signifying we were the ones who made the key. We rate limit encrypt/decrypt calls (1 / sec?).

### When it runs

The key is necessary for using our heavy servers:
* uploading (ETL)
* “resuscitating”” an exported static visualization back into a GPU-backed viz

The key is not necessary for viewing an existing GPU visualization nor an existing exported static visualization. The former is a risky &, temporary scenario.

# Logging

Graphistry utilizes the node-bunyan logger. Detailed information can be found at:

https://github.com/trentm/node-bunyan

## Structuring Logs
It is important that we log objects as opposed to strings, so that our logs are properly formatted.

```
object = {foo: 'bar'}

logger.info("This will stringify the object and concatenate it with the msg field", object)

logger.info(object, "This properly logs the object, so that it can be searched and filtered for");
```
Output:

```
{
  "name": "graphistry",
  "hostname": "Padens-MacBook-Pro.local",
  "pid": 73533,
  "module": "graph-viz",
  "fileName": "graph-viz/js/kernel.js",
  "level": 30,
  "msg": "This will stringify the object and concatenate it with the msg field { foo: 'bar' }",
  "time": "2016-02-24T03:50:38.643Z",
  "src": {
    "file": "/Users/padentomasello/graphistry/graph-viz/js/kernel.js",
    "line": 75,
    "func": "set"
  },
  "v": 0
}
{
  "name": "graphistry",
  "hostname": "Padens-MacBook-Pro.local",
  "pid": 73533,
  "module": "graph-viz",
  "fileName": "graph-viz/js/kernel.js",
  "level": 30,
  "msg": "This properly logs the object, so that it can be searched and filtered for",
  "foo": "bar"
  "time": "2016-02-24T03:50:38.643Z",
  "src": {
    "file": "/Users/padentomasello/graphistry/graph-viz/js/kernel.js",
    "line": 75,
    "func": "set"
  },
  "v": 0
}
```

This would allow you to easily run the bunyan CLI to search for any logs which have the field `foo` with the command:
```
npm start | bunyan -c 'this.foo' 
```
or all the logs with `foo=='bar'` with:
```
npm start | bunyan -c 'this.foo=="bar"'
```

## Bunyan CLI

Note: We have a forked version of the Bunyan CLI in order to not print metadata for each log.
`bunyan -o short` will pretty print logs.
`bunyan -o long` will pretty print logs with source information if available.
`bunyan -o inspect` is useful for inspecting individual logs.
`bunyan -o bunyan` can be used to output bunyan json format. (Useful for piping together filters).

`bunyan -c 'this.field=='value'` can be used to filter logs based on some condition. Any javascript expression should be valid.

`bunyan -l 30  can be used to filter logs based on logging level.

See docs for more details

## Logging Levels

* "fatal" (60): The service/app is going to stop or become unusable now. An operator should definitely look into this soon.
* "error" (50): Fatal for a particular request, but the service/app continues servicing other requests. An operator should look at this soon(ish).
* "warn" (40): A note on something that should probably be looked at by an operator eventually.
* "info" (30): Detail on regular operation.
* "debug" (20): Anything else, i.e. too verbose to be included in "info" level.
* "trace" (10): Logging from external libraries used by your app or very detailed application logging.

As a general rule, try to log only flat objects at levels info or above. (Flat objects can be pretty printed in one line)

## Logging Source

You can log the source line numbers by setting the LOG_SOURCE variable in the config file. Please be aware that this will affect performance.  






