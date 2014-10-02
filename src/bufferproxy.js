'use strict';

/*

GLContext * {<name> -> TypedArray} * {<name> * -> TypedArray}
->
{
    read: int -> 'a',
    write: int * 'a -> ()
}

*/

//TODO unify somehow with CLDataWrapper


var debug = require('debug')('StreamGL:bufferproxy');


function bufferProxy (gl, hostBuffers, glBuffers) {
    return function (name) {
        var hostBuffer;
        var glBuffer;
        var singletonBuff;

        var rebind = function () {
            if (hostBuffer && glBuffer) {
                return true;
            }
            hostBuffer = hostBuffers[name];
            glBuffer = glBuffers[name];
            return hostBuffer && glBuffer;
        };

        return {
            read: function (i) {
                if (!rebind()) {
                    return;
                }
                return hostBuffer[i];
            },
            write: function (i, v) {
                if (!rebind()) {
                    return;
                }
                if (!singletonBuff) {
                    singletonBuff = new Float32Array([0]);
                }
                hostBuffer[i] = v;
                singletonBuff[0] = v;
                gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, i * singletonBuff.BYTES_PER_ELEMENT, singletonBuff);
            }
        };
    };
}

module.exports = {
    bufferProxy: bufferProxy
};