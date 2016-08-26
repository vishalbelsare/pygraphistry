import { app } from './app';
import { rows } from './rows';
import { investigations } from './investigations';

export function routes(services) {
    return ([]
        .concat(app(services))
        .concat(rows(services))
        .concat(investigations(services))
    );
}
