'use strict';

/*
    Static-only facet for client.js
*/

var debug        = require('debug')('graphistry:StreamGL:staticclient');
var $            = window.$;
var Rx           = require('rx');
                   require('./rx-jquery-stub');
var _            = require('underscore');

var renderer     = require('./renderer.js');


//======

// Site-level configuration:
var BUCKET_REGION = 'us-west-1';
var BUCKET_NAME = 'graphistry.data';
var BUCKET_URL = 'https://s3-' + BUCKET_REGION + '.amazonaws.com/' + BUCKET_NAME;
var BASE_URL = BUCKET_URL + '/Static/';

// Per-content-instance:
// TODO: de-globalize:
var contentKey;
var labelsByType = {point: {}, edge: {}};
var labelsIndexesByType = {};


// ======


//string * {socketHost: string, socketPort: int} -> (... -> ...)
// where fragment == 'vbo?buffer' or 'texture?name'
function makeFetcher () {
//string * {<name> -> int} * name -> Subject ArrayBuffer
    return function (bufferByteLengths, bufferName) {

        debug('fetching', bufferName);

        var res = new Rx.Subject();

        //https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Sending_and_Receiving_Binary_Data?redirectlocale=en-US&redirectslug=DOM%2FXMLHttpRequest%2FSending_and_Receiving_Binary_Data
        var oReq = new XMLHttpRequest();
        var assetURL = BASE_URL + contentKey + '/' + bufferName;
        oReq.open('GET', assetURL, true);
        // Handling a response as an arraybuffer means bypassing $.ajax:
        oReq.responseType = 'arraybuffer';

        var now = Date.now();
        oReq.onload = function () {
            if (oReq.status !== 200) {
                console.error('HTTP error acquiring data at: ', assetURL, oReq.statusText);
                return;
            }
            try {
                debug('got texture/vbo data', bufferName, Date.now() - now, 'ms');

                var arrayBuffer = oReq.response; // Note: not oReq.responseText
                if (bufferByteLengths.hasOwnProperty(bufferName)) {
                    var bufferLength = bufferByteLengths[bufferName];
                    debug('Buffer length (%s): %d, %d', bufferName, bufferLength, arrayBuffer.byteLength);
                    var trimmedArray = new Uint8Array(arrayBuffer, 0, bufferLength);

                    res.onNext(trimmedArray);
                } else {
                    res.onNext(new Uint8Array(arrayBuffer));
                }

            } catch (e) {
                console.error('Render error on loading data into WebGL:', e, e.stack);
            }
        };

        oReq.send(null);

        return res.take(1);
    };
}


function fetchIndexBuffer (bufferName) {
    debug('fetching', bufferName);

    // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Sending_and_Receiving_Binary_Data?redirectlocale=en-US&redirectslug=DOM%2FXMLHttpRequest%2FSending_and_Receiving_Binary_Data
    var result = new Rx.Subject(),
        oReq = new XMLHttpRequest(),
        assetURL = BASE_URL + contentKey + '/' + bufferName,
        now = Date.now();
    oReq.open('GET', assetURL, true);
    // Handling a response as an arraybuffer means bypassing $.ajax:
    oReq.responseType = 'arraybuffer';

    oReq.onload = function () {
        if (oReq.status !== 200) {
            console.error('HTTP error acquiring data at: ', assetURL, oReq.statusText);
            return;
        }
        try {
            debug('got index data', bufferName, Date.now() - now, 'ms');

            var arrayBuffer = oReq.response; // Note: not oReq.responseText
            result.onNext(new Uint32Array(arrayBuffer));
        } catch (e) {
            console.error('Render error on loading data:', e, e.stack);
        }
    };

    oReq.send(null);

    return result;
}


function getLabelIndexes(type) {
    fetchIndexBuffer(type + 'Indexes.buffer').forEach(function (labelIndexOffsets) {
        labelsIndexesByType[type] = labelIndexOffsets;
    });
}


function getLabelViaRange(type, index, byteStart, byteEnd) {
    var res = new Rx.Subject(),
        oReq = new XMLHttpRequest(),
        assetURL = BASE_URL + contentKey + '/' + type + 'Labels.buffer',
        byteStartString = byteStart !== undefined && byteStart.toString ? byteStart.toString(10) : '',
        byteEndString = byteEnd !== undefined && byteEnd.toString ? byteEnd.toString(10) : '';
    // First label: start can be 0, but end must be set.
    // Last label: start is set, end unspecified, okay.
    if (byteStartString || byteEndString) {
        oReq.responseType = 'application/json';
        oReq.open('GET', assetURL, true);
        oReq.setRequestHeader('Range', 'bytes=' + byteStartString + '-' + byteEndString);

        oReq.onload = function () {
            if (oReq.status !== 206) {
                console.error('HTTP error acquiring ranged data at: ', assetURL);
                return;
            }
            try {
                labelsByType[type][index] = oReq.response;
                res.onNext(oReq.response);
            } catch (e) {
                console.error('Error on loading ranged data: ', e, e.stack);
            }
        };

        oReq.send(null);
    } else {
        throw new Error('Undefined labels range request', type, index, byteStart, byteEnd);
    }

    return res.take(1);
}


function getRangeForLabel(type, index) {
    var indexesByType = labelsIndexesByType[type],
        lowerBound = indexesByType && indexesByType[index];
    if (lowerBound === undefined) {
        throw new Error('Label indexes not found for type', type);
    }
    return [lowerBound, indexesByType[index + 1]];
}


function getLabel(type, index) {
    var translatedType = type === 1 ? 'point' : (type === 2 ? 'edge' : type),
        labelCache = labelsByType[translatedType];
    if (labelCache.hasOwnProperty(index)) {
        var res = new Rx.Subject();
        res.onNext(labelCache[index]);
        return res;
    }
    var range = getRangeForLabel(translatedType, index);
    return getLabelViaRange(translatedType, index, range[0], range[1]);
}


module.exports = {

    connect: function (vizType, urlParams) {
        debug('connect', vizType, urlParams);

        contentKey = urlParams.contentKey;

        return Rx.Observable.return({
            socket: {
                on: function (eventName) {
                    debug('ignoring on event', eventName);
                },
                emit: function (eventName, data, cb) {
                    if (eventName === 'get_labels') {
                        var dim = data.dim,
                            indices = data.indices;
                        try {
                            getLabel(dim, indices[0])
                                .flatMap(function (responseData) {
                                    cb(undefined, responseData);
                                });
                        } catch (e) {
                            cb(e, data);
                        }
                    } else if (eventName === 'interaction') {
                        // Ignored for now, cuts back on logs.
                        return undefined;
                    } else {
                        debug('ignoring emit event', eventName);
                    }
                }
            },
            uri: {}
        });
    },

    createRenderer: function (socket, canvas, urlParams) {
        debug('createRenderer');

        return $.ajaxAsObservable({
                url: BASE_URL + contentKey + '/renderconfig.json',
                dataType: 'json'
            })
            .pluck('data')
            .map(function (data) {
                debug('got', data);
                var renderState = renderer.init(data, canvas, urlParams);
                debug('Renderer created');
                return renderState;
            });
    },

    handleVboUpdates: function (socket, uri, renderState) {
        debug('handle vbo updates');

        var vboUpdates = new Rx.ReplaySubject(1);
        vboUpdates.onNext('init');

        getLabelIndexes('point');
        getLabelIndexes('edge');

        $.ajaxAsObservable({url: BASE_URL + contentKey + '/metadata.json', dataType: 'json'})
            .pluck('data')
            .do(function (data) {
                debug('got metadata', data);

                $('#graph-node-count').text(data.elements.pointculled);
                var numEdges = (data.elements.edgeculled || data.elements.edgeculledindexed ||
                                data.elements.edgeculledindexedclient) / 2;
                $('#graph-edge-count').text(numEdges);

                vboUpdates.onNext('start');

                var fetchBuffer = makeFetcher().bind(data.bufferByteLengths, '');
                var fetchTexture = makeFetcher().bind(data.bufferByteLengths, '');

                var readyBuffers = new Rx.ReplaySubject(1);
                var readyTextures = new Rx.ReplaySubject(1);
                var readyToRender = Rx.Observable.zip(readyBuffers, readyTextures, _.identity).share();
                readyToRender.subscribe(
                    function () { vboUpdates.onNext('received'); },
                    function (err) { console.error('readyToRender error', err, (err||{}).stack); });

                var changedBufferNames = _.keys(data.bufferByteLengths);
                var bufferFileNames = changedBufferNames.map(function (bufferName) {
                    return bufferName + '.vbo';
                });
                var bufferVBOs = Rx.Observable.zipArray(
                    [Rx.Observable.return()]
                        .concat(bufferFileNames.map(fetchBuffer)))
                    .take(1);
                bufferVBOs
                    .subscribe(function (vbos) {
                            vbos.shift();
                            var bindings = _.object(_.zip(changedBufferNames, vbos));
                            try {
                                _.each(data.elements, function (num, itemName) {
                                    renderer.setNumElements(renderState, itemName, num);
                                });
                                renderer.loadBuffers(renderState, bindings);
                                readyBuffers.onNext();
                            } catch (e) {
                                console.error('Render error on loading data into WebGL:', e, e.stack);
                            }
                        },
                        function (err) {
                            console.error('bufferVBOs exn', err, (err||{}).stack);
                        });

                var changedTextureNames = [];
                var texturesData = Rx.Observable.zipArray(
                    [Rx.Observable.return()]
                        .concat(changedTextureNames.map(fetchTexture)))
                    .take(1);
                texturesData
                    .subscribe(function (textures) {
                            textures.shift();
                            var textureNfos = changedTextureNames.map(function (name, i) {
                                return _.extend(data.textures[name], {buffer: textures[i]});
                            });
                            var bindings = _.object(_.zip(changedTextureNames, textureNfos));
                            renderer.loadTextures(renderState, bindings);
                            readyTextures.onNext();
                        },
                        function (err) {
                            console.error('texturesData exn', err, (err||{}).stack);
                        });

            }).subscribe(_.identity,
                function (err) {
                    console.error('fetch vbo exn', err, (err||{}).stack);
                });

        return vboUpdates;

    }
};
