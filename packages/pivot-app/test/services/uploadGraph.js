import { assert } from 'chai';
import * as uploadGraph from '../../src/shared/services/uploadGraph';

// 1. Stacked Bushy Graph tests.

describe('nonuniqueInvert', function() {
        it("should resemble invert", function() {
                const h = {a: 'x', b: 'x', c: 'y', d: 'z'};
                const hInvert = {x: ['a', 'b'], y: ['c'], z: ['d'] };
                assert.deepEqual(uploadGraph.nonuniqueInvert(h), hInvert);
            });
    });

describe('bindings', function() {
        it("should be backwards compatible", function() {
                assert.deepEqual(uploadGraph.bindings.sourceField, "source");
                assert.deepEqual(uploadGraph.bindings.destinationField, "destination");
            }); });  // this is used elsewhere in the codebase as literals!

const s = uploadGraph.bindings.sourceField;
const d = uploadGraph.bindings.destinationField;
const n1 = 'a';
const n2 = 'b';
const n3 = 'c';
const n4 = 'd';
const n5 = 'e';
const n6 = 'f';
const n7 = 'g';
const edges = [{Pivot: 0, [s]: n1, [d]: n2, edgeType: 'EventID->x'},
               {Pivot: 2, [s]: n3, [d]: n4, edgeType: 'EventID->x'},
               {Pivot: 1, [s]: n2, [d]: n6, edgeType: 'EventID->x'},
               {Pivot: 1, [s]: n2, [d]: n7, edgeType: 'EventID->x'},
               {Pivot: 1, [s]: n2, [d]: n4, edgeType: 'EventID->x'},
               {Pivot: 3, [s]: n4, [d]: n5, edgeType: 'EventID->x'}];
const undecoratedLabels = [{node: n1},
                           {node: n2},
                           {node: n3},
                           {node: n4},
                           {node: n5},
                           {node: n6},
                           {node: n7}];
const decoratedLabels = [{node: n1, x: 0, y: -2},
                         {node: n2, x: 0, y: 1},
                         {node: n3, x: 0, y: 12},
                         {node: n4, x: 0, y: 7},
                         {node: n5, x: 0, y: 19},
                         {node: n6, x: 1, y: 7},
                         {node: n7, x: 2, y: 7}];
const rows = {[n1]: 0, [n2]: 1, [n3]: 4, [n4]: 3, [n5]: 7, [n6]: 3, [n7]: 3};
const degrees = {[n1]: 1, [n2]: 4, [n3]: 1, [n4]: 3, [n5]: 1, [n6]: 1, [n7]: 1};
const rowColumnCounts = {0: 1, 1: 1, 3: 3, 4: 1, 7: 1};
const rowColumns = {[n1]: 0, [n2]: 0, [n3]: 0, [n4]: 0, [n5]: 0, [n6]: 1, [n7]: 2};
const fudgeX = 1;
const fudgeY = 2;
const spacerY = 1;
const xys = {[n1]: {x: 0, y: -2},
             [n2]: {x: 0, y: 1},
             [n3]: {x: 0, y: 12},
             [n4]: {x: 0, y: 7},
             [n5]: {x: 0, y: 19},
             [n6]: {x: 1, y: 7},
             [n7]: {x: 2, y: 7}};
const minLineLength = 10;
const maxLineLength = 100;
const pivotWrappedLineHeight = 0.5;
const types = {};
const axes = [{label: "Pivot 1", y: -fudgeY}, {label: "Pivot 2", y: (fudgeY + spacerY) * 2 * (2 - 1)}, {label: "Pivot 3", y: (fudgeY + spacerY) * 2 * (3 - 1)}, {label: "Pivot 4", y: (fudgeY + spacerY) * 2 * (4 - 1)}];
const edgeOpacity = 2.0 / Math.log10(100 + Object.values(xys).length);
const hugeDataStructure = {data: {graph: edges, labels: undecoratedLabels}};
const hugeDecoratedDataStructure = {data: {axes, edgeOpacity, graph: edges, labels: decoratedLabels}};

describe('edgesToRows', function() {
        it('should pull out minimum rows from src/dest edges', function() {
                assert.deepEqual(uploadGraph.edgesToRows(edges, undecoratedLabels), rows);
            }); });

describe('graphDegrees', function() {
        it('should compute the degrees of a graph', function() {
                assert.deepEqual(uploadGraph.graphDegrees(edges, rows), degrees);
            });
    });

describe('rowColumnCounts', function() {
        it('should count how many columns of nodes each row has', function() {
                assert.deepEqual(uploadGraph.rowColumnCounts(rows), rowColumnCounts);
            });
    });

describe('rowsToColumns', function() {
        it('should order nodes into columns by degree and then name', function() {
                assert.deepEqual(uploadGraph.rowsToColumns(rows, rowColumnCounts, degrees, minLineLength, maxLineLength, pivotWrappedLineHeight, types), rowColumns);
            });
    });


describe('mergeRowsColumnsToXY', function() {
        it('should merge keys correctly', function() {
                assert.deepEqual(uploadGraph.mergeRowsColumnsToXY(rows, rowColumns, fudgeX, fudgeY, spacerY), xys);
            });
    });

describe('decorateGraphLabelsWithXY', function() {
        it('should destructively update x and y', function() {
                const decoratee = [{node: n1}];
                const decorated = [{node: n1, x: xys[n1].x, y: xys[n1].y}];
                uploadGraph.decorateGraphLabelsWithXY(decoratee, xys);
                assert.deepEqual(decoratee, decorated);
            });
    });

describe('stackedBushyGraph', function() {
        it('should decorate nodes with positions', function() {
                assert.deepEqual(uploadGraph.stackedBushyGraph(hugeDataStructure, fudgeX, fudgeY, spacerY), hugeDecoratedDataStructure);
            });
    });

// 2. CreateGraph tests.

const visiblePivotsSmall = [{id: "first", enabled: true,
                             results: {graph: [{source: "a", destination: "b", edge: 'edge_0_0'}, {source: "a", destination: "c", edge: 'edge_0_1'}],
                                       labels: [{node: "a"}, {node: "b"}, {node: "c"}]}},
                            {id: "second", enabled: true,
                             results: {graph: [],
                                       labels: [{node: "d"}]}}];

const idealGraphDataSmall = {graph: [{source: "a", destination: "b", Pivot: 0, edge: 'edge_0_0'}, {source: "a", destination: "c", Pivot: 0, edge: 'edge_0_1'}],
                             labels: [{node: "a", Pivot: 0}, {node: "b", Pivot: 0}, {node: "c", Pivot: 0}, {node: "d", Pivot: 1}],
                             name: null, type: "edgelist", bindings: {idEdgeField: 'edge', sourceField: "source", destinationField: "destination", typeField: "type", idField: "node"}};

const visiblePivotsLarge = [
    {id: "1", enabled: true,
     results: {graph: [{source: "a", destination: "b"}, {source: "a", destination: "c"}],
               labels: [{node: "a"}, {node: "b"}, {node: "c"}]}},
    {id: "2", enabled: true,
     results: {graph: [],
               labels: [{node: "d"}]}},
    {id: "3", enabled: true,
     results: {graph: [{source: "e", destination: "f"}],
               labels: [{node: "e"}, {node: "f"}]}}
];

const idealGraphDataLarge = {graph: [{source: "a", destination: "b", Pivot: 0}, {source: "a", destination: "c", Pivot: 0}, {source: "e", destination: "f"}],
                              labels: [{node: "a"}, {node: "b"}, {node: "c"}, {node: "d", Pivot: 1}, {node: "e"}, {node: "f"}],
                              name: null, type: "edgelist", bindings: {idEdgeField: 'edge', sourceField: "source", destinationField: "destination", typeField: "type", idField: "node"}};

describe('createGraph', function() {
        it('should label isolated nodes with Pivot', function() {
            const createdGraph = uploadGraph.createGraph(visiblePivotsSmall).data;
            createdGraph.name = null;
            assert.deepEqual(idealGraphDataSmall, createdGraph);
        });
        it('should not blow up stackedBushyGraph', function() {
            uploadGraph.stackedBushyGraph(uploadGraph.createGraph(visiblePivotsSmall));
        });
        it('should work on forests', function() {
            const createdGraph = uploadGraph.createGraph(visiblePivotsLarge).data;
            createdGraph.name = null;
            assert(createdGraph, idealGraphDataLarge);
        });
    });
