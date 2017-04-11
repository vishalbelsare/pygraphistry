import { assert } from 'chai';
import { Observable } from 'rxjs';

import { loadAppFactory, userStore, templateStore, investigationStore, pivotStore } 
    from '../../src/shared/services';
import { createAppModel, makeTestUser } from '../../src/shared/models';

describe('PivotStore basic', function() {
        
    let loadApp;
    let loadTemplatesById;        
    const loadPivotStore = function () {
        return pivotStore(loadApp, '.', loadTemplatesById);
    };
    beforeEach(function createStore() {

        ////////////////////////
        const investigations = [];
        const templates = [];
        const connectors = [];
        ////////////////////////


        const testUser = makeTestUser(investigations, templates, connectors, '.', '.');
        const app = createAppModel(testUser);
        loadApp = loadAppFactory(app);

        const { loadUsersById } = userStore(loadApp);
        const tCache = templateStore(loadApp);
        loadTemplatesById = tCache.loadTemplatesById;

        const {
            loadInvestigationsById,
            unloadInvestigationsById,
            persistInvestigationsById,
            unlinkInvestigationsById,
        } = investigationStore(loadApp, '.');
    });

    it('construct empty', function (done) {
        loadPivotStore();
        done();
    });

    it('load nothing', function (done) {
        const { loadPivotsById } = loadPivotStore();

        loadPivotsById({pivotIds: []})
            .toArray()
            .subscribe(
                (arr) => {
                    assert.deepEqual(arr.length, 0);
                },
                done,
                () => done());
    });

    /*
    it('load simple pivot', function (done) {
        const { loadPivotsById } = loadPivotStore();
        console.log('===== START ==== ');
        loadPivotsById({pivotIds: ['zz']})
            .toArray()
            .subscribe(
                (arr) => {
                    console.log('==== arr', arr);
                    //assert.deepEqual(arr.length, 1);
                },
                (e) => { console.log('errrr', e); done(e); },
                (v) => { console.log('complete', v); done('e'); });
        console.log('===== /DONE ==== ');
    });
    */

    /*
        TODO test loading pivot will fill in parameters based on template

    */

});

