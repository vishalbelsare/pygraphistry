import { Observable } from 'rxjs';

export class Connector {
    constructor({ id, name }) {
        this.id = id;
        this.name = name;
        this.lastUpdated = Date.now();
        this.status = {
            level: 'info',
            message: 'Health checks have never been run.'
        };
    }

    search() {
        return Observable.throw(new Error(`Search not implemented for connector: ${this.name}`));
    }

    healthCheck() {
        return Observable.throw(
            new Error(`Health check not implemented for connector: ${this.name}`)
        );
    }
}
