import { inspect } from 'util';
import { Observable } from 'rxjs';
import { Model } from '@graphistry/falcor';
import assets from '../webpack-assets.json'
import { renderToString as reactRenderToString } from 'react-dom/server';
import fetchDataUntilSettled from '@graphistry/falcor-react-redux/lib/utils/fetchDataUntilSettled';

// const renderServerSide = false;
const renderServerSide = true;

export function renderMiddleware(getDataSource, modules) {
    return function renderMiddleware(req, res) {
        try {

            const renderedResults = !renderServerSide ?
                Observable.of(renderFullPage()) :
                renderAppWithHotReloading(modules, getDataSource(req));

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


function renderAppWithHotReloading(modules, dataSource, options = {}) {
    return modules
        .map(({ App }) => ({
            App, falcor: new Model({ source: dataSource })
        }))
        .switchMap(
            ({ App, falcor }) => fetchDataUntilSettled({
                data: {}, falcor, fragment: App.fragment
            }),
            ({ App, falcor }, { data }) => ({ App, falcor, data })
        )
        .map(({ App, falcor, data }) => renderFullPage(falcor));
}

function renderFullPage(model, html = '') {
    return (
    `<!DOCTYPE html>
    <html lang='en-us'>
        <head>
             <link rel='stylesheet' type='text/css' href='${assets.client.css || ''}'/>
        </head>
        <body>
        <div id='app'>${html}</div>
        <script type='text/javascript'>
            window.appCache = ${JSON.stringify(model && model.getCache() || {})};
        </script>
        <script src='${assets.client.js}'></script>
        </body>
    </html>`
    );
}
