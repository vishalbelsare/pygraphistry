'use strict';

var _ = require('underscore');

var Dataframe = function (graph) {
    this.graph = graph;
};

Dataframe.prototype.load = function (graph) {
    this.graph = graph;
    // console.log('Loading: ');
    this.print();
    // console.log('Loading: ', this.graph);
}

Dataframe.prototype.print = function () {
    // console.log('Printing');
    // console.log('Graph keys: ', _.keys(this.graph));
    // console.log('Sim keys: ', _.keys(this.graph.simulator));
    // console.log(this.graph);
}


module.exports = Dataframe;
