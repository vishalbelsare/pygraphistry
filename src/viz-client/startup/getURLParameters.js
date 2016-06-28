export function getURLParameters(debug, query) {

    const params = (query || '').split('&').reduce((params, pair) => {

        const tok = pair.split('=');
        let key = decodeURIComponent(tok.shift());
        let val = decodeURIComponent(tok.join('='));

        switch (val.toLowerCase()) {
            case '':
            case 'yes':
            case 'true':
                val = true;
                break;
            case 'no':
            case 'false':
                val  = false;
                break;
            case 'null':
                val = null;
                break;
            default:
                val = !isNaN(val) ? Number(val) : val;
                break;
        }

        if (key === 'static') {
            key = 'client';
            val = 'static';
        } else if (key === 'offline') {
            key = 'client';
            val = 'offline';
        }

        params[key] = val;

        return params;
    }, { client: 'main' });

    // For compatibility with old way of specifying dataset
    if (params.hasOwnProperty('datasetname')) {
        params.dataset = params.datasetname;
    }

    debug('Parsed URL parameters:', params);

    return params;
}

