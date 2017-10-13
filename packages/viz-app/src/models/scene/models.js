import { VBODataSources, DrawOptions } from './enum';

/**
 * These represent different kinds/roles of VBOs.
 *
 * datasource can be:
 * DEVICE -> OpenCL server buffer
 * HOST   -> plain server buffer
 * CLIENT -> computed on client
 */

export const models = {
    logicalEdges: {
        curIdx: {
            datasource: VBODataSources.HOST,
            index: true,
            type: 'UNSIGNED_INT',
            hint: DrawOptions.STATIC_DRAW,
            count: 1,
            offset: 0,
            stride: 0,
            normalize: false
        }
    },
    edgeSeqLens: {
        edgeSeqLen: {
            datasource: VBODataSources.HOST,
            index: true,
            type: 'UNSIGNED_INT',
            hint: DrawOptions.STATIC_DRAW,
            count: 1,
            offset: 0,
            stride: 0,
            normalize: false
        }
    },
    forwardsEdgeToUnsortedEdge: {
        forwardsEdgeToUnsortedEdge: {
            datasource: VBODataSources.HOST,
            index: true,
            type: 'UNSIGNED_INT',
            hint: DrawOptions.STATIC_DRAW,
            count: 1,
            offset: 0,
            stride: 0,
            normalize: false
        }
    },
    selectedPointIndexes: {
        curIdx: {
            datasource: VBODataSources.HOST,
            index: true,
            type: 'UNSIGNED_INT',
            hint: DrawOptions.STATIC_DRAW,
            count: 1,
            offset: 0,
            stride: 0,
            normalize: false
        }
    },
    selectedEdgeIndexes: {
        curIdx: {
            datasource: VBODataSources.HOST,
            index: true,
            type: 'UNSIGNED_INT',
            hint: DrawOptions.STATIC_DRAW,
            count: 1,
            offset: 0,
            stride: 0,
            normalize: false
        }
    },
    forwardsEdgeStartEndIdxs: {
        curIdx: {
            datasource: VBODataSources.HOST,
            index: true,
            type: 'UNSIGNED_INT',
            hint: DrawOptions.STATIC_DRAW,
            count: 1,
            offset: 0,
            stride: 0,
            normalize: false
        }
    },
    midSpringsPos: {
        curPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false,
            sizeHint: numElements => {
                return numElements.edge * (numElements.renderedSplits + 1) * 2;
            }
        }
    },
    midSpringsStarts: {
        startPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false,
            sizeHint: numElements => {
                return numElements.edge * (numElements.renderedSplits + 1) * 2;
            }
        }
    },
    midSpringsEnds: {
        endPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false,
            sizeHint: numElements => {
                return numElements.edge * (numElements.renderedSplits + 1) * 2;
            }
        }
    },
    selectedMidSpringsPos: {
        curPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false
        }
    },
    selectedMidSpringsStarts: {
        startPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: 'DYNAMIC_DRAW',
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false
        }
    },
    selectedMidSpringsEnds: {
        endPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: 'DYNAMIC_DRAW',
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false
        }
    },
    highlightedEdgesPos: {
        curPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false
        }
    },
    selectedEdgesPos: {
        curPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false
        }
    },
    arrowStartPos: {
        curPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false,
            sizeHint: numElements => {
                return numElements.edge * 2 * 3;
            }
        }
    },
    arrowEndPos: {
        curPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false,
            sizeHint: numElements => {
                return numElements.edge * 2 * 3;
            }
        }
    },
    arrowNormalDir: {
        normalDir: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 1,
            offset: 0,
            stride: 0,
            normalize: false,
            sizeHint: numElements => {
                return numElements.edge * 3;
            }
        }
    },
    highlightedArrowStartPos: {
        curPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false
        }
    },
    highlightedArrowEndPos: {
        curPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false
        }
    },
    highlightedArrowNormalDir: {
        normalDir: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 1,
            offset: 0,
            stride: 0,
            normalize: false
        }
    },
    selectedArrowStartPos: {
        curPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false
        }
    },
    selectedArrowEndPos: {
        curPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false
        }
    },
    selectedArrowNormalDir: {
        normalDir: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 1,
            offset: 0,
            stride: 0,
            normalize: false
        }
    },
    curPoints: {
        curPos: {
            datasource: VBODataSources.DEVICE,
            type: 'FLOAT',
            count: 2,
            hint: DrawOptions.DYNAMIC_DRAW,
            offset: 0,
            stride: 8,
            normalize: false
        }
    },
    highlightedPointsPos: {
        curPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false
        }
    },
    highlightedPointsSizes: {
        pointSize: {
            datasource: VBODataSources.CLIENT,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 1,
            offset: 0,
            stride: 0,
            normalize: false
        }
    },
    highlightedPointsColors: {
        pointColor: {
            datasource: VBODataSources.CLIENT,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 4,
            offset: 0,
            stride: 0,
            normalize: true
        }
    },
    selectedCurPoints: {
        curPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false
        }
    },
    selectedPointSizes: {
        pointSize: {
            datasource: VBODataSources.CLIENT,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 1,
            offset: 0,
            stride: 0,
            normalize: false
        }
    },
    selectedPointColors: {
        pointColor: {
            datasource: VBODataSources.CLIENT,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 4,
            offset: 0,
            stride: 0,
            normalize: true
        }
    },
    pointSizes: {
        pointSize: {
            datasource: VBODataSources.HOST,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.STATIC_DRAW,
            count: 1,
            offset: 0,
            stride: 0,
            normalize: false
        }
    },
    arrowPointSizes: {
        pointSize: {
            datasource: VBODataSources.CLIENT,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.STATIC_DRAW,
            count: 1,
            offset: 0,
            stride: 0,
            normalize: false,
            sizeHint: numElements => {
                return numElements.edge * 3;
            }
        }
    },
    selectedArrowPointSizes: {
        pointSize: {
            datasource: VBODataSources.CLIENT,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 1,
            offset: 0,
            stride: 0,
            normalize: false
        }
    },
    selectedArrowColors: {
        arrowColor: {
            datasource: VBODataSources.CLIENT,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 4,
            offset: 0,
            stride: 0,
            normalize: true
        }
    },
    highlightedArrowPointSizes: {
        pointSize: {
            datasource: VBODataSources.CLIENT,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 1,
            offset: 0,
            stride: 0,
            normalize: false
        }
    },
    highlightedArrowPointColors: {
        arrowColor: {
            datasource: VBODataSources.CLIENT,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 4,
            offset: 0,
            stride: 0,
            normalize: true
        }
    },
    edgeColors: {
        edgeColor: {
            datasource: VBODataSources.HOST,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.STATIC_DRAW,
            count: 4,
            offset: 0,
            stride: 0,
            normalize: true
        }
    },
    //GIS
    midEdgeColors: {
        midEdgeColor: {
            datasource: VBODataSources.HOST,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.STATIC_DRAW,
            count: 4,
            offset: 0,
            stride: 0,
            normalize: true
        }
    },
    selectedMidEdgesColors: {
        midEdgeColor: {
            datasource: VBODataSources.CLIENT,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.STATIC_DRAW,
            count: 4,
            offset: 0,
            stride: 0,
            normalize: true
        }
    },
    midEdgesColors: {
        midEdgeColor: {
            datasource: VBODataSources.CLIENT,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.STATIC_DRAW,
            count: 4,
            offset: 0,
            stride: 0,
            normalize: true,
            sizeHint: numElements => {
                return numElements.edge * (numElements.renderedSplits + 1) * 2;
            }
        }
    },
    arrowColors: {
        arrowColor: {
            datasource: VBODataSources.CLIENT,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.STATIC_DRAW,
            count: 4,
            offset: 0,
            stride: 0,
            normalize: true,
            sizeHint: numElements => {
                return numElements.edge * 3;
            }
        }
    },
    pointColors: {
        pointColor: {
            datasource: VBODataSources.HOST,
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.STATIC_DRAW,
            count: 4,
            offset: 0,
            stride: 0,
            normalize: true
        }
    },
    curMidPoints: {
        curPos: {
            datasource: VBODataSources.DEVICE,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false
        }
    },
    curMidPointsClient: {
        curPos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false
        }
    },
    fullscreenCoordinates: {
        vertexPosition: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            count: 2,
            offset: 0,
            stride: 8,
            normalize: false
        }
    },
    vertexIndices: {
        pointColor: {
            datasource: 'VERTEX_INDEX',
            type: 'UNSIGNED_BYTE',
            count: 4,
            offset: 0,
            stride: 0,
            normalize: true
        }
    },
    edgeIndices: {
        edgeColor: {
            datasource: 'EDGE_INDEX',
            type: 'UNSIGNED_BYTE',
            hint: DrawOptions.STATIC_DRAW,
            count: 4,
            offset: 0,
            stride: 0,
            normalize: true
        }
    },
    radialAxes: {
        pos: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 0,
            stride: 6 * Float32Array.BYTES_PER_ELEMENT,
            normalize: false
        },
        center: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 2,
            offset: 8,
            stride: 6 * Float32Array.BYTES_PER_ELEMENT,
            normalize: false
        },
        radius: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 1,
            offset: 16,
            stride: 6 * Float32Array.BYTES_PER_ELEMENT,
            normalize: false
        },
        flags: {
            datasource: VBODataSources.CLIENT,
            type: 'FLOAT',
            hint: DrawOptions.DYNAMIC_DRAW,
            count: 1,
            offset: 20,
            stride: 6 * Float32Array.BYTES_PER_ELEMENT,
            normalize: false
        }
    }
};
