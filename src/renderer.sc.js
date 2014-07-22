"use strict";

var fs = require("fs");

/*
    options -> Object with keys being GL global option function names, and value being an array of
    arrays. Each array contained in the outer array represents a call to the function, and the
    values in each array are arguments to the function. Strings are converted to symblic constants
    of the gl object; ex: "BLEND" -> gl.BLEND
*/

// Want to be able to use same buffer with different shaders, or same shader with different buffers

module.exports = {
    "glOptions": {
        "enable": [["BLEND"], ["DEPTH_TEST"]],
        "disable": [["CULL_FACE"]],
        "blendFuncSeparate": [["SRC_ALPHA", "ONE_MINUS_SRC_ALPHA", "ONE", "ONE"]],
        "blendEquationSeparate": [["FUNC_ADD", "FUNC_ADD"]],
        "depthFunc": [["LEQUAL"]],
        "clearColor": [[0, 0, 0, 1.0]],
        "lineWidth": [[1]]
    },

    "programs": {
        "main": {
            "sources": {
                "vertex": fs.readFileSync("./src/sc_vert.shader", "utf8").toString("ascii"),
                "fragment": fs.readFileSync("./src/sc_frag.shader", "utf8").toString("ascii")
            },
            "attributes": ["a_position", "a_color", "u_mvp_matrix"],
            "camera": {
                "attribute": "u_mvp_matrix",
                "dimensions": 3
            }
        }
    },

    "buffers": {
        "mainVBO": {
            "elements": {
                "position": {
                    "type": "FLOAT",
                    "elements": 3,
                    "normalize": false,
                    "stride": 16,
                    "offset": 0
                },
                "color": {
                    "type": "UNSIGNED_BYTE",
                    "elements": 4,
                    "normalize": true,
                    "stride": 16,
                    "offset": 12
                },
            }
        }
    },

    "render": [
        {
            "program": "main",
            "bindings": {
                "a_position": {
                    "buffer": "mainVBO",
                    "element": "position"
                },
                "a_color": {
                    "buffer": "mainVBO",
                    "element": "color"
                }
            },
            "drawType": "LINES",
            "glOptions": {}
        }
    ]
};