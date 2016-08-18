import { Model as FalcorModel } from 'reaxtor-falcor';

export class Model extends FalcorModel {
    changes() {
        return super.changes().mapTo(this);
    }
}
