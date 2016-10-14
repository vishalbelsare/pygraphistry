## Api Key Generation

### Usage

#### Process

* Create a key
* Send to receipient & record that you did
* Specify key in notebook
* Test


#### Create a key

http://staging.graphistry.com/api/encrypt?text=foo@bar.comSEECANARYVALUEINSIDECONFIGJSON
=>
`{"encrypted":"9cdee03e7b3604af139cda92e3b91461d8918e7545804005a6d127b7b4becec7"}`

Note: must include suffix corresponding to “SEECANARYVALUEINSIDECONFIGJSON” (canary)

#### Send to receipient & record that you did

* Warn them not to upload private data
* Record who/when: https://docs.google.com/spreadsheets/d/1U65IeJQXWdBKfLlLXaKl9s31iNP_w-bbh-YkPkkh3-g/edit#gid=0
* Eventually, we need to setup our TOS (clickthrough agreement)

```
Hi ZZZZZ,

Certainly, here is an API key for you: ZZZZZZ

We have a tutorial on https://github.com/graphistry/pygraphistry. I will follow up with an invite to our Slack channel. Feel free to ask any questions, share comments/feedback or report problems via Slack: our team loves helping out. Out of curiosity, what kind of data are interested in visualizing?

One more thing: You are sending data to us when you create a visualization. Since our public cloud is in alpha, we are not yet providing security or privacy guarantees.

Happy graphing!
```

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



