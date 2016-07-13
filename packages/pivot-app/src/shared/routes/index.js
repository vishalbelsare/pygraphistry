import { app } from './app';
import { rows } from './rows';

export function routes(services) {
    return ([]
        .concat(app(services))
        .concat(rows(services))
    );
}
