webpackJsonp([0],{

/***/ 198:
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
Object.defineProperty(__webpack_exports__, "__esModule", { value: true });
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0_react__ = __webpack_require__(45);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0_react___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_0_react__);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1_react_dom__ = __webpack_require__(124);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1_react_dom___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_1_react_dom__);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_2__graphistry_client_api_react__ = __webpack_require__(116);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_2__graphistry_client_api_react___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_2__graphistry_client_api_react__);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_3__graphistry_client_api_react_assets_index_less__ = __webpack_require__(118);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_3__graphistry_client_api_react_assets_index_less___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_3__graphistry_client_api_react_assets_index_less__);





var container = document.getElementById('__react-content');
container.style['height'] = '400px';

__WEBPACK_IMPORTED_MODULE_1_react_dom___default.a.render(__WEBPACK_IMPORTED_MODULE_0_react___default.a.createElement(__WEBPACK_IMPORTED_MODULE_2__graphistry_client_api_react__["Graphistry"], { backgroundColor: '#fff',
    showSplashScreen: true,
    showPointsOfInterest: false,
    apiKey: '<your API Key here>',
    style: { border: '1px solid #ccc' },
    graphistryHost: 'https://labs.graphistry.com',
    nodes: [{ nodeId: 'node1', pointTitle: 'Point 1', aNodeField: 'I\'m a node!', pointColor: 5 }, { nodeId: 'node2', pointTitle: 'Point 2', aNodeField: 'I\'m a node too!', pointColor: 4 }, { nodeId: 'node3', pointTitle: 'Point 3', aNodeField: 'I\'m a node three!', pointColor: 3 }],
    edges: [{ src: 'node1', dst: 'node2', edgeTitle: 'Edge 1', edgeCount: 7, anEdgeField: 'I\'m an edge!' }, { src: 'node3', dst: 'node1', edgeTitle: 'Edge 2', edgeCount: 35, anEdgeField: 'I\'m another edge!' }, { src: 'node2', dst: 'node3', edgeTitle: 'Edge 3', edgeCount: 200, anEdgeField: 'I\'m also an edge!' }],
    bindings: {
        idField: 'nodeId',
        sourceField: 'src',
        destinationField: 'dst'
    } }), container);

/***/ }),

/***/ 650:
/***/ (function(module, exports, __webpack_require__) {

module.exports = __webpack_require__(198);


/***/ })

},[650]);
//# sourceMappingURL=dynamic.js.map
