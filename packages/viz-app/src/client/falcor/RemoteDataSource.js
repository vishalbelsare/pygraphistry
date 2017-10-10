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
      const { _root: modelRoot } = model;
      if (invalidated && Array.isArray(invalidated) && invalidated.length) {
        model.invalidate(...invalidated);
      }
      if (paths && jsonGraph) {
        var changed = model._setJSONGs(
          model,
          [{ paths, jsonGraph }],
          modelRoot.errorSelector,
          modelRoot.comparator,
          false
        )[2];
        if (changed && modelRoot.onChangesCompleted) {
          modelRoot.onChangesCompleted.call(model);
        }
      }
    }
    handshake && handshake();
  }
}
