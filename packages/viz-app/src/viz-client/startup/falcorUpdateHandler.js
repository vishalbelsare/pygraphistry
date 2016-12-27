import { Observable } from 'rxjs';

export function falcorUpdateHandler(model, updateObs) {
    const localRootModel = model.withoutDataSource();
    localRootModel._path = [];
    return updateObs.mergeMap((data) => {
        if (Array.isArray(data)) {
            return localRootModel.set(...data);
        } else if (('json' in data) || ('jsonGraph' in data)) {
            return localRootModel.set(data);
        }
        return Observable.empty();
    });
}
