# Logs

Graphistry utilizes the [node-bunyan](https://github.com/trentm/node-bunyan) logger.

### Writing Logging Statements

It is important that we pass objects to the logger as opposed to already serialized strings. Bunyan will take care of serializing and create easily searchable and filterable logs. The golden rule is: *Serializable objects must all go in the first argument and any thereafter are strings.*

###### Examples

* **Simple statement:** When logging a single string, it goes as the first and only argument.

	```javascript
	logger.trace('Phew I got this far');
	```

* **Error handler:** When logging an `Error` object, it must go in the first argument. Follow up arguments (if any) must all be strings.

	```javascript
	).fail(function(err) {
		logger.error(err, 'a descriptive message');
	});
	```

* **Complex statement:** When logging `Objects` or `Arrays`, they must be all be grouped into a single object passed as the first argument. Follow up arguments (if any) must all be strings

	```javascript
	logger.info({socket: socket.id: username: userDB[name]}, 'New user connected');
	```

	*Keep in mind the object keys are search terms in Bunyan CLI.*

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

Messages in `info` and higher are logged in production.

### Creating a New Logger

TODO: Figure out standard way!

```javascript
var Log         = require('common/logger.js');
var logger      = Log.createLogger(???, __filename???);
```

### Printing and Filtering Logs With Bunyan CLI

#### Basic usage
Bunyan logs are in JSON which is hardly readable. Most of the time, you want to pretty print logs on a single line. To do so, run `viz-server` and `central` with

```bash
npm start | bunyan -o short
```

Bunyan offers more pretty printing options which can be handy:

| Option        | Description |
| ------------- |:-------------|
| `... | bunyan -o short` |	Pretty print one-line logs.
| `... | bunyan -o long` | Pretty print logs with source location (file+line) if available.
| `... | bunyan -o inspect` | Pretty print full JSON log. Useful for inspecting individual statements.
| `... | bunyan -o bunyan` |  Output raw JSON. Useful for piping together filters.

To log the source line numbers (with `-o long`), you must enable `LOG_SOURCE`. Use `npm start '{"LOG_SOURCE": true}' | bunyan -o long`. Please be aware that this will affect performance.

#### Filtering

###### By Level
To filter at `info` level:

```bash
... | bunyan -l 30
```
Quick reminder: `trace=10, debug=20, info=30, warning=40, error=50, fatal=60`

###### By Key

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

###### By Subsystem

You can also filter on fields autofilled by the logger such as `module` or `fileName`. For instance, you can filter on a subsystem with:

```bash
... | bunyan -c "this.module.indexOf('central') >=  0" -o short
```

##### Going Further
See [Bunyan filtering docs](https://github.com/trentm/node-bunyan#cli-usage) for more details.
