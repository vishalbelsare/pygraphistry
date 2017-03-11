//import { DataFrame } from 'dataframe-js';
import { Observable } from 'rxjs';
import { VError } from 'verror'
import request from 'request';
const get = Observable.bindNodeCallback(request.get.bind(request));

import logger from '../../../shared/logger.js';
import { Connector } from './connector.js';
const log = logger.createLogger(__filename);


class HttpConnector extends Connector {    

    constructor({user, pwd, endpoint, isBatch, timeout_s = 20, ...config}) {
        super(config);

        this.user = user;
        this.pwd = pwd;
        this.endpoint = endpoint;
        this.isBatch = isBatch || false;

        this.timeout_s = timeout_s;

    }

    search (url) {

        log.debug('HttpConnector get', url);

        return get(url)
            .catch((e) => {
                return Observable.throw(
                    new VError({
                        name: 'HttpConnectorGet',
                        cause: e,
                        info: { url },
                    }, 'Failed to make http request', url)
                );
            })
            .do(([response]) => {
                log.trace(response);
                if (!response || response.statusCode !== 200) {
                    const info = { url, statusCode: (response||{}).statusCode };
                    throw new VError({
                            name: 'HttpStatusError',
                            info: info,
                        }, 'URL gave an unexpected response code', info);
                }
            })            
            .timeoutWith(this.timeout_s * 1000, Observable.throw(new VError({
                    name: 'Timeout',
                    info: `Max wait: ${this.timeout_s} seconds`
                }, 'URL took too long to respond')));
    }



    healthCheck() {
        return Observable
            .of('Health checks passed')
            .do(this.log.info('Health checks passed for HTTP connnector'));
    }

}


export const httpConnector0 = new HttpConnector({
    id:'http-connector',
    name : 'HTTP'
});
