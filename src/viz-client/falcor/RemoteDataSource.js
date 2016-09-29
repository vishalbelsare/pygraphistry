import SocketDataSource from '@graphistry/falcor-socket-datasource';

export class RemoteDataSource extends SocketDataSource {
    constructor(...args) {
        super(...args);
        this.socket.on('falcor-update', this.falcorUpdateHandler.bind(this));
    }
    falcorUpdateHandler({ paths, invalidated, jsonGraph }) {
        const { model } = this;
        if (!model) {
            return;
        }
        if (invalidated && Array.isArray(invalidated)) {
            model.invalidate(...invalidated);
        }
        if (paths && jsonGraph) {
            model._setJSONGs(model, [{ paths, jsonGraph }]);
            model._root.onChangesCompleted &&
            model._root.onChangesCompleted.call(model);
        }
    }
}
