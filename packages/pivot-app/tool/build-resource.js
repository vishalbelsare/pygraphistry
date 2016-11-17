var chalk = require('chalk');
var webpack = require('webpack');
var Observable = require('rxjs').Observable;


var argv = process.argv.slice(2);
while (argv.length < 3) {
    argv.push(0);
}

function parseBuildOpts(argv0) {
    var buildOpts = {
        watch: false,
        isDev: process.env.NODE_ENV === 'development',
        isFancy: false,
        genStats: false,
        HMRPort: 8090,
        target: 0,
    }

    var argv = argv0.slice(2);
    var arg;
    while (arg = argv.shift()) {
        if (!arg.startsWith('--')) { // Last argument is target to compile
            buildOpts.target = arg;
            continue;
        }

        switch (arg) {
            case '--watch':
                buildOpts.watch = true;
                break;
            case '--fancy':
                buildOpts.isFancy = true;
                break;
            case '--stats':
                buildOpts.genStats = true;
                break;
            default:
                console.error('Unknown argument', arg);
        }
    }

    return buildOpts;
}

if (require.main === module) {

    var buildOpts = parseBuildOpts(process.argv);

    var webpackConfig = require('./webpack.config.js')[buildOpts.target](buildOpts);
    var watcher = buildResource(
        webpackConfig, buildOpts, function(err, data) {
            if (err) {
                return process.send(err);
            }
            process.send(data);
            if (!buildOpts.watch) {
                process.send({ type: 'complete' });
            }
        }
    );

    process.on('SIGINT', function() {
        if (watcher) {
            watcher.close();
        }
        process.exit(0);
    });

    process.on('message', function(data) {
        if (data === 'die') {
            if (watcher) {
                watcher.close();
            }
            process.exit(0);
        }
    });

}

function buildResource(webpackConfig, buildOpts, cb) {
    console.log('%s Started %s %s', chalk.blue('[WEBPACK]'),
                 buildOpts.watch ? 'watching' : 'building',
                 chalk.yellow(getAppName(webpackConfig)));

    var compiler = webpack(webpackConfig);
    var compileMethod = !buildOpts.watch ?
        compiler.run.bind(compiler) :
        compiler.watch.bind(compiler, {});

    function handleFatalError(err) {
        cb(err)
    }

    function handleSoftErrors(stats) {
        const selectedStats = stats.toString(webpackConfig.stats || {chunks: false, colors: true, errorDetails: false});
        const appName = getAppName(webpackConfig);
        if (buildOpts.watch) {
            console.error(`${chalk.red('[WEBPACK]')}❌  Failed to build ${appName}`);
            console.error(selectedStats);
            console.warn(`${chalk.yellow('[WEBPACK]')} Still watching...`);
        } else {
            return cb({
                type: 'error',
                error: `Failed to build: ${appName}`,
                stats: selectedStats
            });
        }
    }

    function handleWarnings(stats) {
        const selectedStats = stats.toString(webpackConfig.stats || {chunks: false, colors: true, errorDetails: false});
        const appName = getAppName(webpackConfig);
        console.warn('Stats:', selectedStats);
    }

    function successfullyCompiled(stats) {
        const { time, hash } = stats.toJson({timings: true, chunks: false, colors: false, errorDetails: false});
        cb(null, {
            type: 'next',
            body: JSON.stringify({
                name: getAppName(webpackConfig),
                time: time,
                hash: hash
            })
        });
    }

    return compileMethod(function(err, stats) {
        if(err) {
            return handleFatalError(err);
        }
        if(stats.hasErrors()) {
            return handleSoftErrors(stats);
        }
        if(stats.hasWarnings()) {
            handleWarnings(stats);
        }

        successfullyCompiled(stats);

    });

    function getAppName(webpackConfig) {
        var appName = webpackConfig.name || webpackConfig.output.filename;
        if(~appName.indexOf('[name]') && typeof webpackConfig.entry === 'object') {
            var entryNames = Object.keys(webpackConfig.entry);
            if(entryNames.length === 1) {
                // we can only replace [name] with the entry point if there is only one entry point
                appName = appName.replace(/\[name]/, entryNames[0]);
            }
        }
        return appName;
    }
}


module.exports = {
    buildResource: buildResource,
    parseBuildOpts: parseBuildOpts,
}
