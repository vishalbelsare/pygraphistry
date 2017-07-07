### lib for using with our vgraph.proto format + serializing to csv & mapd

- exports the [compiled protobuf code](https://github.com/graphistry/vgraph-to-mapd/blob/master/src/vgraph/vgraph.js) for encoding/decoding VGraphs
- extracts the [`loadVGraph` service](https://github.com/graphistry/vgraph-to-mapd/blob/master/src/vgraph/loader.ts#L39) out of viz-app
- defines type [mappings and value converters](https://github.com/graphistry/vgraph-to-mapd/tree/master/src/types) that hopefully represent most of the type-coercion that happens after viz-app loads a dataset
  - columns with "date" or "time" in the name are friendly-cast to UTC millisecond values via moment (this is bad and slow, but we have to do it)
  - columns with "color" in the name are assumed to be one of the following, and converted to their int32 **ABGR** (for WebGL) representations:
    - RGB ints
    - our colorbrewer pallete ints
    - a css-string color ("#fff", "rgb(255, 0, 0)", "rgba(0, 255, 0, 0)", "rebeccapurple")
- defines a [vgraph-to-csv transform](https://github.com/graphistry/vgraph-to-mapd/tree/master/src/csv) that:
  1. partitions the vgraph columns into distinct node and edge tables
  2. automatically attaches an `id` column for each node and edge
  3. runs preliminary type-inference on vgraph columns, with hints from ETL2's json metadata (if available)
  4. scans the column names and emits a third table of column metadata
  5. slices each table into four separate VGraphs (where each slice has all columns, and `n` rows)
  6. spawns a child node process to parallelize row value type conversion, then writes each row to a shared CSV file-descriptor
- defines a [createDB function](https://github.com/graphistry/vgraph-to-mapd/blob/master/src/mapd/create-db.ts) that initializes/starts a mapd-database process to dump the CSVs into
- defines a [createTable function](https://github.com/graphistry/vgraph-to-mapd/blob/master/src/mapd/create-table.ts) that
    1. accepts an rxjs-mapd database client + post-inference VGraph + CSV filename
    2. creates a new table in mapd from the inferred column types
    3. instructs mapd to load the data in the CSV file into the new table

### System configuration

We serialize the vgraph protobuf into shared memory segments, so you're going to want to increase your default shared memory values:

From [this page](http://www.spy-hill.net/myers/help/apple/SharedMemory.html):

> Here are what the particular shared memory kernel settings mean:
> shmmax
>   Maximum size of a shared memory segment
> shmmin
>   Minimum size of a shared memory segment
> shmmni
>   Maximum number of separate shared memory id's
> shmseg
>   Maximum number of shared memory segments per user
> shmall
>   Maximum amount of shared memory (measured in pages). This is generally shmmax divided by 4096.


First, verify your current shared memory settings. These are the default values for OS X:
```
$ sysctl -a | grep kern.sysv.shm
kern.sysv.shmall: 1024
kern.sysv.shmseg: 8
kern.sysv.shmmni: 32
kern.sysv.shmmin: 1
kern.sysv.shmmax: 4194304
```

The amount of shared memory is configured at startup, so you'll need to create a config file to increase these numbers.
Copy and paste this command exactly (including line breaks) to create or append these values to the `/etc/sysctl.conf` file:
```
sudo sh -c 'echo "
kern.sysv.shmseg=2048
kern.sysv.shmmni=8192
kern.sysv.shmall=262144
kern.sysv.shmmax=1073741824" >> /etc/sysctl.conf'
```

The next time you reboot, `sysctl -a | grep kern.sysv.shm` should report these values
