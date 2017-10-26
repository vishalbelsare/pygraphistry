### @graphistry/microserver
This wrap's `Zeit`'s `micro` server in a few utility functions and instrumentation. Usage is as follows:

```
const {json} = require('micro');
const microserver = require('@graphistry/microserver')({method: 'POST'});
microserver(async (req, res) => await json(req).foo);
```