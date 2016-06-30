import { Model as FalcorModel } from 'reaxtor';
import { BehaviorSubject, Subject } from '@graphistry/rxjs';

export class Model extends FalcorModel {

    constructor(options) {

        super(options);

        let { _root, _root: {
            changes,
            onChangesCompleted: prevOnChangesCompleted
        }} = this;

        if (!changes) {

            changes = new Subject();

            _root.onChangesCompleted = function () {
                if (prevOnChangesCompleted) {
                    prevOnChangesCompleted.call(this);
                }
                changes.next();
            };

            (_root.changes = changes
                .multicast(() => new BehaviorSubject()))
                .connect();
        }
    }
    changes() {
        return this._root.changes
            .distinctUntilChanged(null, () => this.inspect())
            .mapTo(this);
    }
    _clone(opts) {
        const clone = new Model(this);
        for (let key in opts) {
            const value = opts[key];
            if (value === "delete") {
                delete clone[key];
            } else {
                clone[key] = value;
            }
        }
        if (clone._path.length > 0) {
            clone.setCache = void 0;
        }
        return clone;
    }
}
