'use strict';

const Q = require('q');
const _ = require('underscore');
const moment = require('moment');
const Color = require('color');
const d3Scale = require('d3-scale');

import { Observable } from 'rxjs/Observable';
import { getAttributes0, getAttributes1 } from './getAttributes';

const util = require('../util.js');
const weaklycc = require('../weaklycc.js');
// const clientNotification = require('../clientNotification.js');

import * as palettes from '../palettes';
import * as encodingsUtil from '../encodings';
import ComputedColumnSpec from '../ComputedColumnSpec';

const log = require('@graphistry/common').logger;
const logger = log.createLogger('graph-viz', 'graph-viz/js/libs/VGraphLoader.js');
const perf = require('@graphistry/common').perfStats.createPerfMonitor();

import { VectorGraph } from '@graphistry/vgraph-to-mapd/lib/cjs/vgraph';

const VERTEX = VectorGraph.AttributeTarget.VERTEX;
const EDGE = VectorGraph.AttributeTarget.EDGE;

/** Indicates which GraphComponentType the data associates. */
const ColumnVectorTargets = [VERTEX, EDGE];

export const accessorForTargetType = {
    [VERTEX]: 'nodes',
    [EDGE]: 'edges'
};

const decodersByVersion = {
    0: decode0,
    1: decode1
};

/** @typedef {ProtoBuf.Message} VectorGraph
 */

/** @typedef {Object} AttributeLoader
 * @property {Function} load
 * @property {String[]} type
 * @property {Function} default
 * @property {Number} target VERTEX or EDGE
 * @property values
 */

/** introduce mapping names, and for each, how to send mapped buffer to NBody.js
 * @param graph
 * @returns {Object.<AttributeLoader>}
 */
const attributeLoaders = function(graph) {
    return {
        pointSize: {
            load: function(values) {
                const valueObj = { name: '__pointSizes', values: values, type: 'number' };
                graph.dataframe.loadColumn('__pointSizes', 'point', valueObj);
                const ccManager = graph.dataframe.computedColumnManager;

                const desc = ccManager.getComputedColumnSpec('localBuffer', 'pointSizes').clone();
                desc.setDependencies([['__pointSizes', 'point']]);
                desc.setComputeSingleValue(_.identity);

                ccManager.addComputedColumn(graph.dataframe, 'localBuffer', 'pointSizes', desc);
            },
            type: ['number'],
            target: VERTEX,
            values: undefined
        },
        pointColor: {
            load: function(values) {
                const valueObj = { name: '__pointColors', values: values, type: 'color' };
                graph.dataframe.loadColumn('__pointColors', 'point', valueObj);
                const ccManager = graph.dataframe.computedColumnManager;

                const desc = ccManager.getComputedColumnSpec('localBuffer', 'pointColors').clone();
                desc.setDependencies([['__pointColors', 'point']]);
                desc.setComputeSingleValue(_.identity);

                ccManager.addComputedColumn(graph.dataframe, 'localBuffer', 'pointColors', desc);
            },
            type: ['number', 'color'],
            target: VERTEX,
            values: undefined
        },
        edgeColor: {
            load: function(values) {
                const valueObj = {
                    name: '__edgeColors',
                    values: values,
                    type: 'color',
                    numberPerGraphComponent: 1
                };
                graph.dataframe.loadColumn('__edgeColors', 'edge', valueObj);
                const ccManager = graph.dataframe.computedColumnManager;

                const desc = ccManager.getComputedColumnSpec('localBuffer', 'edgeColors').clone();
                desc.setDependencies([['__edgeColors', 'edge']]);
                desc.setComputeAllValues((edgeColors, outArr /* , numGraphElements */) => {
                    for (let i = 0; i < edgeColors.length; i++) {
                        outArr[i * 2] = edgeColors[i];
                        outArr[i * 2 + 1] = edgeColors[i];
                    }
                    return outArr;
                });

                ccManager.addComputedColumn(graph.dataframe, 'localBuffer', 'edgeColors', desc);
            },
            type: ['number', 'color'],
            target: EDGE,
            values: undefined
        },
        edgeHeight: {
            load: function(/* values */) {
                // NOT IMPLEMENTED OR USED YET
                console.log('\n\n LOADING EDGE HEIGHTS NOT SUPPORTED\n\n\n');
            },
            type: ['number'],
            target: EDGE,
            values: undefined
        },
        pointLabel: {
            load: function(values) {
                const valueObj = { name: '__pointLabels', values: values, type: 'string' };
                graph.dataframe.loadColumn('__pointLabels', 'point', valueObj);
                const ccManager = graph.dataframe.computedColumnManager;

                const desc = new ComputedColumnSpec({
                    type: 'string',
                    filterable: true,
                    graphComponentType: 'point'
                });

                desc.setDependencies([['__pointLabels', 'point']]);
                desc.setComputeSingleValue(_.identity);

                ccManager.addComputedColumn(graph.dataframe, 'hostBuffer', 'pointLabels', desc);
            },
            type: ['string'],
            target: VERTEX,
            values: undefined
        },
        edgeLabel: {
            load: function(values) {
                const valueObj = { name: '__edgeLabels', values: values, type: 'string' };
                graph.dataframe.loadColumn('__edgeLabels', 'edge', valueObj);
                const ccManager = graph.dataframe.computedColumnManager;

                const desc = new ComputedColumnSpec({
                    type: 'string',
                    filterable: true,
                    graphComponentType: 'edge'
                });

                desc.setDependencies([['__edgeLabels', 'edge']]);
                desc.setComputeSingleValue(_.identity);

                ccManager.addComputedColumn(graph.dataframe, 'hostBuffer', 'edgeLabels', desc);
            },
            type: ['string'],
            target: EDGE,
            values: undefined
        },
        edgeWeight: {
            load: function(values) {
                const valueObj = { name: '__edgeWeights', values: values, type: 'number' };
                graph.dataframe.loadColumn('__edgeWeights', 'edge', valueObj);

                const computeAllEdgeWeightFunction = function(
                    edgeWeights,
                    edges,
                    outArr /* , numGraphElements */
                ) {
                    for (let i = 0; i < edgeWeights.length; i++) {
                        outArr[i] = edgeWeights[edges.edgePermutationInverseTyped[i]];
                    }
                    return outArr;
                };

                const ccManager = graph.dataframe.computedColumnManager;
                const forwardsDesc = ccManager
                    .getComputedColumnSpec('hostBuffer', 'forwardsEdgeWeights')
                    .clone();
                const backwardsDesc = ccManager
                    .getComputedColumnSpec('hostBuffer', 'backwardsEdgeWeights')
                    .clone();

                forwardsDesc.setDependencies([
                    ['__edgeWeights', 'edge'],
                    ['forwardsEdges', 'hostBuffer']
                ]);

                backwardsDesc.setDependencies([
                    ['__edgeWeights', 'edge'],
                    ['backwardsEdges', 'hostBuffer']
                ]);

                forwardsDesc.setComputeAllValues(computeAllEdgeWeightFunction);
                backwardsDesc.setComputeAllValues(computeAllEdgeWeightFunction);

                ccManager.addComputedColumn(
                    graph.dataframe,
                    'hostBuffer',
                    'forwardsEdgeWeights',
                    forwardsDesc
                );
                ccManager.addComputedColumn(
                    graph.dataframe,
                    'hostBuffer',
                    'backwardsEdgeWeights',
                    backwardsDesc
                );
            },
            type: ['number'],
            target: EDGE,
            values: undefined
        },
        // PointTitle and edgeTitle are handled in their own special way.
        // They are loaded outside of the loader mechanism
        // Without these two dummy entries, decode1 would discard encodings for
        // PointTitle and edgeTitle as invalid.
        pointTitle: {
            load: function() {
                return Q();
            },
            type: ['string', 'number'],
            target: VERTEX,
            default: function() {
                return Q();
            }
        },
        edgeTitle: {
            load: function() {
                return Q();
            },
            type: ['string', 'number'],
            target: EDGE,
            default: function() {
                return Q();
            }
        }
    };
};

function getDegree(forwardsEdges, backwardsEdges, i) {
    return forwardsEdges.degreesTyped[i] + backwardsEdges.degreesTyped[i];
}

const MIN_VERTEX_PIXEL_DIAMETER = 5; // Minimum hit target we've decided on.
const MAX_VERTEX_PIXEL_DIAMETER = 255; // Destination of this data is a UInt8Array, so don't overflow!

function calculateAndStoreDefaultPointSizeColumns(graph) {
    const dataframe = graph.dataframe;
    const forwardsEdges = dataframe.getColumnValues('forwardsEdges', 'hostBuffer');
    const backwardsEdges = dataframe.getColumnValues('backwardsEdges', 'hostBuffer');

    const numPoints = dataframe.getNumElements('point');
    const outArr = new Array(numPoints);

    let minDegree = Number.MAX_VALUE;
    let maxDegree = 0;
    for (let i = 0; i < numPoints; i++) {
        const degree = getDegree(forwardsEdges, backwardsEdges, i);
        minDegree = Math.min(minDegree, degree);
        maxDegree = Math.max(maxDegree, degree);
    }

    const scaling = encodingsUtil.scalingFromSpec({
        scalingType: 'linear',
        domain: [minDegree, maxDegree],
        range: [MIN_VERTEX_PIXEL_DIAMETER, MAX_VERTEX_PIXEL_DIAMETER],
        clamp: true
    });

    for (let i = 0; i < numPoints; i++) {
        const degree = getDegree(forwardsEdges, backwardsEdges, i);
        outArr[i] = Math.floor(scaling(degree));
    }

    const valueObj = { name: '__defaultPointSize', values: outArr, type: 'number' };
    graph.dataframe.loadColumn('__defaultPointSize', 'point', valueObj);
}

/**
 * This computes a community identified by the node in {self} ∪ {neighbors} with the highest degree.
 */
function calculateAndStoreCommunities(graph) {
    const dataframe = graph.dataframe;
    const forwardsEdges = dataframe.getColumnValues('forwardsEdges', 'hostBuffer');
    const backwardsEdges = dataframe.getColumnValues('backwardsEdges', 'hostBuffer');

    const numPoints = dataframe.getNumElements('point');
    const communitiesByPointID = new Array(numPoints);

    const compare = function(initBest, buffers, i) {
        let best = initBest;

        // const workList = buffers.srcToWorkItem[i];
        const firstEdge = buffers.workItemsTyped[i * 4];
        const numEdges = buffers.workItemsTyped[i * 4 + 1];
        for (let j = 0; j < numEdges; j++) {
            const dst = buffers.edgesTyped[firstEdge * 2 + j * 2 + 1];
            const degree = getDegree(forwardsEdges, backwardsEdges, dst);
            if (degree > best.degree || (degree === best.degree && dst > best.id)) {
                best = { id: dst, degree: degree };
            }
        }

        return best;
    };

    for (let idx = 0; idx < numPoints; idx++) {
        // Start with this point's degree:
        const best = { id: idx, degree: getDegree(forwardsEdges, backwardsEdges, idx) };
        const bestOut = compare(best, forwardsEdges, idx);
        const bestIn = compare(bestOut, backwardsEdges, idx);
        communitiesByPointID[idx] = bestIn.id;
    }

    const valueObj = { name: '__pointCommunity', values: communitiesByPointID, type: 'number' };
    graph.dataframe.loadColumn('__pointCommunity', 'point', valueObj);
}

function rangeFromValues(values) {
    return [_.min(values), _.max(values)];
}

const MIN_EDGE_PIXEL_WIDTH = 1;
const MAX_EDGE_PIXEL_WIDTH = 10;

const pointSizeScale = d3Scale
    .linear()
    .range([MIN_VERTEX_PIXEL_DIAMETER, MAX_VERTEX_PIXEL_DIAMETER]);
const edgeSizeScale = d3Scale.linear().range([MIN_EDGE_PIXEL_WIDTH, MAX_EDGE_PIXEL_WIDTH]);

const OpenTSDBMapper = {
    mappings: {
        pointSize: {
            name: 'degree',
            transform: function(v) {
                return _.map(v, pointSizeScale.copy().domain(rangeFromValues(v)));
            }
        },
        pointTitle: {
            name: 'label'
        },
        pointColor: {
            name: 'community_spinglass',
            transform: function(v) {
                const palette = util.palettes.qual_palette2;
                const scale = d3Scale.linear().range([0, palette.length - 1]);
                return _.map(v, x => util.int2color(Math.floor(scale(x)), palette));
            }
        },
        edgeColor: {
            name: 'bytes',
            transform: function(v) {
                const palette = util.palettes.green2red_palette;
                const scale = d3Scale
                    .log()
                    .domain(rangeFromValues(v))
                    .range([0, palette.length - 1])
                    .clamp(true);
                return _.map(v, x => util.int2color(Math.floor(scale(x)), palette));
            }
        },
        edgeWeight: {
            name: 'weight',
            transform: function(v) {
                return _.map(
                    v,
                    d3Scale
                        .log()
                        .domain(rangeFromValues(v))
                        .range([0.5, 1.5])
                        .clamp(true)
                );
            }
        }
    }
};

const MiserablesMapper = {
    mappings: _.extend({}, OpenTSDBMapper.mappings, {
        pointSize: {
            name: 'betweenness',
            transform: function(v) {
                return _.map(v, pointSizeScale.copy().domain(rangeFromValues(v)));
            }
        }
    })
};

const defaultMapper = {
    mappings: {
        pointSize: {
            name: 'pointSize',
            transform: function(v) {
                return _.map(v, pointSizeScale.copy().domain(rangeFromValues(v)));
            }
        },
        pointLabel: {
            name: 'pointLabel'
        },
        edgeLabel: {
            name: 'edgeLabel'
        },
        pointColor: {
            name: 'pointColor',
            transform: function(v) {
                return _.map(v, cat => palettes.bindings[cat]);
            }
        },
        edgeColor: {
            name: 'edgeColor',
            transform: function(v) {
                return _.map(v, cat => palettes.bindings[cat]);
            }
        },
        edgeSize: {
            name: 'edgeSize',
            transform: function(v) {
                return _.map(v, edgeSizeScale.copy().domain(rangeFromValues(v)));
            }
        },
        edgeHeight: {
            name: 'edgeHeight'
        },
        edgeWeight: {
            name: 'edgeWeight',
            transform: function(v) {
                return _.map(
                    v,
                    d3Scale
                        .linear()
                        .domain(rangeFromValues(v))
                        .range([0.5, 1.5])
                );
            }
        }
    }
};

const wideEdgeWeightRangeMapper = {
    mappings: _.extend(defaultMapper.mappings, {
        edgeWeight: {
            name: 'edgeWeight',
            transform: function(v) {
                return _.map(
                    v,
                    d3Scale
                        .linear()
                        .domain(rangeFromValues(v))
                        .range([0.25, 3])
                );
            }
        }
    })
};

const noEdgeWeightTransformMapper = {
    mappings: _.extend(defaultMapper.mappings, {
        edgeWeight: {
            name: 'edgeWeight',
            transform: function(v) {
                return v;
            }
        }
    })
};

const mappers = {
    wideEdgeWeightRange: wideEdgeWeightRangeMapper,
    noEdgeWeightTransform: noEdgeWeightTransformMapper,
    opentsdb: OpenTSDBMapper,
    miserables: MiserablesMapper,
    splunk: defaultMapper,
    default: defaultMapper
};

function getMapper(mapperKey = 'default') {
    if (!mappers.hasOwnProperty(mapperKey)) {
        logger.warn('Unknown mapper', mapperKey, 'using "default"');
        mapperKey = 'default';
    }
    return mappers[mapperKey];
}

function wrap(mappings, loaders) {
    const res = {};
    for (const a in loaders) {
        if (loaders.hasOwnProperty(a) && a in mappings) {
            const loader = loaders[a];
            const mapping = mappings[a];

            // Helper function to work around dubious JS scoping
            doWrap(res, mapping, loader);

            logger.trace('Mapping ' + mapping.name + ' to ' + a);
        } else {
            res[a] = [loaders[a]];
        }
    }
    return res;
}

function doWrap(res, mapping, loader) {
    const mapped = res[mapping.name] || [];

    if ('transform' in mapping) {
        const oldLoad = loader.load;
        loader.load = function(data) {
            return oldLoad(mapping.transform(data));
        };
    }

    mapped.push(loader);
    res[mapping.name] = mapped;
}

function runLoaders(loaders) {
    const promises = _.map(loaders, loaderArray =>
        _.map(loaderArray, loader => {
            if (loader.values) {
                return loader.load(loader.values);
            } else if (loader.default) {
                return loader.default();
            } else {
                return Q();
            }
        })
    );
    const flatPromises = _.flatten(promises, true);
    return Q.all(flatPromises);
}

/**
 * Load the raw data from the dataset object from S3
**/
function load(graph, dataset, config, s3Cache, updateSession) {
    return updateSession(graph.view, {
        progress: 100 * 3 / 10,
        status: 'init',
        message: 'Decoding dataset'
    })().mergeMap(() => {
        const vg = VectorGraph.decode(dataset.body);
        logger.trace('attaching vgraph to simulator');
        graph.simulator.vgraph = vg;
        return decodersByVersion[vg.version](graph, vg, dataset.metadata, updateSession);
    });
}

/** @typedef {Object} DataframeMetadataByColumn
 * @property {String} ctype
 * @property {String} userType
 * @property {String} originalType
 * @property {Aggregations} aggregations
 */

/** @typedef {Object} LoadEncodingSpec
 * @property {String[]} attributes
 */

/** @typedef {Object} DataframeMetadataByComponent
 * @property {Object.<DataframeMetadataByColumn>} attributes
 * @property {Number} count
 * @property {Object.<LoadEncodingSpec>} encodings
 */

/** @typedef {Object} DataframeMetadata
 * @property {DataframeMetadataByComponent[]} nodes
 * @property {DataframeMetadataByComponent[]} edges
 */

/** @typedef {Object} AttrObject
 * @property {String} name
 * @property {Number} target
 * @property {String} type
 * @property {Array} values
 */

/**
 * @param {Dataframe} dataframe
 * @param {AttrObject[]} attributeObjects
 * @param {Number} numPoints
 * @param {Number} numEdges
 * @param {Object} aliases column names by encoding.
 * @param {DataframeMetadata} graphInfo
 */
function loadDataframe(
    dataframe,
    attributeObjects,
    numPoints,
    numEdges,
    aliases = {},
    graphInfo = {}
) {
    let pointTypeIncludesEventID = false;
    const edgeAttributeObjects = _.filter(attributeObjects, value => value.target === EDGE);
    const pointAttributeObjects = _.filter(attributeObjects, value => value.target === VERTEX);

    const edgeAttributeObjectsByName = _.object(
        _.map(edgeAttributeObjects, value => [value.name, value])
    );

    const pointAttributeObjectsByName = _.object(
        _.map(pointAttributeObjects, value => {
            const { name } = value;
            if (!pointTypeIncludesEventID && name === 'type') {
                pointTypeIncludesEventID = (value.values || []).some(x => x === 'EventID');
            }
            return [name, value];
        })
    );

    _.extend(dataframe.bufferAliases, aliases);
    _.extend(dataframe.metadata, graphInfo);
    dataframe.pointTypeIncludesEventID = pointTypeIncludesEventID;
    dataframe.loadAttributesForType(edgeAttributeObjectsByName, 'edge', numEdges);
    dataframe.loadAttributesForType(pointAttributeObjectsByName, 'point', numPoints);
}

function decode0(graph, vg, metadata, updateSession) {
    logger.debug(
        'Decoding VectorGraph (version: %d, name: %s, nodes: %d, edges: %d)',
        vg.version,
        vg.name,
        vg.vertexCount,
        vg.edgeCount
    );

    // notifyClientOfSizesForAllocation(graph.socket, vg.edgeCount, vg.vertexCount);

    return getAttributes0(
        vg,
        null,
        updateSession(graph.view, {
            progress: 100 * 4 / 10,
            status: 'init',
            message: 'Deserializing attributes'
        })
    )
        .flatMap(attributes => {
            loadDataframe(graph.dataframe, attributes, vg.vertexCount, vg.edgeCount);
            logger.info(
                { attributes: _.pluck(attributes, 'name') },
                'Successfully loaded dataframe'
            );

            const edges = new Array(vg.edgeCount);
            const dimensions = [1, 1];

            for (let i = 0; i < vg.edges.length; i++) {
                const e = vg.edges[i];
                edges[i] = [e.src, e.dst];
            }

            let vertices = lookupInitialPosition(vg, attributes);

            if (vertices && Array.isArray(vertices)) {
                vertices = Observable.of(vertices);
            } else {
                vertices = updateSession(graph.view, {
                    progress: 100 * 5 / 10,
                    status: 'init',
                    message: 'Initializing positions'
                })().map(() => computeInitialPositions(vg.vertexCount, edges, dimensions));
            }

            return vertices.mergeMap(vertices => {
                let loaders = attributeLoaders(graph);
                const mapper = getMapper(metadata.mapper);
                loaders = wrap(mapper.mappings, loaders);
                logger.trace('Attribute loaders:', loaders);

                _.each(attributes, attr => {
                    const attributeName = attr.name;
                    if (!(attributeName in loaders)) {
                        logger.debug('Skipping unmapped attribute', attributeName);
                        return;
                    }

                    const loaderArray = loaders[attributeName];

                    _.each(loaderArray, loader => {
                        if (attr.target !== loader.target) {
                            logger.warn('Vertex/Node attribute mismatch for ' + attributeName);
                        } else if (!_.contains(loader.type, attr.type)) {
                            logger.warn(
                                'Expected type in ' +
                                    loader.type +
                                    ', but got ' +
                                    attr.type +
                                    ' for ' +
                                    attributeName
                            );
                        } else {
                            loader.values = attr.values;
                        }
                    });
                });

                return updateSession(graph.view, {
                    progress: 100 * 6 / 10,
                    status: 'init',
                    message: 'Binding nodes'
                })()
                    .mergeMap(() => graph.setVertices(vertices))
                    .let(
                        updateSession(graph.view, {
                            progress: 100 * 7 / 10,
                            status: 'init',
                            message: 'Binding edges'
                        })
                    )
                    .mergeMap(() => graph.setEdges(edges, vertices))
                    .let(
                        updateSession(graph.view, {
                            progress: 100 * 8 / 10,
                            status: 'init',
                            message: 'Binding everything else'
                        })
                    )
                    .mergeMap(() => {
                        calculateAndStoreCommunities(graph);
                        calculateAndStoreDefaultPointSizeColumns(graph);
                        return runLoaders(loaders);
                    }, () => graph);
            });
        })
        .catch(log.makeRxErrorHandler(logger, 'Failure in VGraphLoader decode0'));
}

function computeInitialPositions(vertexCount, edges, dimensions) {
    logger.trace('Running component analysis');

    const { components, nodeToComponent } = weaklycc(vertexCount, edges, 2);
    const numComponents = components.length;
    const pointsPerRow = vertexCount / (Math.round(Math.sqrt(numComponents)) + 1);

    perf.startTiming('graph-viz:data:vgraphloader, weaklycc postprocess');
    const componentOffsets = [];
    let cumulativePoints = 0;
    let row = 0;
    let col = 0;
    let pointsInRow = 0;
    let maxPointsInRow = 0;
    let rowYOffset = 0;
    const vertices = [];

    _.each(components, component => {
        maxPointsInRow = Math.max(maxPointsInRow, component.size);

        componentOffsets.push({
            rollingSum: cumulativePoints,
            rowYOffset: rowYOffset,
            rowRollingSum: pointsInRow,
            rollingMaxInRow: maxPointsInRow,
            row: row,
            col: col
        });

        cumulativePoints += component.size;
        if (pointsInRow > pointsPerRow) {
            row++;
            rowYOffset += maxPointsInRow;
            col = 0;
            pointsInRow = 0;
            maxPointsInRow = 0;
        } else {
            col++;
            pointsInRow += component.size;
        }
    });
    _.each(components, (component, i) => {
        component.rowHeight = Math.max(
            component.size,
            i + 1 < numComponents && components[i + 1].row === component.row
                ? component.rollingMaxInRow
                : 0
        );
    });

    const initSize = 5 * Math.sqrt(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
        const c = nodeToComponent[i];
        const offset = componentOffsets[c];
        const vertex = [
            initSize *
                (offset.rowRollingSum + 0.9 * components[c].size * Math.random()) /
                vertexCount
        ];
        for (let j = 1; j < dimensions.length; j++) {
            vertex.push(
                initSize *
                    (offset.rowYOffset + 0.9 * components[c].size * Math.random()) /
                    vertexCount
            );
        }
        vertices.push(vertex);
    }
    perf.endTiming('graph-viz:data:vgraphloader, weaklycc postprocess');
    return vertices;
}

/**
 * @param {VectorGraph} vg
 * @param {AttrObject[]} vectors
 * @returns {Array.<Array.<Number>>}
 */
function lookupInitialPosition(vg, vectors) {
    const x = _.find(vectors, o => o.name === 'x');
    const y = _.find(vectors, o => o.name === 'y');

    if (x && y) {
        logger.trace('Loading previous vertices from xObj');
        const vertices = new Array(vg.vertexCount);
        for (let i = 0; i < vg.vertexCount; i++) {
            vertices[i] = [x.values[i], y.values[i]];
        }
        return vertices;
    } else {
        return undefined;
    }
}

function sameKeys(a, b) {
    const aKeys = _.keys(a);
    const bKeys = _.keys(b);
    if (aKeys.length !== bKeys.length) {
        return false;
    }
    const bothKeys = _.intersection(aKeys, bKeys);
    return bKeys.length === bothKeys.length;
}

/** These encodings are handled in their own special way. */
const GraphShapePropertiesByTarget = [['nodeId'], ['source', 'destination']];
const GraphShapeProperties = _.flatten(GraphShapePropertiesByTarget);

function getShapeMappings(graphInfo) {
    const mappings = {};
    _.each(GraphShapePropertiesByTarget, (shapeProperties, targetType) => {
        _.each(shapeProperties, shapeProperty => {
            mappings[shapeProperty] = graphInfo[accessorForTargetType[targetType]].encodings;
        });
    });
    return mappings;
}

/**
 * @param {Object.<LoadEncodingSpec>} encodings
 * @param {Object.<AttributeLoader>} loaders
 * @param {Number} target VERTEX or EDGE
 * @returns {Object.<DataframeMetadataByColumn>}
 */
function getSimpleEncodings(encodings, loaders, target) {
    const supportedEncodings = _.pick(encodings, (enc, graphProperty) => {
        if (_.contains(GraphShapeProperties, graphProperty)) {
            return false;
        }

        if (!(graphProperty in loaders)) {
            console.warn('In encodings, unknown graph property:', graphProperty);
            return false;
        }

        if (!_.all(loaders[graphProperty], loader => loader.target === target)) {
            console.warn('Wrong target type (node/edge) for graph property', graphProperty);
            return false;
        }
        if (enc.attributes.length !== 1) {
            console.warn('Support for multiple attributes not implemented yet for', graphProperty);
            return false;
        }
        return true;
    });

    return _.object(
        _.map(supportedEncodings, (enc, graphProperty) => [graphProperty, enc.attributes[0]])
    );
}

/**
 * @param {DataframeMetadata} metadata
 * @param {VectorGraph} vg
 * @param {{nodes: Object.<AttrObject>, edges: Object.<AttrObject>}} vgAttributes
 * @returns {{nodes: *, edges: *}}
 */
function checkMetadataAgainstVGraph(metadata, vg, vgAttributes) {
    if (metadata.nodes.length === 0 || metadata.edges.length === 0) {
        throw new Error('Nodes or edges missing!');
    }

    if (metadata.nodes.length > 1 || metadata.edges.length > 1) {
        throw new Error('K-partite graphs support not implemented yet!');
    }

    const nodesMetadata = metadata.nodes[0];
    const edgesMetadata = metadata.edges[0];

    logger.debug('Node attributes metadata:', nodesMetadata.attributes);
    logger.debug('Edge attributes metadata:', edgesMetadata.attributes);
    logger.debug('VGraph has node attributes:', _.pluck(vgAttributes.nodes, 'name'));
    logger.debug('VGraph has edge attributes:', _.pluck(vgAttributes.edges, 'name'));

    if (
        !sameKeys(nodesMetadata.attributes, vgAttributes.nodes) ||
        !sameKeys(edgesMetadata.attributes, vgAttributes.edges)
    ) {
        throw new Error('Discrepancies between metadata and VGraph attributes');
    }
    if (nodesMetadata.count !== vg.vertexCount || edgesMetadata.count !== vg.edgeCount) {
        throw new Error('Discrepancies in number of nodes/edges between metadata and VGraph');
    }

    return {
        nodes: nodesMetadata,
        edges: edgesMetadata
    };
}

/**
 * @param graph
 * @param {VectorGraph} vg
 * @param {DataframeMetadata} metadata
 * @returns {Promise<U>}
 */
function decode1(graph, vg, metadata, updateSession) {
    logger.debug(
        'Decoding VectorGraph (version: %d, name: %s, nodes: %d, edges: %d)',
        vg.version,
        vg.name,
        vg.vertexCount,
        vg.edgeCount
    );

    return getAttributes1(
        vg,
        metadata,
        updateSession(graph.view, {
            progress: 100 * 4 / 10,
            status: 'init',
            message: 'Deserializing attributes'
        })
    )
        .flatMap(vgAttributes => {
            const graphInfo = checkMetadataAgainstVGraph(metadata, vg, vgAttributes);

            // notifyClientOfSizesForAllocation(graph.socket, vg.edgeCount, vg.vertexCount);

            const edges = new Array(vg.edgeCount);
            for (let i = 0; i < vg.edges.length; i++) {
                const e = vg.edges[i];
                edges[i] = [e.src, e.dst];
            }
            // TODO Check if x/y are bound in graphInfo.nodes.encodings
            const dimensions = [1, 1];

            let vertices = lookupInitialPosition(vg, _.values(vgAttributes.nodes));

            if (vertices && Array.isArray(vertices)) {
                vertices = Observable.of(vertices);
            } else {
                vertices = updateSession(graph.view, {
                    progress: 100 * 5 / 10,
                    status: 'init',
                    message: 'Initializing positions'
                })().map(() => computeInitialPositions(vg.vertexCount, edges, dimensions));
            }

            return vertices.mergeMap(vertices => {
                let loaders = attributeLoaders(graph);
                const mapper = getMapper(metadata.mapper);
                loaders = wrap(mapper.mappings, loaders);
                logger.trace('Attribute loaders:', loaders);

                const encodingsByTarget = _.map(ColumnVectorTargets, targetType =>
                    getSimpleEncodings(
                        graphInfo[accessorForTargetType[targetType]].encodings,
                        loaders,
                        targetType
                    )
                );
                const shapeMappings = getShapeMappings(graphInfo);

                const flatAttributeArray = _.values(vgAttributes.nodes).concat(
                    _.values(vgAttributes.edges)
                );
                const allEncodings = _.extend(
                    {},
                    encodingsByTarget[VERTEX],
                    encodingsByTarget[EDGE],
                    shapeMappings
                );
                loadDataframe(
                    graph.dataframe,
                    flatAttributeArray,
                    vg.vertexCount,
                    vg.edgeCount,
                    allEncodings,
                    graphInfo
                );

                _.each(loaders, (loaderArray, graphProperty) => {
                    _.each(loaderArray, loader => {
                        const encodings = encodingsByTarget[loader.target];
                        const attributes = vgAttributes[accessorForTargetType[loader.target]];
                        if (graphProperty in encodings) {
                            const attributeName = encodings[graphProperty];
                            logger.debug(
                                'Loading values for',
                                graphProperty,
                                'from attribute',
                                attributeName
                            );
                            loader.values = attributes[attributeName].values;
                        } else {
                            logger.debug('Loading default values for', graphProperty);
                        }
                    });
                });

                return updateSession(graph.view, {
                    progress: 100 * 6 / 10,
                    status: 'init',
                    message: 'Binding nodes'
                })()
                    .mergeMap(() => graph.setVertices(vertices))
                    .let(
                        updateSession(graph.view, {
                            progress: 100 * 7 / 10,
                            status: 'init',
                            message: 'Binding edges'
                        })
                    )
                    .mergeMap(() => graph.setEdges(edges, vertices))
                    .let(
                        updateSession(graph.view, {
                            progress: 100 * 8 / 10,
                            status: 'init',
                            message: 'Binding everything else'
                        })
                    )
                    .mergeMap(() => {
                        calculateAndStoreCommunities(graph);
                        calculateAndStoreDefaultPointSizeColumns(graph);
                        return runLoaders(loaders);
                    }, () => graph);
            });
        })
        .catch(log.makeRxErrorHandler(logger, 'Failure in VGraphLoader decode1'));
}

function notifyClientOfSizesForAllocation(socket, edgeCount, vertexCount) {
    const MAX_SIZE_TO_ALLOCATE = 2000000;
    const numElements = {
        edge: Math.min(edgeCount, MAX_SIZE_TO_ALLOCATE),
        point: Math.min(vertexCount, MAX_SIZE_TO_ALLOCATE)
    };
    socket.emit('sizes_for_memory_allocation', numElements);
}

export { load };
