# Common
Utility functions for server-side code

1. [Logs](#logging) Guidelines to write logging statements
2. [Api Key](#api-key) How to generate/validate api keys.

## Logs

Graphistry utilizes the [node-bunyan](https://github.com/trentm/node-bunyan) logger.

### Writing Logging Statements
It is important that we log objects as opposed to strings, so that our logs are properly formatted. To make log searchable and parseable, please follow the rules below:

1. To log an object, it can only go in the first position. Special objects like `Errors` get handled as expected.
2. Additional arguments can be strings.
3. Keep in mind the object keys are search terms in Bunyan CLI. Follow up arguments (if any) must all be strings.

##### Examples

* Simple statement (Rule 1)

	```javascript
	logger.trace('Phew I got this far');
	```

* Error handler (Rule 2)

	```javascript
	).fail(function(err) {
		logger.error(err, 'a descriptive message');
	});
	```

* Complex statement (Rule 3)

	```javascript
	logger.info({socket: socket.id: username: userDB[name]}, 'New user connected');
	```

#### Logging Levels

| Level          | Code         | Description
| -------------- |:-------------|:-------------
| `logger.fatal` | 60           | The service/app is going to stop/die or become unusable.
| `logger.error` | 50           | Fatal for a particular request, but the service/app continues servicing other requests.
| `logger.warn`  | 40			  | A problem that will likely cause a failure down the line.
| `logger.info`  | 30           | Information on regular operation.
| `logger.debug` | 20           | Debug level information on normal operation
| `logger.trace` | 10           | Detailed debug information. Too verbose for general debugging.

As a general rule, try to log only flat objects at levels info or above. (Flat objects can be pretty printed in one line)


### Printing and Filtering Logs With Bunyan CLI

#### Basic usage
Bunyan logs are in JSON which is hardly readable. Most of the time, you want to pretty print logs on a single line. To do so, run `viz-server` and `central` with

```bash
npm start | bunyan -o short
```
##### Pretty Printing

Bunyan offers more pretty printing options which can be handy:

| Option        | Description |
| ------------- |:-------------|
| `... | bunyan -o short` |	Pretty print one-line logs.
| `... | bunyan -o long` | Pretty print logs with source location (file+line) if available.
| `... | bunyan -o inspect` | Pretty print full JSON log. Useful for inspecting individual statements.
| `... | bunyan -o bunyan` |  Output raw JSON. Useful for piping together filters.

To log the source line numbers (with `-o long`), you must enable `LOG_SOURCE`. Use `npm start '{"LOG_SOURCE": true}' | bunyan -o long`. Please be aware that this will affect performance.


### Filtering

##### By Level
To filter at `info` level:

```bash
... | bunyan -l 30
```
Quick reminder: `trace=10, debug=20, info=30, warning=40, error=50, fatal=60`

##### By Key

Bunyan can filter logs based on an arbitrary JavaScript expression. For instance,

```bash
... | bunyan -c 'this.myField=="myValue"'
```

will only print logs which have `myField` set with value `myValue`. The following code would generate such entries

```javascript
logger.info({myField: 'myValue'}, "This properly logs the object for search and filtering");
```

You may find useful to look at the whole log entry using `-o inspect` when creating filter. For the statement above, you get:

```json
{
  "name": "graphistry",
  "hostname": "Padens-MacBook-Pro.local",
  "pid": 73533,
  "module": "graph-viz",
  "fileName": "graph-viz/js/kernel.js",
  "level": 30,
  "msg": "This properly logs the object for search and filtering",
  "myField": "myValue",
  "time": "2016-02-24T03:50:38.643Z",
  "src": {
    "file": "/Users/padentomasello/graphistry/graph-viz/js/kernel.js",
    "line": 75,
    "func": "set"
  },
  "v": 0
}
```

See [Bunyan filtering docs](https://github.com/trentm/node-bunyan#cli-usage) for more details.

## Api key

### Usage

#### Create a key

http://staging.graphistry.com/api/encrypt?text=foo@bar.comSEECANARYVALUEINSIDECONFIGJSON
=>
`{"encrypted":"9cdee03e7b3604af139cda92e3b91461d8918e7545804005a6d127b7b4becec7"}`

Note: must include suffix corresponding to “SEECANARYVALUEINSIDECONFIGJSON” (canary)

#### Specify key in notebook

```
import graphistry

graphistry = graphistry.settings(key=”9cdee03e7b3604af139cda92e3b91461d8918e7545804005a6d127b7b4becec7")

graphistry.plot(...)
```

#### Test

http://proxy-staging.graphistry.com/api/decrypt?text=9cdee03e7b3604af139cda92e3b91461d8918e7545804005a6d127b7b4becec7

=> `{"decrypted":"foo@bar.com"}`

http://proxy-staging.graphistry.com/api/decrypt?text=badkey

=> `{"error":"failed to decrypt"}`

### Implementation

See `common/api.js`

#### Crypto

AES-256-CBC cypher (w/ secret key in config) encrypts a value that *must* contain the canary suffix (fill in for SEECANARYVALUEINSIDECONFIGJSON). When the decryption runs, it then makes sure the canary is there, signifying we were the ones who made the key. We rate limit encrypt/decrypt calls (1 / sec?).

#### When it runs

The key is necessary for using our heavy servers:
* uploading (ETL)
* “resuscitating”” an exported static visualization back into a GPU-backed viz

The key is not necessary for viewing an existing GPU visualization nor an existing exported static visualization. The former is a risky &, temporary scenario.






