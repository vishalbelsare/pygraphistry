import url from 'url';
import { inspect } from 'util';
import faviconStats from './favicon-assets.json';
import webpackAssets from './webpack-assets.json';
import { Model } from '@graphistry/falcor';
import { Provider } from 'react-redux';
import { simpleflake } from 'simpleflakes';
import { Observable, BehaviorSubject } from 'rxjs';
// import { configureStore } from 'viz-shared/store/configureStore';
import { renderToString as reactRenderToString } from 'react-dom/server';
import stringify from 'json-stable-stringify';
import FalcorQuerySyntax from '@graphistry/falcor-query-syntax';
import fetchDataUntilSettled from '@graphistry/falcor-react-redux/lib/utils/fetchDataUntilSettled';

const renderServerSide = true;
// const renderServerSide = false;

export function renderMiddleware(getDataSource, modules) {
    return function renderMiddleware(req, res) {
        const { query: options = {} } = req;
        const reqURL = url.parse(req.originalUrl);

        if (options.workbook === undefined) {
            const redirectUrl = url.format({
                    ...reqURL,
                    search: undefined,
                    query: {
                        ...options,
                        workbook: simpleflake().toJSON()
                    }
                });

            return res.redirect(redirectUrl);
        }

        const paths = getProxyPaths(req);

        try {
            const renderedResults = !renderServerSide ?
                Observable.of(renderFullPage(null, null, paths)) :
                renderAppWithHotReloading(modules, getDataSource(req), options, req);

            renderedResults.take(1).subscribe({
                next(html) {
                    res.type('html').send(html);
                },
                error(e, error = e && e.stack || inspect(e, { depth: null })) {
                    console.error(error);
                    if (e.boundPath) {
                        console.error(stringify(e.boundPath));
                        console.error(stringify(e.shortedPath));
                    }
                    res.status(500).send(reactRenderToString(<pre>{error}</pre>));
                }
            });
        } catch (e) {
            const error = e && e.stack || inspect(e, { depth: null });
            console.error(error);
            res.status(500).send(reactRenderToString(<pre>{error}</pre>));
        }
    }
}

function renderAppWithHotReloading(modules, dataSource, paths) {
    return modules
        .map(({ App }) => ({
            App, falcor: new Model({
                source: dataSource,
                recycleJSON: true,
                treatErrorsAsValues: true
            })
        }))
        .switchMap(
            ({ App, falcor }) => fetchDataUntilSettled({
                data: {}, falcor, fragment: App.fragment
            }),
            ({ App, falcor }, { data }) => ({ App, falcor, data })
        )
        .map(({ App, falcor, data }) => renderFullPage(data, falcor, paths));
}


function renderFullPage(data, falcor, paths, html = '') {
    const { client, vendor } = webpackAssets;
    const { html: iconsHTML } = faviconStats;
    return `
<!DOCTYPE html>
<html lang='en-us'>
    <head>
        ${paths ? `<base href="${paths.base}">` : ''}
        <script type="text/javascript">
            window.graphistryPath = "${ paths ? paths.prefix : ''}";
        </script>
        <meta name='robots' content='noindex, nofollow'/>
        <meta http-equiv='x-ua-compatible' content='ie=edge'/>
        <meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'/>${
            iconsHTML.map((tag) =>
                tag.replace(/href=\"(.*?)\"/g, (match, url) =>
                    `href='${url}'`
                )
            ).join('\n')
        }
        <!--link rel='stylesheet' type='text/css' href='https://maxcdn.bootstrapcdn.com/bootstrap/latest/css/bootstrap.min.css'-->${
            client && client.css ?
        `<link rel='stylesheet' type='text/css' href='${`${client.css}`}'/>`: ''
        }
    </head>
    <body class='graphistry-body table-container'>
        <script type="text/javascript">
            var templatePaths = { API_ROOT: window.location.protocol + "//" + window.location.host + "/graph/" };
        </script>
        <script type="text/javascript">
            (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
            (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
            m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
            })(window,document,'script','//google-analytics.com/analytics.js','ga');
        </script>
        <div id='root'>${html}</div>
        <script>
            var __INITIAL_STATE__ = ${stringify(data && data.toJSON() || {})};
            var __INITIAL_CACHE__ = ${stringify(falcor && falcor.getCache() || {})};
        </script>
        <script type="text/javascript" src="${`${vendor.js}`}"></script>
        <script type="text/javascript" src="${`${client.js}`}"></script>
    </body>
</html>`;
}

// function renderVDomToHTMLPage(model, vdom, workerID = '') {
//     return (`<!DOCTYPE html>
// ${toHTML(<html lang='en-us'>
//             <head>
//                 <meta charset="utf-8"/>
//                 <meta name="robots" content="noindex, nofollow"/>
//                 <meta http-equiv='x-ua-compatible' content='ie=edge'/>
//                 <meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'/>
//                 <link rel="stylesheet" type='text/css' href={`css/jquery-ui-1.10.4.css?workerID=${workerID}`}/>
//                 <link rel="stylesheet" type='text/css' href={`libs/jQRangeSlider-5.6.0/css/classic-min.css?workerID=${workerID}`}/>
//                 <link rel="stylesheet" type='text/css' href={`libs/colorpicker/colorpicker.css?workerID=${workerID}`}/>
//                 <link rel="stylesheet" type='text/css' href={`libs/bootstrap/css/bootstrap.css?workerID=${workerID}`}/>
//                 <link rel="stylesheet" type='text/css' href={`libs/bootstrap-slider/css/bootstrap-slider.css?workerID=${workerID}`}/>
//                 <link rel="stylesheet" type='text/css' href={`libs/bootstrap-switch.min.css?workerID=${workerID}`}/>
//                 <link rel="stylesheet" type='text/css' href={`libs/bootstrap.vertical-tabs.min.css?workerID=${workerID}`}/>
//
// {/*
//                 <link rel="stylesheet" type='text/css' href="libs/font-awesome/css/font-awesome.css"/>
//                 <link rel="stylesheet" type='text/css' href="css/nunito.css"/>
//
//                 <link rel="stylesheet" type='text/css' href="libs/backgrid.min.css"/>
//                 <link rel="stylesheet" type='text/css' href="libs/backgrid-paginator.min.css"/>
// */}
//                 { /* App */ }
// {/*
//                 <link rel="stylesheet" type='text/css' href="css/gpustreaming.css" media="screen" charset="utf-8"/>
// */}
//                 { /* <link rel="stylesheet" type='text/css' href="css/graph.css" media="screen" charset="utf-8"> */ }
//
//                 <link rel='stylesheet' type='text/css' href={`${assets.client.css}?workerID=${workerID}`}/>
//
// {/*
//                 <link rel="shortcut icon" href="/favicon.ico"/>
// */}
//                 <script type="text/javascript" src={`libs/jquery-2.1.1.js?workerID=${workerID}`}></script>
//                 { /* Libs (bootstrap etc.) */ }
//                 <script type="text/javascript" src={`libs/jquery-ui-1.10.4.min.js?workerID=${workerID}`}></script>
//                 <script type="text/javascript" src={`libs/jQRangeSlider-5.6.0/jQAllRangeSliders-min.js?workerID=${workerID}`}></script>
//                 <script type="text/javascript" src={`libs/colorpicker/colorpicker.js?workerID=${workerID}`}></script>
// {/*
//                 <script type="text/javascript" src="libs/underscore-min.js"></script>
//                 <script type="text/javascript" src="libs/jquery.mousewheel-3.1.9.js"></script>
//                 <script type="text/javascript" src="libs/spin.min.js"></script>
// */}
//
//                 { /* FIXME: Package Quo and bundle with StreamGL */ }
// {/*
//                 <script type="text/javascript" src="libs/quo.js"></script>
//
//                 <script type="text/javascript" src="libs/bootstrap/js/bootstrap.js"></script>
//                 <script type="text/javascript" src="libs/bootstrap-slider/js/bootstrap-slider.js"></script>
//                 <script type="text/javascript" src="libs/bootstrap-switch.min.js"></script>
// */}
//
//                 { /* Ace editor, ideally delayed until used. */ }
// {/*
//                 <script type="text/javascript" src="libs/ace/src-noconflict/ace.js"></script>
//                 <script type="text/javascript" src="libs/ace/src-noconflict/ext-language_tools.js"></script>
// */}
//
//                 { /* FIXME: Include fpsmeter as part of the StreamGL bundle */ }
// {/*
//                 <script type="text/javascript" src="libs/fpsmeter.js" charset="utf-8"></script>
// */}
//             </head>
//             <body class_={{ [styles["graphistry-body"] || "graphistry-body"]: true }}>{[
//                 /* copied from index.fragment.handlebars */
//                 <script type="text/javascript">{[`
//                     var templatePaths = { API_ROOT: window.location.protocol + "//" + window.location.host + "/" };
//                 `]}</script>,
//                 /* GA init is done in StreamGL */
//                 <script type="text/javascript">{[`
//                     (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
//                     (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
//                     m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
//                     })(window,document,'script','//www.google-analytics.com/analytics.js','ga');
//                 `]}</script>,
//
//                 <script type="text/javascript">{[`
//                     // window.addEventListener("beforeunload", function (){ console.clear(); });
//                     // window.addEventListener("DOMContentLoaded", function () {$('[data-toggle="tooltip"]').tooltip();});
//                     // $.fn.bootstrapSwitch.defaults.size = 'small';
//                 `]}</script>,
//
//                 vdom,
//
//                 <script type="text/javascript">{[`
//                     $(function() {
//                         var legend = $('#graph-legend');
//                         $('.hider', legend).on('click', function() {
//                             legend.removeClass('on').addClass('off');
//                         });
//                         $('.revealer', legend).on('click', function() {
//                             legend.removeClass('off').addClass('on');
//                         });
//                     });
//                 `]}</script>,
//                 <script type="text/javascript">{[`
//                     window.appCache = ${stringify(model && model.getCache() || {})};
//                 `]}</script>,
//                 <script type="text/javascript" src={`${assets.client.js}?workerID=${workerID}`}></script>
//             ]}</body>
//         </html>
//         )}`
//     );
// }

// When we're running behind the nginx reverse proxy, with multiple workers, subrequests needs to
// be of the form `/worker/xxx/<request path>`. This function examines the `X-Original-Uri` and
// `X-Resolved-Uri` headers added by our nginx config to get the base path and path prefix we should
// be using for subrequests.
function getProxyPaths(req) {
    // If these headers aren't set, assumed we're not begind a proxy
    if(!req.get('x-original-uri') || !req.get('x-resolved-uri')) {
        return null;
    }

    const base = `${req.protocol}//${req.get('host')}${req.get('x-resolved-uri')}`;

    const { pathname: originalPathname } = url.parse(req.get('x-original-uri'));
    const { pathname: resolvedPathname } = url.parse(req.get('x-resolved-uri'));

    if(!resolvedPathname.endsWith(originalPathname)) {
        return { base: base, prefix: '' };
    }

    const prefix = resolvedPathname.substr(0, resolvedPathname.length - originalPathname.length);
    return {base, prefix};
}
