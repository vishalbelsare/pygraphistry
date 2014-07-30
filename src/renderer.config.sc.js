"use strict";

/** @module RenderConfig/Superconductor */

var fs = require("fs");

/**
 * Configuration for Superconductor rendering pipeline
 * @type RenderPipeline
 */
var config = {
    "options": {
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
        "init": [{"top": -0.15, "left": -0.15, "bottom": 5, "right": 5}]
    },

    "programs": {
        "main": {
            "sources": {
                "vertex": fs.readFileSync("./src/shaders/sc/vertex.glsl", "utf8").toString("ascii"),
                "fragment": fs.readFileSync("./src/shaders/sc/fragment.glsl", "utf8").toString("ascii")
            },
            "attributes": ["a_position", "a_color"],
            "camera": "u_mvp_matrix"
        }
    },

    "models": {
        "mainVBO": {
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
            }
        }
    },

    "scene": {
        "items": {
            "everything": {
                "program": "main",
                "bindings": {
                    "a_position": {"model": "mainVBO", "element": "position" },
                    "a_color": {"model": "mainVBO", "element": "color"}
                },
                "drawType": "TRIANGLE_STRIP"
            }
        },
        "render": ["everything"]
    }
};

module.exports = config;