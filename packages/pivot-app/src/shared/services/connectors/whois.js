import logger from '../../logger.js';

import { Observable } from 'rxjs';
import whois from 'node-whois';
import { parseWhoIsData as parse } from 'parse-whois';
import VError from 'verror';

const log = logger.createLogger('pivot-app', __filename);

export const WhoisConnector = {
    id: 'whois-connection',
    name: 'WHOIS',
    lastUpdated: new Date().toLocaleString(),
    status: {
        level: 'info',
        message: null
    },

    healthCheck: function healthCheck() {
        const lookup = Observable.bindNodeCallback(whois.lookup);
        const testIP = '64.233.160.0';
        return lookup(testIP)
            .map((response) => {
                return parse(response)
                    .filter(({attribute}) => (attribute === 'Organization'));

            })
            .map(([{value}]) => `WHOIS resolved ${testIP}'s organization to: ${value}`)
            .catch((err) =>
                    Observable.throw(
                        new VError({
                            cause: err,
                            name: 'Whois lookup failed'
                        }, 'Could not connect to whois')
                    )
            );
    }
};
