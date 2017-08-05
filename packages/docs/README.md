# New Graphistry documentation

The content of this repo is used as the content of the root `/` path of a running Graphistry web app deployment.

**WARNING**: because the contents of this repo are used as the content for our web server, this file (and any other files in this repo) *may* be exposed publicly. Do not put sensitive information anywhere in this repo.


## Developing

Currently, this repo is all static files. For any individual document, check the source repo for relevant build instructions and copy the static file into here.

In progress: we are trying to add a compilation step. Run `./compile.sh` with relevant repositories checked out as sibling directories.


## Publish & Stage

The latest published document npm package is automatically served by npm. To publish:

1. To publish the latest updates from this repo, specify the branch (or master) for this Jenkins job:

http://deploy.graphistry.com/job/Build%20and%20publish%20docs/build?delay=0sec

2. There is no step 2