var chalk = require('chalk');
var webpack = require('webpack');
var Observable = require('rxjs').Observable;
var argv = process.argv.slice(2);
while (argv.length < 3) {
    argv.push(0);
}

module.exports = buildResource;

if (require.main === module) {

    var webpackConfig = require('./webpack.config.js')[argv[2]](
        process.env.NODE_ENV === 'development',
        argv[1] === '--fancy'
    );
    var isDevBuild = process.env.NODE_ENV === 'development';
    var shouldWatch = argv[0] === '--watch';
    var watcher = buildResource(
        webpackConfig, isDevBuild, shouldWatch, function(err, data) {
            if (err) {
                return process.send(err);
            }
            process.send(data);
            if (!shouldWatch) {
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

function buildResource(webpackConfig, isDevBuild, shouldWatch, cb) {


    console.log('%s Started %s %s', chalk.blue('[WEBPACK]'),
                 shouldWatch ? 'watching' : 'building',
                 chalk.yellow(getAppName(webpackConfig)));

    var compiler = webpack(webpackConfig);
    var compileMethod = !shouldWatch ?
        compiler.run.bind(compiler) :
        compiler.watch.bind(compiler, {});

    function handleFatalError(err) {
        cb(err)
    }

    function handleSoftErrors(stats) {
        const selectedStats = stats.toString(webpackConfig.stats || {chunks: false, colors: true, errorDetails: false});
        const appName = getAppName(webpackConfig);
        if (shouldWatch) {
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

    function handleWarnings(warnings) {
        warnings.map((error) => console.warn('Build warning', warning));
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
