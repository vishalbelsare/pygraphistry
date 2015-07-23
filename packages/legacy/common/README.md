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


