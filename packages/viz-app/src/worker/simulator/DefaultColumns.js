import ComputedColumnSpec from './ComputedColumnSpec.js';
const util    = require('./util.js');


const defaultLocalBuffers = {

    logicalEdges: new ComputedColumnSpec({
        ArrayVariant: Uint32Array,
        type: 'number',
        numberPerGraphComponent: 2,
        graphComponentType: 'edge',
        version: 0,
        dependencies: [
            ['unsortedEdges', 'hostBuffer']
        ],
        computeAllValues: function (unsortedEdges, outArr/* , numGraphElements */) {
            for (let i = 0; i < outArr.length; i++) {
                outArr[i] = unsortedEdges[i];
            }
            return outArr;
        }
    }),

    forwardsEdgeToUnsortedEdge: new ComputedColumnSpec({
        ArrayVariant: Uint32Array,
        type: 'number',
        numberPerGraphComponent: 1,
        graphComponentType: 'edge',
        version: 0,
        dependencies: [
            ['forwardsEdges', 'hostBuffer']
        ],
        computeAllValues: function (forwardsEdges, outArr/* , numGraphElements */) {

            const map = forwardsEdges.edgePermutationInverseTyped;

            for (let i = 0; i < outArr.length; i++) {
                outArr[i] = map[i];
            }
            return outArr;
        }
    }),

    forwardsEdgeStartEndIdxs: new ComputedColumnSpec({
        ArrayVariant: Uint32Array,
        type: 'number',
        numberPerGraphComponent: 2,
        graphComponentType: 'point',
        version: 0,
        dependencies: [
            ['forwardsEdges', 'hostBuffer']
        ],
        computeAllValues: function (forwardsEdges, outArr/* , numGraphElements */) {
            for (let i = 0; i < outArr.length; i++) {
                outArr[i] = forwardsEdges.edgeStartEndIdxsTyped[i];
            }
            return outArr;
        }
    }),

    edgeHeights: new ComputedColumnSpec({
        ArrayVariant: Uint32Array,
        type: 'number',
        numberPerGraphComponent: 1,
        graphComponentType: 'edge',
        version: 0,
        dependencies: [
            ['forwardsEdges', 'hostBuffer']
        ],
        computeAllValues: function (forwardsEdges, outArr/* , numGraphElements */) {
            const perm = forwardsEdges.edgePermutation;
            for (let i = 0; i < outArr.length; i++) {
                outArr[i] = forwardsEdges.heights[perm[i]];
            }
            return outArr;
        }
    }),

    edgeSeqLens: new ComputedColumnSpec({
        ArrayVariant: Uint32Array,
        type: 'number',
        numberPerGraphComponent: 1,
        graphComponentType: 'edge',
        version: 0,
        dependencies: [
            ['forwardsEdges', 'hostBuffer']
        ],
        computeAllValues: function (forwardsEdges, outArr/* , numGraphElements */) {
            const perm = forwardsEdges.edgePermutation;
            for (let i = 0; i < outArr.length; i++) {
                outArr[i] = forwardsEdges.seqLens[perm[i]];
            }
            return outArr;
        }
    }),

    backwardsEdgeStartEndIdxs: new ComputedColumnSpec({
        ArrayVariant: Uint32Array,
        type: 'number',
        numberPerGraphComponent: 2,
        graphComponentType: 'point',
        version: 0,
        dependencies: [
            ['backwardsEdges', 'hostBuffer']
        ],
        computeAllValues: function (backwardsEdges, outArr/* , numGraphElements */) {
            for (let i = 0; i < outArr.length; i++) {
                outArr[i] = backwardsEdges.edgeStartEndIdxsTyped[i];
            }
            return outArr;
        }
    }),

    pointColors: new ComputedColumnSpec({
        ArrayVariant: Uint32Array,
        type: 'color',
        filterable: true,
        numberPerGraphComponent: 1,
        graphComponentType: 'point',
        version: 0,
        dependencies: [
            ['__pointCommunity', 'point']
        ],

        computeSingleValue: function (pointCommunity/* , idx, numGraphElements */) {

            const palette = util.palettes.qual_palette2;
            const pLen = palette.length;
            const color = palette[pointCommunity % pLen];

            return color;
        }

    }),

    edgeColors: new ComputedColumnSpec({
        ArrayVariant: Uint32Array,
        type: 'color',
        filterable: true,
        numberPerGraphComponent: 2,
        graphComponentType: 'edge',
        version: 0,
        dependencies: [
            ['unsortedEdges', 'hostBuffer'],
            ['pointColors', 'localBuffer']
        ],

        computeAllValues: function (unsortedEdges, pointColors, outArr/* , numGraphElements */) {

            for (let idx = 0; idx < outArr.length; idx++) {
                const nodeIdx = unsortedEdges[idx];
                outArr[idx] = pointColors[nodeIdx];
            }

            return outArr;
        }

    }),

    pointSizes: new ComputedColumnSpec({
        ArrayVariant: Uint8Array,
        type: 'number',
        filterable: true,
        numberPerGraphComponent: 1,
        graphComponentType: 'point',
        version: 0,
        dependencies: [['__defaultPointSize', 'point']],
        computeSingleValue: function (defaultPointSize/* , idx, numGraphElements */) {
            return defaultPointSize;
        }
    })
};


const defaultHostBuffers = {

    forwardsEdgeWeights: new ComputedColumnSpec({
        ArrayVariant: Float32Array,
        type: 'number',
        filterable: true,
        numberPerGraphComponent: 1,
        graphComponentType: 'edge',
        version: 0,
        dependencies: [
        ],
        computeAllValues: function (outArr/* , numGraphElements */) {
            for (let i = 0; i < outArr.length; i++) {
                outArr[i] = 1.0;
            }
            return outArr;
        }
    }),

    backwardsEdgeWeights: new ComputedColumnSpec({
        ArrayVariant: Float32Array,
        type: 'number',
        filterable: true,
        numberPerGraphComponent: 1,
        graphComponentType: 'edge',
        version: 0,
        dependencies: [
        ],
        computeAllValues: function (outArr/* , numGraphElements */) {
            for (let i = 0; i < outArr.length; i++) {
                outArr[i] = 1.0;
            }
            return outArr;
        }
    })

};

// TODO: Allow users to specify which view to pull dependencies from.
export const defaultColumns = {
    hostBuffer: defaultHostBuffers
};

export const defaultEncodingColumns = {
    localBuffer: defaultLocalBuffers
};
