var http = require('http');
var path = require('path');
var chalk = require('chalk');
var Subject = require('rxjs').Subject;
var Observable = require('rxjs').Observable;
var Subscription = require('rxjs').Subscription;
var ReplaySubject = require('rxjs').ReplaySubject;
var childProcess = require('child_process');
var buildResourceHelper = require('./build-resource');
var webpackConfigs = require('./webpack.config.js');
var HMRMiddleware = require('webpack-hot-middleware');


var pid = process.pid;
process.on('exit', function() {
    require('tree-kill')(pid, 'SIGKILL');
});

var buildOpts = buildResourceHelper.parseBuildOpts(process.argv)
var clientConfig = webpackConfigs[0](buildOpts);
var serverConfig = webpackConfigs[1](buildOpts);

// copy static assets
var shelljs = require('shelljs');
shelljs.mkdir('-p', clientConfig.output.path);
shelljs.cp('-rf', './src/static/*', clientConfig.output.path);

var compile, compileClient, compileServer;

// Dev builds can run in parallel because we don't extract the client-side
// CSS into a styles.css file (which allows us to hot-reload CSS in dev mode).
if (buildOpts.isDev) {

    compileClient = processToObservable(childProcess
        .fork(require.resolve('./build-resource'), process.argv.slice(2).concat(0), {
            env: process.env, cwd: process.cwd()
        }));

    compileServer = processToObservable(childProcess
        .fork(require.resolve('./build-resource'), process.argv.slice(2).concat(1), {
            env: process.env, cwd: process.cwd()
        }));

    compile = Observable.combineLatest(compileClient, compileServer);
}
// Prod builds have to be built sequentially so webpack can share the css modules
// style cache between both client and server compilations.
else {

    compileClient = buildResourceToObservable(
        clientConfig, buildOpts
    ).multicast(() => new Subject()).refCount();

    compileServer = buildResourceToObservable(
        serverConfig, buildOpts
    ).multicast(() => new Subject()).refCount();

    compile = compileClient.mergeMap(
            (client) => compileServer,
            (client, server) => [client, server]
        )
        .take(1)
        .mergeMap((results) => !buildOpts.watch ?
            Observable.of(results) :
            Observable.combineLatest(
                compileClient.startWith(results[0]),
                compileServer.startWith(results[1])
            )
        );
}

compile.multicast(function() { return new Subject(); }, function(shared) {

        const client = shared.map((xs) => xs[0]).distinctUntilChanged();
        const server = shared.map((xs) => xs[1]).distinctUntilChanged();

        const buildStatuses = client.merge(server);
        const initialBuilds = client.take(1).merge(server.take(1));

        if (!buildOpts.watch) {
            return buildStatuses.do({
                next: function({ name, time, hash }) {
                    var stime = time / 1000.0;
                    console.log(`${chalk.blue('[WEBPACK]')} Successfully built ${chalk.yellow(name)} in ${chalk.red(stime)} seconds`, time / 1000.0);
                }
            });
        }

        return Observable.merge(
            initialBuilds.do({
                next: function({ name, time, hash }) {
                    var stime = time / 1000.0;
                    console.log(`${chalk.blue('[WEBPACK]')} Successfully built ${chalk.yellow(name)} in ${chalk.red(stime)} seconds`);
                }
            }),
            buildStatuses.skipUntil(initialBuilds).do({
                next: function({ name, time, hash }) {
                    var stime = time / 1000.0;
                    console.log(`${chalk.blue('[WEBPACK]')} Successfully rebuilt ${chalk.yellow(name)} in ${chalk.red(stime)} seconds`);
                }
            }),
            shared.take(1).mergeMap(createClientServer),
            server.mergeScan(startOrUpdateServer, null)
        );

        function createClientServer() {
            console.log('Starting Client [HMR] Server...');
            var clientHMRServer = new http.createServer(function(req, res) {
                res.setHeader('Access-Control-Allow-Origin', '*');
                HMRMiddleware({
                    plugin: function(type, cb) {
                        if (type === 'done') {
                            shared
                                .map(function(arr) { return arr[0]; })
                                .distinctUntilChanged()
                                .subscribe(cb);
                        }
                    }
                }, { log: false })(req, res);
            });
            var listenAsObs = Observable.bindNodeCallback(clientHMRServer.listen.bind(clientHMRServer), function() {
                console.log('************************************************************');
                console.log('Client HMR server listening at http://%s:%s', this.address().address, this.address().port);
                console.log('************************************************************');
                return clientHMRServer;
            })
            return listenAsObs(buildOpts.HMRPort);
        }

        function startOrUpdateServer(child, stats) {
            if (!child) {
                console.log('Starting Dev Server with [HMR]...');
            } else {
                child.kill('SIGKILL');
                console.log('Restarting Dev Server with [HMR]...');
            }
            child = childProcess.fork(path.join(
                serverConfig.output.path,
                serverConfig.output.filename), {
                env: process.env, cwd: process.cwd()
            });
            return processToObservable(child)
                .last(null, null, { code: 1 })
                .mergeMap(function(data) {
                    if (data && data.code != null) {
                        console.error(
                            'Dev Server exited with code:', data.code,
                            'and signal:', data.signal
                        );
                    }
                    return Observable.empty();
                })
                .startWith(child);
        }
    })
    .subscribe({
        error(err) {
            console.error(`${chalk.red('[WEBPACK]')}❌  ${err.error}`);
            console.error(err.stats);
        }
    });

function buildResourceToObservable(webpackConfig, buildOpts) {
    var subject = new ReplaySubject(1);
    return Observable.using(function() {
        var watcher = buildResourceHelper.buildResource(webpackConfig, buildOpts, function(err, data) {
            if (err) {
                return subject.error({
                    error: err.error,
                    stats: err.stats
                });
            }
            subject.next(JSON.parse(data.body));
            if (!buildOpts.watch) {
                subject.complete();
            }
        });
        return new Subscription(function() {
            if (watcher) {
                watcher.close();
            }
        });
    }, function(subscription) {
        return subject;
    });
}

function processToObservable(process) {
    return Observable.create(function(subscriber) {
        function onExitHandler(code, signal) {
            if (code != null) {
                subscriber.next({
                    code: code,
                    signal: signal
                });
            }
            subscriber.complete();
        }
        function onMessageHandler(data) {
            if (!data) {
                return;
            } else if (data.type === 'complete') {
                return subscriber.complete();
            } else if (data.type === 'next') {
                return subscriber.next(JSON.parse(data.body));
            } else if (data.type === 'error') {
                subscriber.error({
                    error: data.error,
                    stats: data.stats
                });
            }
        };
        process.on('exit', onExitHandler);
        process.on('message', onMessageHandler);
        return function() {
            process.kill('SIGKILL');
        }
    });
}
