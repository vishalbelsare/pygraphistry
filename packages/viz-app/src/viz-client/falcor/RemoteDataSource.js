import { Observable } from 'rxjs/Observable';
import { FalcorPubSubDataSource } from '@graphistry/falcor-socket-datasource';

export class RemoteDataSource extends FalcorPubSubDataSource {
    constructor(...args) {
        super(...args);
        this.emitter.on('falcor-update', this.falcorUpdateHandler.bind(this));
    }
    falcorUpdateHandler({ paths, invalidated, jsonGraph }, handshake) {
        const { model } = this;
        if (model) {
            if (invalidated && Array.isArray(invalidated) && invalidated.length) {
                model.invalidate(...invalidated);
            }
            if (paths && jsonGraph) {
                model._setJSONGs(model, [{ paths, jsonGraph }]);
                model._root.onChangesCompleted &&
                model._root.onChangesCompleted.call(model);
            }
        }
        handshake && handshake();
    }
}
