import { Observable } from 'rxjs';
import whois from 'node-whois';
import { parseWhoIsData as parse } from 'parse-whois';
import VError from 'verror';
import { Connector } from './connector.js';
import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);


class WhoisConnector extends Connector {
    constructor(config) {
        super(config);
    }

    healthCheck() {
        const lookup = Observable.bindNodeCallback(whois.lookup);

        return lookup(WhoisConnector.testIP)
            .map((response) => {
                return parse(response)
                    .filter(({attribute}) => (attribute === 'Organization'));

            })
            .map(([{value}]) => `WHOIS resolved ${WhoisConnector.testIP}'s organization to: ${value}`)
            .catch((err) =>
                    Observable.throw(
                        new VError({
                            cause: err,
                            name: 'Whois lookup failed'
                        }, 'Could not connect to whois')
                    )
            );

    }
}

WhoisConnector.testIP = '64.233.160.0';

export const whoisConnector0 = new WhoisConnector({
    id: 'whois-connection',
    name: 'WHOIS',
});
