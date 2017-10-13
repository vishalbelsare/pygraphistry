import url from 'url';

/**
 *  Parses the URL *as seen by the browser*, and converts the query parameters into a set of
 *  nominally valid, normalized program options.
 *
 *  NB: This functions uses the browser's `window.location.href` URL as the source of program
 *  options. This may differ from the URL of the request as seen by the viz-app server, once nginx
 *  and others have rewritten, redirected, and reverse proxied the request from the browser to the
 *  viz-app server. Since running in local dev mode doesn't use nginx, you won't observe that
 *  behavior when running locally; however, this behavior is almost *always* happening when deployed
 *  to a server.
 *
 *  @param   {String}    href   The full URL from the browser.
 *
 *  @return  {Object}    An object with keys corresponding to each nominally valid, normalized
 *  parameter in the URL query string, with their corresponding values.
 */
export function getURLParameters(href) {
    const { query = {} } = url.parse(href, true);
    var options = { client: 'main' };

    for (var param in query) {
        if (!query.hasOwnProperty(param)) {
            continue;
        }

        // Special-case normalization for certain params
        switch (param) {
            case 'static':
                options.client = 'static';
                continue;
            case 'offline':
                options.client = 'offline';
                continue;
            case 'datasetname':
                options.dataset = query.datasetname;
                break;
        }

        // Normalize param value
        switch (query[param].toLowerCase()) {
            case '':
            case 'yes':
            case 'true':
                options[param] = true;
                break;
            case 'no':
            case 'false':
                options[param] = false;
                break;
            case 'null':
                options[param] = null;
                break;
            default:
                options[param] = !isNaN(query[param]) ? Number(query[param]) : query[param];
                break;
        }
    }

    return options;
}
