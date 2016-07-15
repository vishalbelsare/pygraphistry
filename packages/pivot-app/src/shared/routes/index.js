import { app } from './app';
import { pivots } from './pivots';
import { investigations } from './investigations';

export function routes(services) {
    return ([]
        .concat(app(services))
        .concat(pivots(services))
        .concat(investigations(services))
    );
}
