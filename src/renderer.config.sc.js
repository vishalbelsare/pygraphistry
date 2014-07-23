"use strict";

var fs = require("fs");

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

    "camera": {
        "type": "2d",
        "init": [{"left": -0.15, "right": 5, "bottom": 5, "top": -0.15}]
    },

    "programs": {
        "main": {
            "sources": {
                "vertex": fs.readFileSync("./src/sc_vert.shader", "utf8").toString("ascii"),
                "fragment": fs.readFileSync("./src/sc_frag.shader", "utf8").toString("ascii")
            },
            "attributes": ["a_position", "a_color"],
            "uniforms": [],
            "camera": "u_mvp_matrix"
        }
    },

    "buffers": {
        "mainVBO": {
            "elements": {
                "position": {
                    "type": "FLOAT",
                    "count": 3,
                    "normalize": false,
                    "stride": 16,
                    "offset": 0
                },
                "color": {
                    "type": "UNSIGNED_BYTE",
                    "count": 4,
                    "normalize": true,
                    "stride": 16,
                    "offset": 12
                },
            }
        }
    },

    "render": {
        "everything": {
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
            "drawType": "TRIANGLE_STRIP",
            "glOptions": {}
        }
    }
};