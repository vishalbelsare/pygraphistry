import { Model, reaxtor } from 'reaxtor';
import assets from '../webpack-assets.json'
import initHTML from 'snabbdom-to-html/init';
import snabbdomToHTMLClass from 'snabbdom-to-html/modules/class';
import snabbdomToHTMLProps from 'snabbdom-to-html/modules/props';
import snabbdomToHTMLStyle from 'snabbdom-to-html/modules/style';
import snabbdomToHTMLAttributes from 'snabbdom-to-html/modules/attributes';

import { inspect } from 'util';
import { Observable } from 'rxjs';

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
            .map(([model, vdom]) => renderVDomToHTMLPage(model, vdom))
            .subscribe({
                next(html) {
                    res.type('html').send(html);
                },
                error(e, error = e && e.stack || inspect(e, { depth: null })) {
                    console.error(error);
                    if (e.boundPath) {
                        console.error(JSON.stringify(e.boundPath));
                        console.error(JSON.stringify(e.shortedPath));
                    }
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
    return (
    `<!DOCTYPE html>${toHTML(
    <html lang='en-us'>
        <head>
             <link rel='stylesheet' type='text/css' href={assets.client.css || ''}/>
        </head>
        <body>{[
            vdom,
            <script type='text/javascript'>{[`
                window.appCache = ${JSON.stringify(model && model.getCache() || {})};
            `]}</script>,
            <script src={assets.client.js}></script>
        ]}</body>
    </html>)}`);
}
