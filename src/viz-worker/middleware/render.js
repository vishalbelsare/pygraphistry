import { Model, reaxtor } from 'reaxtor';
// import assets from './webpack-assets.json';
import stringify from 'json-stable-stringify';
import styles from '../../viz-shared/views/graph.less';

import initHTML from 'snabbdom-to-html/init';
import snabbdomToHTMLClass from 'snabbdom-to-html/modules/class';
import snabbdomToHTMLProps from 'snabbdom-to-html/modules/props';
import snabbdomToHTMLStyle from 'snabbdom-to-html/modules/style';
import snabbdomToHTMLAttributes from 'snabbdom-to-html/modules/attributes';

import { inspect } from 'util';
import { Observable } from '@graphistry/rxjs';

const toHTML = initHTML([
    snabbdomToHTMLClass,
    snabbdomToHTMLProps,
    snabbdomToHTMLStyle,
    snabbdomToHTMLAttributes
]);

const renderServerSide = true;

export function renderMiddleware(getDataSource, modules) {
    return function renderMiddleware(req, res) {
        try {
            Observable.if(
                () => !renderServerSide,
     /* then */ Observable.of([null, <div id='app'/>]),
     /* else */ modules.switchMap(({ App }) =>
                    reaxtor(App, new Model(
                           { source: getDataSource(req) }),
                           {...req.cookies, ...req.query})
                )
            )
            .debounceTime(0)
            .take(1)
            .map(([model, [appState, vdom]]) => renderVDomToHTMLPage(model, vdom))
            .subscribe({
                next(html) {
                    res.type('html').send(html);
                },
                error(e, error = e && e.stack || inspect(e, { depth: null })) {
                    console.error(error);
                    res.status(500).send(toHTML(<pre>{error}</pre>));
                }
            });
        } catch (e) {
            const error = e && e.stack || inspect(e, { depth: null });
            console.error(error);
            res.status(500).send(toHTML(<pre>{error}</pre>));
        }
    }
}

function renderVDomToHTMLPage(model, vdom) {
    const assets = require('./webpack-assets.json');
    return (`<!DOCTYPE html>
${toHTML(<html lang='en-us'>
            <head>
                <meta charset="utf-8"/>
                <meta name="robots" content="noindex, nofollow"/>
                <meta http-equiv='x-ua-compatible' content='ie=edge'/>
                <meta name='viewport' content='width=device-width, initial-scale=1'/>

                <link rel="stylesheet" type='text/css' href="css/jquery-ui-1.10.4.css"/>
                <link rel="stylesheet" type='text/css' href="libs/jQRangeSlider-5.6.0/css/classic-min.css"/>
                <link rel="stylesheet" type='text/css' href="libs/colorpicker/colorpicker.css"/>
                <link rel="stylesheet" type='text/css' href="libs/bootstrap/css/bootstrap.css"/>
                <link rel="stylesheet" type='text/css' href="libs/bootstrap-slider/css/bootstrap-slider.css"/>
                <link rel="stylesheet" type='text/css' href="libs/bootstrap-switch.min.css"/>
                <link rel="stylesheet" type='text/css' href="libs/bootstrap.vertical-tabs.min.css"/>

                <link rel="stylesheet" type='text/css' href="libs/font-awesome/css/font-awesome.css"/>
                <link rel="stylesheet" type='text/css' href="css/nunito.css"/>

                <link rel="stylesheet" type='text/css' href="libs/backgrid.min.css"/>
                <link rel="stylesheet" type='text/css' href="libs/backgrid-paginator.min.css"/>

                { /* App */ }
                <link rel="stylesheet" type='text/css' href="css/gpustreaming.css" media="screen" charset="utf-8"/>
                { /* <link rel="stylesheet" type='text/css' href="css/graph.css" media="screen" charset="utf-8"> */ }
                <link rel='stylesheet' type='text/css' href={assets.client.css || ''}/>

                <link rel="shortcut icon" href="/favicon.ico"/>

                <script type="text/javascript" src="libs/jquery-2.1.1.js"></script>
                { /* Libs (bootstrap etc.) */ }
                <script type="text/javascript" src="libs/jquery-ui-1.10.4.min.js"></script>
                <script type="text/javascript" src="libs/underscore-min.js"></script>
                <script type="text/javascript" src="libs/jquery.mousewheel-3.1.9.js"></script>
                <script type="text/javascript" src="libs/jQRangeSlider-5.6.0/jQAllRangeSliders-min.js"></script>
                <script type="text/javascript" src="libs/colorpicker/colorpicker.js"></script>
                <script type="text/javascript" src="libs/spin.min.js"></script>

                { /* FIXME: Package Quo and bundle with StreamGL */ }
                <script type="text/javascript" src="libs/quo.js"></script>

                <script type="text/javascript" src="libs/bootstrap/js/bootstrap.js"></script>
                <script type="text/javascript" src="libs/bootstrap-slider/js/bootstrap-slider.js"></script>
                <script type="text/javascript" src="libs/bootstrap-switch.min.js"></script>

                { /* Ace editor, ideally delayed until used. */ }
                <script type="text/javascript" src="libs/ace/src-noconflict/ace.js"></script>
                <script type="text/javascript" src="libs/ace/src-noconflict/ext-language_tools.js"></script>

                { /* FIXME: Include fpsmeter as part of the StreamGL bundle */ }
                <script type="text/javascript" src="libs/fpsmeter.js" charset="utf-8"></script>
            </head>
            <body class_={{ [styles["graphistry-body"] || "graphistry-body"]: true }}>{[
                /* copied from index.fragment.handlebars */
                <script type="text/javascript">{[`
                    var templatePaths = { API_ROOT: window.location.protocol + "//" + window.location.host + "/" };
                `]}</script>,
                /* GA init is done in StreamGL */
                <script type="text/javascript">{[`
                    (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
                    (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
                    m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
                    })(window,document,'script','//www.google-analytics.com/analytics.js','ga');
                `]}</script>,
                <script type="text/javascript">{[`
                    window.addEventListener("beforeunload", function (){ console.clear(); });
                    window.addEventListener("DOMContentLoaded", function () {$('[data-toggle="tooltip"]').tooltip();});
                    $.fn.bootstrapSwitch.defaults.size = 'small';
                `]}</script>,

                vdom,

                <script type="text/javascript">{[`
                    $(function() {
                        var legend = $('#graph-legend');
                        $('.hider', legend).on('click', function() {
                            legend.removeClass('on').addClass('off');
                        });
                        $('.revealer', legend).on('click', function() {
                            legend.removeClass('off').addClass('on');
                        });
                    });
                `]}</script>,
                <script type="text/javascript">{[`
                    window.appCache = ${stringify(model && model.getCache() || {})};
                `]}</script>,
                <script type="text/javascript" src={assets.client.js}></script>
            ]}</body>
        </html>
        )}`
    );
}
