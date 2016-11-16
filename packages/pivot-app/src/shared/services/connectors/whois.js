import { Observable } from 'rxjs';
import VError from 'verror';

export class WhoisPivot {
    static login() {
        return Observable.throw(
            new VError({
                name: 'ConnectorError'
            }, 'WHOIS Connector')
        );
    }
    static get id() {
        return 'whois-connector';
    }
}
