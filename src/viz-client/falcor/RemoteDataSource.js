import SocketDataSource from '@graphistry/falcor-socket-datasource';

export class RemoteDataSource extends SocketDataSource {
    constructor(url, config) {
        super(url, config, 'falcor-request', 'cancel-falcor-request');
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
        }
    }
}
