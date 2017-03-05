//import { DataFrame } from 'dataframe-js';
import { Observable } from 'rxjs';
import logger from '../../../shared/logger.js';
import { Connector } from './connector.js';


class HttpConnector extends Connector {

    constructor({user, pwd, endpoint, isBatch, ...config}) {
        super(config);

        this.user = user;
        this.pwd = pwd;
        this.endpoint = endpoint;
        this.isBatch = isBatch || false;

        this.log = logger.createLogger(__filename).child();
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
