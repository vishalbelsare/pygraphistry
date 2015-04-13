'use strict';

/*
    Local-only facet for client.js
*/

var debug        = require('debug')('graphistry:StreamGL:localclient');
var $            = window.$;
var Rx           = require('rx');
                   require('./rx-jquery-stub');
var _            = require('underscore');

var renderer     = require('./renderer.js');


//string * {socketHost: string, socketPort: int} -> (... -> ...)
// where fragment == 'vbo?buffer' or 'texture?name'
function makeFetcher () {
//string * {<name> -> int} * name -> Subject ArrayBuffer
    return function (bufferByteLengths, bufferName) {

        console.log('fetching', bufferName);

        var res = new Rx.Subject();

        //https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Sending_and_Receiving_Binary_Data?redirectlocale=en-US&redirectslug=DOM%2FXMLHttpRequest%2FSending_and_Receiving_Binary_Data
        var oReq = new XMLHttpRequest();
        oReq.open('GET', '/graph/viz/facebook.' + bufferName + '.vbo', true);
        oReq.responseType = 'arraybuffer';

        var now = Date.now();
        oReq.onload = function () {
            try {
                console.log('got texture/vbo data', bufferName, Date.now() - now, 'ms');

                var arrayBuffer = oReq.response; // Note: not oReq.responseText
                var blength = bufferByteLengths[bufferName];
                console.log('Buffer length (%s): %d', bufferName, blength);
                var trimmedArray = new Uint8Array(arrayBuffer, 0, blength);

                res.onNext(trimmedArray);

            } catch (e) {
                console.error('Render error on loading data into WebGL:', e, e.stack);
            }
        };

        oReq.send(null);

        return res.take(1);
    };
}






module.exports = {
    connect: function (vizType, urlParams) {
        console.log('connect');

        return Rx.Observable.return({
            socket: {
                on: function (evt) { console.log('ignoring on reg', evt); },
                emit: function (evt) { console.log('ignoring emit', evt); }
            },
            params: {}
        });
    },

    createRenderer: function (socket, canvas) {
        console.log('createRenderer');

        return $.ajaxAsObservable({
                url: '/graph/viz/facebook.renderconfig.json',
                dataType: 'json'
            })
            .pluck('data')
            .map(function (data) {
                console.log('got', data);
                return renderer.init(data, canvas);
            });
    },

    handleVboUpdates: function (socket, renderState, renderStateUpdates) {
        console.log('handle vbo updates');

        var buffers = renderState.get('buffers').toJS();

        var latestState = new Rx.ReplaySubject(1);
        latestState.onNext(renderState);
        renderStateUpdates.subscribe(
            latestState,
            function (err) { console.error('handlevbo err', err, (err||{}).stack); });

        var renderedFrame = new Rx.BehaviorSubject(0);


        $.ajaxAsObservable({url: '/graph/viz/facebook.metadata.json', dataType: 'json'})
            .pluck('data')
            .do(function (data) {
                console.log('got metadata', data);
                renderedFrame.onNext('start');

                var fetchBuffer = makeFetcher().bind('', data.bufferByteLengths);
                var fetchTexture = makeFetcher().bind('', data.bufferByteLengths);


                var readyBuffers = new Rx.ReplaySubject(1);
                var readyTextures = new Rx.ReplaySubject(1);
                var readyToRender = Rx.Observable.zip(readyBuffers, readyTextures, _.identity).share();

                var changedBufferNames = _.keys(data.bufferByteLengths);
                var bufferVBOs = Rx.Observable.zipArray(
                    [Rx.Observable.return()]
                        .concat(changedBufferNames.map(fetchBuffer)))
                    .take(1);
                bufferVBOs
                    .subscribe(function (vbos) {
                            vbos.shift();
                            var bindings = _.object(_.zip(changedBufferNames, vbos));
                            try {
                                renderer.setNumElements(data.elements);
                                renderer.loadBuffers(renderState, buffers, bindings);
                                readyBuffers.onNext();
                            } catch (e) {
                                console.error('5a err. Render error on loading data into WebGL:', e, e.stack);
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

                Rx.Observable.combineLatest(
                        readyToRender, latestState,
                        function (_, renderState) { return [_,renderState]; })
                    .filter(function (pair) {
                        return pair[1]; })
                    .take(1)
                    .subscribe(function (pair) {
                            var renderState = pair[1];
                            renderedFrame.onNext('received');
                            renderer.render(renderState, 'clientNewVbos', function () {
                                renderedFrame.onNext('rendered');
                            });
                        },
                        function (err) {
                            console.error('vbo render exn', err, (err||{}).stack);
                        });


            }).subscribe(_.identity,
                function (err) {
                    console.error('fetch vbo exn', err, (err||{}).stack);
                });

        return renderedFrame;

    }
};