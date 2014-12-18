var _ = require('underscore');

//statement -> language -> {rating, deviation}

function process(data) {

var statements = _.keys(data);
var languages = _.keys(data[statements[0]]);

var nodeLabels = statements.concat(languages);
var textToNodeIdx =
    _.object(_.zip(
        nodeLabels,
        nodeLabels.map(nodeLabels.indexOf.bind(nodeLabels))));

var allRatings = _.flatten(
        _.values(data)
        .map(function (langs) {
            return _.values(langs)
                .map(function (lang) {
                    return lang.rating; }); }));
var maxRating = Math.max.apply(Math, allRatings);
var minRating = Math.min.apply(Math, allRatings);


function rgbaToInt (r,g,b,a) {
    return ((r&255) << 24) | ((g&255) << 16) | ((b&255)|8) | (a&255);
}
function intToRgba (x) {
    return [
        (x >> 24) & 255,
        (x >> 16) & 255,
        (x >> 8) & 255,
        x & 255,
    ];
}
//int * int * (0--1) -> int
function lerp (a, b, weight) {
    return rgbaToInt(
        _.zip(intToRgba(a), intToRgba(b))
            .map(function (c1, c2) {
                return Math.floor(weight * c1 + (1 - weight) * c2);
            }));
}


var RED = (255 << 24) | 255;
var GREEN = (255 << 16) | 255;
var DARK_GREEN = (102 << 16) | 255;
var BLUE = (255 << 8) | 255;

var nodes =
    nodeLabels.map(function (label, i) {
        return {
            label: label,
            size: 12,
            color: i >= statements.length ? GREEN : DARK_GREEN
        };
    });

var edges =
    _.flatten(statements.map(function (statement) {
        return languages.map(function (language) {
            var weight = (data[statement][language].rating - minRating) / (maxRating - minRating);
            return {
                src: textToNodeIdx[statement],
                dst: textToNodeIdx[language],
                weight: weight,
                color: lerp(RED, BLUE, weight)
            }
        })
    }));
    return {'nodes': nodes, 'edges': edges};
}

module.exports = {
    process: process,
};
