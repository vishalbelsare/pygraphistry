'use strict';

/*
    Static-only facet for client.js
*/

const debug        = require('debug')('graphistry:StreamGL:staticclient');
const $            = window.$;
const Rx           = require('@graphistry/rxjs');
                     require('./rx-jquery-stub');
const _            = require('underscore');

const renderer     = require('./renderer.js');
const caption      = require('./caption.js');


// ======

const DimCodes = {
    point: 1,
    edge: 2
};

// Site-level configuration:
const BUCKET_REGION = 'us-west-1';
const BUCKET_NAME = 'graphistry.data';
const BUCKET_URL = 'https://s3-' + BUCKET_REGION + '.amazonaws.com/' + BUCKET_NAME;
const BASE_URL = BUCKET_URL + '/Static/';

// Per-content-instance:
// TODO: de-globalize:
let contentKey;
const labelsByType = {point: {}, edge: {}};


// ======

/**
 * URL composition for static content access.
 * @param {string} contentKey - identifies which content bundle sub-part of the bucket
 * @param {string} contentPath - identifies the member of the content bundle (relative file name/path)
 * @returns {string}
 */
function getStaticContentURL (contentKey, contentPath) {
    return BASE_URL + contentKey + '/' + (contentPath || '');
}


// string * {socketHost: string, socketPort: int} -> (... -> ...)
// where fragment == 'vbo?buffer' or 'texture?name'
function makeFetcher () {
// string * {<name> -> int} * name -> Subject ArrayBuffer
    return (bufferByteLengths, bufferName) => {

        debug('fetching', bufferName);

        const res = new Rx.Subject();

        // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Sending_and_Receiving_Binary_Data?redirectlocale=en-US&redirectslug=DOM%2FXMLHttpRequest%2FSending_and_Receiving_Binary_Data
        const oReq = new XMLHttpRequest();
        const assetURL = getStaticContentURL(contentKey, bufferName);
        oReq.open('GET', assetURL, true);
        // Handling a response as an arraybuffer means bypassing $.ajax:
        oReq.responseType = 'arraybuffer';

        const now = Date.now();
        oReq.onload = () => {
            if (oReq.status !== 200) {
                console.error('HTTP error acquiring data at: ', assetURL, oReq.statusText);
                return;
            }
            try {
                debug('got texture/vbo data', bufferName, Date.now() - now, 'ms');

                const arrayBuffer = oReq.response; // Note: not oReq.responseText
                if (bufferByteLengths.hasOwnProperty(bufferName)) {
                    const bufferLength = bufferByteLengths[bufferName];
                    debug('Buffer length (%s): %d, %d', bufferName, bufferLength, arrayBuffer.byteLength);
                    const trimmedArray = new Uint8Array(arrayBuffer, 0, bufferLength);

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

/**
 * Observable stream for one AJAX GET for a label offsets buffer (pure binary, UInt32Array).
 * @param {String} bufferName
 * @returns {ReplaySubject}
 */
function fetchOffsetBuffer (bufferName) {
    debug('fetching', bufferName);

    // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Sending_and_Receiving_Binary_Data?redirectlocale=en-US&redirectslug=DOM%2FXMLHttpRequest%2FSending_and_Receiving_Binary_Data
    const result = new Rx.ReplaySubject(1);
    const oReq = new XMLHttpRequest();
    const assetURL = getStaticContentURL(contentKey, bufferName);
    const now = Date.now();
    oReq.open('GET', assetURL, true);
    // Handling a response as an arraybuffer means bypassing $.ajax:
    oReq.responseType = 'arraybuffer';

    oReq.onload = () => {
        if (oReq.status !== 200) {
            console.error('HTTP error acquiring data at: ', assetURL, oReq.statusText);
            return;
        }
        try {
            debug('got offset data', bufferName, Date.now() - now, 'ms');

            const arrayBuffer = oReq.response; // Note: not oReq.responseText
            // Uint32Array to match persist.js static export format.
            result.onNext(new Uint32Array(arrayBuffer));
        } catch (e) {
            console.error('Render error on loading data:', e, e.stack);
        }
    };

    oReq.send(null);

    return result;
}

/**
 * @param {String} type 'point' or 'edge'
 * @returns {ReplaySubject}
 */
function getLabelOffsets (type) {
    const bufferName = type + 'Labels.offsets';
    return fetchOffsetBuffer(bufferName).do((labelContentOffsets) => {
        debug('Got offsets for', type, labelContentOffsets);
    });
}


/** Arbitrary limit to prevent large range requests, ~ 260kb. */
const LABEL_SIZE_LIMIT = Math.pow(2, 18);


function getLabelViaRange(type, index, byteStart, byteEnd) {
    const res = new Rx.Subject();
    const oReq = new XMLHttpRequest();
    const assetURL = getStaticContentURL(contentKey, type + 'Labels.buffer');
    const byteStartString = byteStart !== undefined && byteStart.toString ? byteStart.toString(10) : '';
    const byteEndString = byteEnd !== undefined && byteEnd.toString ? byteEnd.toString(10) : '';

    // First label: start can be 0, but end must be set.
    // Last label: start is set, end unspecified, okay.
    if (byteStartString || byteEndString) {
        oReq.responseType = 'text'; // 'json' does not work for a range request!
        if (!isNaN(byteEnd - byteStart)) {
            if (byteEnd - byteStart > LABEL_SIZE_LIMIT) {
                throw new Error('Too large labels range request', type, index, byteStart, byteEnd);
            }
        }

        oReq.open('GET', assetURL, true);
        oReq.setRequestHeader('Range', 'bytes=' + byteStartString + '-' + byteEndString);
        debug(assetURL, 'Range', 'bytes=' + byteStartString + '-' + byteEndString);

        oReq.onload = () => {
            if (oReq.status !== 206) {
                console.error('HTTP error acquiring ranged data at: ', assetURL);
                return;
            }
            try {
                let responseData = JSON.parse(oReq.responseText);
                // Dynamically transform deprecated/obsolete label response format of {attribute: value, ...}
                if (!responseData.hasOwnProperty('columns')) {
                    const title = responseData._title;
                    responseData = {
                        formatted: false,
                        title: decodeURIComponent(title),
                        columns: _.pairs(_.omit(responseData, '_title'))
                    };
                }

                debug('Label fetched', responseData);
                labelsByType[type][index] = responseData;
                res.onNext([responseData]);
            } catch (e) {
                console.error('Error on loading ranged data: ', e, e.stack);
            }
        };

        oReq.send(null);
    } else {
        throw new Error('Undefined labels range request', type, index, byteStart, byteEnd);
    }

    return res;
}


function getRangeForLabel (offsetsForType, type, index) {
    if (!offsetsForType) {
        throw new Error('Label offsets not found for type', type);
    }

    const lowerBound = offsetsForType[index];
    // Upper bound will be undefined for last label
    const upperBound = index < offsetsForType.length ? offsetsForType[index + 1] - 1 : undefined;

    if (upperBound !== undefined && lowerBound >= upperBound) {
        throw new Error('Invalid byte range indicated at', type, index);
    }
    return [lowerBound, upperBound];
}


function getLabel (offsetsForType, type, index) {
    const translatedType = _.findKey(DimCodes, (dimCode) => { return dimCode === type; }) || type;
    const labelCache = labelsByType[translatedType];
    if (labelCache.hasOwnProperty(index)) {
        const res = new Rx.Subject();
        res.onNext(labelCache[index]);
        return res;
    }
    const range = getRangeForLabel(offsetsForType, translatedType, index);
    return getLabelViaRange(translatedType, index, range[0], range[1]);
}


module.exports = {

    getStaticContentURL: getStaticContentURL,

    connect: (vizType, urlParams) => {
        debug('connect', vizType, urlParams);

        contentKey = urlParams.contentKey;

        const offsetsSource = Rx.Observable.combineLatest(
            getLabelOffsets('point'),
            getLabelOffsets('edge'),
            (pointsOffsets, edgesOffsets) => {
                // Ensure that points and edges are accessed at the same enum dim value (1 and 2):
                return [undefined, pointsOffsets, edgesOffsets];
            }
        );
        const offsetsCombined = new Rx.ReplaySubject(1);
        offsetsSource.subscribe(offsetsCombined);

        return Rx.Observable.return({
            socket: {
                on: (eventName) => {
                    debug('ignoring on event', eventName);
                },
                emit: (eventName, data, cb) => {
                    if (eventName === 'get_labels') {
                        const {dim, indices} = data;
                        offsetsCombined.flatMap(
                            (offsetsArray) => getLabel(offsetsArray[dim], dim, indices[0])
                        ).do((responseData) => {
                            cb(undefined, responseData);
                        }).subscribe(_.identity, (err) => {
                            console.error('Error fetching labels', data, err, (err || {}).stack);
                            cb(err, data);
                        });
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

    createRenderer: (socket, canvas, urlParams) => {
        debug('createRenderer');

        return $.ajaxAsObservable({
            url: getStaticContentURL(contentKey, 'renderconfig.json'),
            dataType: 'json'
        })
        .catch((error) => {
            console.error('Error retrieving render config.', error);
            throw new Error('Content Not Found');
        })
        .pluck('data')
        .map((data) => {
            debug('got', data);
            const renderState = renderer.init(data, canvas, urlParams);
            debug('Renderer created');
            return renderState;
        });
    },

    handleVboUpdates: (socket, uri, renderState) => {
        debug('handle vbo updates');

        const vboUpdates = new Rx.ReplaySubject(1);
        vboUpdates.onNext('init');

        const previousVersions = {buffers: {}, textures: {}};
        const vboVersions = new Rx.BehaviorSubject(previousVersions);

        const bufferBlackList = ['selectedPointIndexes', 'selectedEdgeIndexes'];

        $.ajaxAsObservable({url: getStaticContentURL(contentKey, 'metadata.json'), dataType: 'json'})
            .pluck('data')
            .do((data) => {
                debug('got metadata', data);

                caption.renderCaptionFromData(data);

                vboUpdates.onNext('start');

                const fetchBuffer = makeFetcher().bind(data.bufferByteLengths, '');
                const fetchTexture = makeFetcher().bind(data.bufferByteLengths, '');

                const readyBuffers = new Rx.ReplaySubject(1);
                const readyTextures = new Rx.ReplaySubject(1);
                const readyToRender = Rx.Observable.zip(readyBuffers, readyTextures, _.identity).share();
                readyToRender.subscribe(
                    () => { vboUpdates.onNext('received'); },
                    (err) => { console.error('readyToRender error', err, (err||{}).stack); });

                const changedBufferNames = _.select(_.keys(data.bufferByteLengths),
                    (bufferName) => !_.contains(bufferBlackList, bufferName));
                const bufferFileNames = changedBufferNames.map((bufferName) => bufferName + '.vbo');
                const bufferVBOs = Rx.Observable.combineLatest(
                    [Rx.Observable.return()]
                        .concat(bufferFileNames.map(fetchBuffer)))
                    .take(1);
                bufferVBOs
                    .subscribe(
                        (vbos) => {
                            vbos.shift();
                            const bindings = _.object(_.zip(changedBufferNames, vbos));
                            try {
                                _.each(data.elements, (num, itemName) => {
                                    renderer.setNumElements(renderState, itemName, num);
                                });
                                renderer.loadBuffers(renderState, bindings);
                                readyBuffers.onNext();
                            } catch (e) {
                                console.error('Render error on loading data into WebGL:', e, e.stack);
                            }
                        },
                        (err) => {
                            console.error('bufferVBOs exn', err, (err||{}).stack);
                        });

                const changedTextureNames = [];
                const texturesData = Rx.Observable.combineLatest(
                    [Rx.Observable.return()]
                        .concat(changedTextureNames.map(fetchTexture)))
                    .take(1);
                texturesData
                    .subscribe((textures) => {
                        textures.shift();
                        const textureNfos = changedTextureNames.map((name, i) => {
                            return _.extend(data.textures[name], {buffer: textures[i]});
                        });
                        const bindings = _.object(_.zip(changedTextureNames, textureNfos));
                        renderer.loadTextures(renderState, bindings);
                        readyTextures.onNext();
                    },
                    (err) => {
                        console.error('texturesData exn', err, (err||{}).stack);
                    });

            }).subscribe(_.identity,
                (err) => {
                    console.error('fetch vbo exn', err, (err||{}).stack);
                    throw new Error('Content Not Found');
                });

        return {
            vboUpdates: vboUpdates,
            vboVersions: vboVersions
        };

    }
};
