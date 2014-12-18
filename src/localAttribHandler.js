'use strict';

var debug = require('debug')('StreamGL:renderer'),
    _     = require('underscore');


// Immutable RenderOptions -> [ string ]
// TODO associate with a buffer to tighten size bound
function getActiveLocalAttributes (config) {
    config = config.toJS();

    var renderItems = config.render;
    var activeLocalAttributesLists = renderItems.map(function (itemName) {
        var bindings = config.items[itemName].bindings;
        return _.pairs(bindings)
            .map(function (bindingPair) {
                var modelName = bindingPair[1][0];
                var attribName = bindingPair[1][1];
                debug('bindingPair', bindingPair);
                debug('datasource', config.models[modelName][attribName].datasource);
                debug('localName', config.models[modelName][attribName].localName);
                return {
                    datasource: config.models[modelName][attribName].datasource || 'SERVER',
                    localName: config.models[modelName][attribName].localName
                };
            })
            .filter(function (binding) { return binding.datasource === 'LOCAL'; })
            .map(function (binding) { return binding.localName; });
    });

    return _.uniq(_.flatten(activeLocalAttributesLists));
}

function updateLocalAttributesBuffer(cache, helpers, gl, length, name) {

    if (!cache.host[name]) {
        cache.host[name] = new Uint32Array([]);
    }
    if (!cache.gl[name]) {
        cache.gl[name] = gl.createBuffer();
    }

    var oldHostBuffer = cache.host[name];
    if (oldHostBuffer.length < length) {

        var longerBuffer = helpers.expandHostBuffer(gl, length, 1, cache.host[name]);
        cache.host[name] = longerBuffer;

        var glBuffer = cache.gl[name];

        debug('Expanding local buffer', name, glBuffer, 'memcpy', oldHostBuffer.length, 'elts', 'write to', length);

        helpers.bindBuffer(gl, glBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, longerBuffer, gl.STREAM_DRAW);
    }

}


module.exports = {
    getActiveLocalAttributes: getActiveLocalAttributes,
    updateLocalAttributesBuffer: updateLocalAttributesBuffer
};
