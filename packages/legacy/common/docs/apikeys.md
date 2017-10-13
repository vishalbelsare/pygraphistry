## Api Key Generation

### Usage: Public

#### Process

* Create a key
* Record account info
* Send to receipient

#### Create a key

http://staging.graphistry.com/api/encrypt?text=foo@bar.comSEECANARYVALUEINSIDECONFIGJSON
=>
`{"encrypted":"9cdee03e7b3604af139cda92e3b91461d8918e7545804005a6d127b7b4becec7"}`

Note: must include suffix corresponding to “SEECANARYVALUEINSIDECONFIGJSON” (canary)

#### Record who/when and maybe a comment if interesting

https://docs.google.com/spreadsheets/d/1U65IeJQXWdBKfLlLXaKl9s31iNP_w-bbh-YkPkkh3-g/edit#gid=0

#### Send to receipient

* Eventually, we need to setup our TOS (clickthrough agreement)

```
Hi ZZZZZ,

Certainly, see below for API information. As you progress, we are piloting our developer embedding API and our full visual platform with database connectors, so those may be of interest as well.

Out of curiousity, what do you plan to explore?

Happy graphing,

YYY

===

API key for our public GPU cloud (please do not send sensitive data):
zzzzz

Library, documentation, & examples: https://github.com/graphistry/pygraphistry

Slack channel: Invite incoming; quickest place for ideas & help from our team
```

### Usage: Code

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

PyGraphistry will check keys on `.register()`, and eventually, we should have a test notebook for this.

### Implementation

See `common/api.js`

#### Crypto

AES-256-CBC cypher (w/ secret key in config) encrypts a value that *must* contain the canary suffix (fill in for SEECANARYVALUEINSIDECONFIGJSON). When the decryption runs, it then makes sure the canary is there, signifying we were the ones who made the key. We rate limit encrypt/decrypt calls (1 / sec?).

#### When it runs

The key is necessary for using our heavy servers:
* uploading (ETL)
* “resuscitating”” an exported static visualization back into a GPU-backed viz

The key is not necessary for viewing an existing GPU visualization nor an existing exported static visualization. The former is a risky &, temporary scenario.



