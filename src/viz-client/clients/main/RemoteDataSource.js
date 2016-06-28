import DataSource from 'falcor-http-datasource';

const whiteListedParams = [
    'bg', 'view', 'type', 'scene',
    'device', 'mapper', 'vendor', 'usertag',
    'dataset', 'workbook', 'controls', 'viztoken'
];

export class RemoteDataSource extends DataSource {

    constructor(url, config, options) {
        super(url, config);
        this.extraRequestParams = whiteListedParams.reduce((params, key) => {
            if (options.hasOwnProperty(key)) {
                params.push(`${key}=${options[key]}`);
            }
            return params;
        }, []).join('&');
    }

    onBeforeRequest(config) {
        const { extraRequestParams } = this;
        if (extraRequestParams) {
            if (config.data) {
                config.data += '&' + extraRequestParams;
            } else if (config.url) {
                config.url += '&' + extraRequestParams;
            }
        }
    }
}
