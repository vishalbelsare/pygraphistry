import { assert } from 'chai';
import mkdirp from 'mkdirp';

import { SimpleFileSystemStore } from '../../src/shared/services/support';
import { loadAppFactory } from '../../src/shared/services';

function makeThing(id) {
    return { id, thing: true };
}

function assertThingLoaded(id) {
    return function({ app, thing }) {
        assert.deepEqual(thing, makeThing(id));
        assert.deepEqual(app.thingsById[id], makeThing(id));
    };
}

describe('SimpleFileSystemStore Load/Unload', function() {
    let store;

    beforeEach(function createStore() {
        const loadApp = loadAppFactory({ thingsById: {} });

        store = new SimpleFileSystemStore({
            loadApp,
            pathPrefix: 'test/appdata/pivots',
            entityName: 'thing',
            createModel: ({ id }) => makeThing(id),
            serializeModel: x => x,
            cache: {}
        });
    });

    it('loadById single valid id', function(done) {
        const id = '3dbf55904a77e964';

        store
            .loadById([id])
            .do(assertThingLoaded(id))
            .toArray()
            .do(values => {
                assert.lengthOf(values, 1);
            })
            .subscribe(() => {}, done, done);
    });

    it('loadById multiple valid ids', function(done) {
        store
            .loadById(['3dbf55904a77e964', '3dbf56157f9e4567'])
            .toArray()
            .do(values => {
                assert.lengthOf(values, 2);
            })
            .subscribe(() => {}, done, done);
    });

    it('loadById invalid id', function(done) {
        store
            .loadById(['notvalid'])
            .toArray()
            .do(values => {
                assert.lengthOf(values, 0);
            })
            .subscribe(() => {}, done, done);
    });

    it('unloadById single valid id', function(done) {
        const id = '3dbf55904a77e964';

        store
            .loadById([id])
            .switchMap(() => store.unloadById([id]))
            .toArray()
            .do(values => {
                assert.lengthOf(values, 1);
                const res = values[0];
                assert.deepEqual(res.thing, makeThing(id));
                assert.deepEqual(res.app.thingsById, {});
            })
            .subscribe(() => {}, done, done);
    });

    it('unloadById invalid id', function(done) {
        store
            .unloadById(['notvalid'])
            .toArray()
            .do(values => {
                assert.lengthOf(values, 0);
            })
            .subscribe(() => {}, done, done);
    });
});

describe('SimpleFileSystemStore Persist/Unlink', function() {
    const scratchPath = 'test/scratch';
    const id = '0';
    let writeStore;
    let readStore;

    before(function createScratch() {
        mkdirp.sync(scratchPath);
    });

    beforeEach(function createStore() {
        const loadAppEmpty = loadAppFactory({ thingsById: {} });
        const loadAppFilled = loadAppFactory({
            thingsById: {
                [id]: makeThing(id)
            }
        });

        writeStore = new SimpleFileSystemStore({
            loadApp: loadAppFilled,
            pathPrefix: scratchPath,
            entityName: 'thing',
            createModel: x => x,
            serializeModel: x => x,
            cache: {}
        });

        readStore = new SimpleFileSystemStore({
            loadApp: loadAppEmpty,
            pathPrefix: scratchPath,
            entityName: 'thing',
            createModel: x => x,
            serializeModel: x => x,
            cache: {}
        });
    });

    it('persistById persit+load is a noop', function(done) {
        writeStore
            .persistById([id])
            .toArray()
            .do(values => {
                assert.lengthOf(values, 1);
                const res = values[0];
                assert.deepEqual(res.thing, makeThing(id));
            })
            .switchMap(() => readStore.loadById([id]))
            .do(assertThingLoaded(id))
            .subscribe(() => {}, done, done);
    });

    it('unlinkById prevents future loading', function(done) {
        writeStore
            .persistById([id])
            .switchMap(() => writeStore.unlinkById([id]))
            .switchMap(() => readStore.loadById([id]))
            .toArray()
            .do(values => {
                assert.lengthOf(values, 0);
            })
            .subscribe(() => {}, done, done);
    });

    it('unlinkById is idempotent', function(done) {
        writeStore
            .persistById([id])
            .switchMap(() => writeStore.unlinkById([id]))
            .switchMap(() => writeStore.unlinkById([id]))
            .toArray()
            .do(values => {
                assert.lengthOf(values, 1);
            })
            .subscribe(() => {}, done, done);
    });
});
