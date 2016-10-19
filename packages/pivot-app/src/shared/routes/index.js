import { app } from './app';
import { pivots } from './pivots';
import { investigations } from './investigations';
import { users } from './users';
import { templates } from './templates';

export function routes(services) {
    return ([]
        .concat(app(services))
        .concat(pivots(services))
        .concat(investigations(services))
        .concat(users(services))
        .concat(templates(services))
    );
}
