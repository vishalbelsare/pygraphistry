import express from 'express';
import { assert } from 'chai';
import mkdirp from 'mkdirp';
import { Observable } from 'rxjs';
import request from 'request';
const get = Observable.bindNodeCallback(request.get.bind(request));

import { ManualPivot } from '../../../src/shared/services/templates/manual';


describe('manualPivot', function () {


    const MANUAL = new ManualPivot({
        id: 'manual-data',
        name: 'Enter data',
        tags: ['Demo', 'Splunk'],
        attributes: [ ],
        connections: [ ],    
        parameters: [
            {
                name: 'events',
                inputType: 'textarea',
                label: 'Events (json)'
            },
            {
                name: 'nodes',
                inputType: 'multi',
                label: 'Nodes:',
                options: [],
            },
            {
                name: 'attributes',
                inputType: 'multi',
                label: 'Attributes:',
                options: [],
            }
        ]
    });


    it('simple object', (done) => {
        MANUAL.searchAndShape({
                app: {}, 
                pivot: {
                    id: 'x',
                    enabled: true, 
                    pivotParameters: {'manual-data$$$events': '{"x": 1, "y": "aa", "z": ["a","b"]}'}                    
                }, 
                pivotCache: {}})
            .subscribe(({pivot, ...rest}) => {
                    const base = {x: 1, y: 'aa', 'z.0': 'a', 'z.1': 'b', EventID: 'x:0'};
                    assert.deepEqual(pivot.events, [base]);
                    const base2 = {...base, source: 'x:0'};
                    assert.deepEqual(pivot.results.graph, 
                        [{ ...base2, destination: 1, edgeType: 'EventID->x', edgeTitle: 'x:0->1'},
                         { ...base2, destination: 'aa', edgeType: 'EventID->y', edgeTitle: 'x:0->aa'},
                         { ...base2, destination: 'a', edgeType: 'EventID->z.0', edgeTitle: 'x:0->a'},
                         { ...base2, destination: 'b', edgeType: 'EventID->z.1', edgeTitle: 'x:0->b'}]);
                    assert.deepEqual(pivot.results.labels,
                        [{ ...base, node: 'x:0', type: 'EventID'},
                         { node: 1, type: 'x'},
                         { node: 'aa', type: 'y'},
                         { node: 'a', type: 'z.0'},
                         { node: 'b', type: 'z.1' }
                         ]);
                    done();
                }, (e) => done(new Error(e)));
    });

    it('valid array', (done) => {
        MANUAL.searchAndShape({
                app: {}, 
                pivot: {
                    id: 'x',
                    enabled: true, 
                    pivotParameters: {'manual-data$$$events': '[{"x": 1},{"x":3}]'}                   
                }, 
                pivotCache: {}})
            .subscribe(({pivot, ...rest}) => {
                    assert.deepEqual(pivot.events, [{x: 1, EventID:'x:0'}, {x: 3, EventID:'x:1'}]);
                    const base = {edgeType: 'EventID->x'};
                    assert.deepEqual(pivot.results.graph, 
                        [{ ...base, EventID: 'x:0', x:1, destination: 1, 'source': 'x:0', edgeTitle: 'x:0->1'},
                         { ...base, EventID: 'x:1', x:3, destination: 3, 'source': 'x:1', edgeTitle: 'x:1->3'}]);
                    assert.deepEqual(pivot.results.labels,
                        [{ EventID: 'x:0', x: 1, node: 'x:0', type: 'EventID' },
                         { node: 1, type: 'x'},
                         { EventID: 'x:1', x: 3, node: 'x:1', type: 'EventID' },
                         { node: 3, type: 'x'} ]);
                    done();
                }, (e) => done(new Error(e)));
    });

    it('valid array with EventIDs', (done) => {
        MANUAL.searchAndShape({
                app: {}, 
                pivot: {
                    id: 'x',
                    enabled: true, 
                    pivotParameters: {'manual-data$$$events': '[{"x": 1, "EventID": "aa"},{"x":3, "EventID": "bb"}]'}                 
                }, 
                pivotCache: {}})
            .subscribe(({pivot, ...rest}) => {
                    assert.deepEqual(pivot.events, [{x: 1, EventID:'aa'}, {x: 3, EventID:'bb'}]);
                    assert.deepEqual(pivot.results.graph, 
                        [{EventID: 'aa', x:1, destination: 1, 'source': 'aa', edgeType: 'EventID->x', edgeTitle: 'aa->1'},
                         {EventID: 'bb', x:3, destination: 3, 'source': 'bb', edgeType: 'EventID->x', edgeTitle: 'bb->3'}]);
                    assert.deepEqual(pivot.results.labels,
                        [{ EventID: 'aa', x: 1, node: 'aa', type: 'EventID'},
                         { node: 1, type: 'x' },
                         { EventID: 'bb', x: 3, node: 'bb', type: 'EventID'},
                         { node: 3, type: 'x' } ]);
                    done();
                }, (e) => done(new Error(e)));
    });

    it('parse error', (done) => {
        MANUAL.searchAndShape({
                app: {}, 
                pivot: {
                    id: 'x',
                    enabled: true, 
                    pivotParameters: {'manual-data$$$events': 'zz'}                   
                }, 
                pivotCache: {}})
            .subscribe(
                ({pivot, ...rest}) => done(new Error("Expected parse error")),
                (e) => {
                    if (e.name === 'JsonParseError') done();
                    else done(new Error(e))
                });
    });

});