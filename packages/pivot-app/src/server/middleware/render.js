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
        .map(({ App, falcor, data }) => renderFullPage(falcor));
}

function renderFullPage(model, html = '') {
    return (
    `<!DOCTYPE html>
    <html lang='en-us'>
        <head>

            <meta charset="utf-8" />
            <link rel="icon" type="image/png" href="assets/img/favicon.ico" />
            <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1" />

            <title>Graphistry Visual Playbook Environment</title>

            <meta content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0' name='viewport' />
            <meta name="viewport" content="width=device-width" />


            <link href="/themes/x_lbd_free_v1.3/assets/css/bootstrap.min.css" rel="stylesheet" />

            <link href="/themes/x_lbd_free_v1.3/assets/css/animate.min.css" rel="stylesheet"/>

            <link href="/themes/x_lbd_free_v1.3/assets/css/light-bootstrap-dashboard.css" rel="stylesheet"/>

            <link href="/themes/x_lbd_free_v1.3/assets/css/font-awesome.min.css" rel="stylesheet" />
            <link href='/themes/x_lbd_free_v1.3/assets/css/roboto.css' rel='stylesheet' type='text/css' />
            <link href="/themes/x_lbd_free_v1.3/assets/css/pe-icon-7-stroke.css" rel="stylesheet" />

            <link href="/custom/css/style.css" rel="stylesheet" />

            <link rel='stylesheet' type='text/css' href='${assets.client.css || ''}'/>
        </head>
        <body>
        <div id='app'>${html}</div>
        <script type='text/javascript'>
            window.appCache = ${JSON.stringify(model && model.getCache() || {})};
        </script>
        <script src='${assets.client.js}'></script>
        <script src="/themes/x_lbd_free_v1.3/assets/js/jquery-1.10.2.js" type="text/javascript"></script>
        <script src="/themes/x_lbd_free_v1.3/assets/js/bootstrap.min.js" type="text/javascript"></script>
        <script src="/themes/x_lbd_free_v1.3/assets/js/bootstrap-checkbox-radio-switch.js"></script>
        <script src="/themes/x_lbd_free_v1.3/assets/js/chartist.min.js"></script>
        <script src="/themes/x_lbd_free_v1.3/assets/js/bootstrap-notify.js"></script>
        <script src="/themes/x_lbd_free_v1.3/assets/js/light-bootstrap-dashboard.js"></script>
        <script src="/themes/x_lbd_free_v1.3/assets/js/demo.js"></script>
        <script src="/custom/js/demo.js"></script>
        </body>
    </html>`
    );
}
