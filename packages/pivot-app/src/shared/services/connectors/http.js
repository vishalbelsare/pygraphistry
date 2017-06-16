import { Observable } from 'rxjs';
import { VError } from 'verror'
import request from 'request';
const get = Observable.bindNodeCallback(request.get.bind(request));
const post = Observable.bindNodeCallback(request.post.bind(request));

import logger from '../../../shared/logger.js';
import { Connector } from './connector.js';
const log = logger.createLogger(__filename);


class HttpConnector extends Connector {    

    constructor({timeout_s = 20, ...config}) {
        super(config);
        this.timeout_s = timeout_s;
    }

    search (url, { method = 'GET', timeout, body, headers = {} } = { } ) {

        log.info(`HttpConnector ${method}`, url, body);
        log.debug('Using timeout: ', (timeout || this.timeout_s) * 1000);

        const reqBase = {url, headers, gzip: true};
        const req = 
            method === 'GET' ? get(reqBase)
                : post({...reqBase, body});

        const t0 = Date.now();

        return req.catch((e) => {
                return Observable.throw(
                    new VError({
                        name: 'HttpConnectorGet',
                        cause: e,
                        info: { url },
                    }, 'Failed to make http request', url)
                );
            })
            .do(([response]) => {
                log.info('Download time', Date.now() - t0, 'ms');
                log.trace(response);
                const statusCode = (response||{}).statusCode;
                if (statusCode !== 200) {
                    log.error({msg: 'error', statusCode, 
                        method,
                        headers,
                        requestBody: body,
                        responseBody: (response||{}).body});                    

                }
                if (statusCode === 401) {
                    throw new VError({
                            name: 'HttpStatusError',
                            info: {url},
                        }, 'Unauthorized error for URL', {url});

                } else if (statusCode !== 200) {
                    const info = { url, statusCode };
                    throw new VError({
                            name: 'HttpStatusError',
                            info: info,
                        }, 'URL gave an unexpected response code: ' 
                            + (statusCode || 'none available'), info);
                }
            })            
            .timeoutWith((timeout || this.timeout_s) * 1000, Observable.throw(new VError({
                    name: 'Timeout',
                    info: `Max wait: ${this.timeout_s} seconds`
                }, 'URL took too long to respond')));
    }



    healthCheck() {
        return Observable
            .of('Health checks passed')
            .do(() => log.info('Health checks passed for HTTP connnector'));
    }

}


export const defaultHttpConnector = new HttpConnector({
    id:'http-connector',
    name : 'HTTP'
});
