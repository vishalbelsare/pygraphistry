'use strict';

var $               = window.$;
var _               = require('underscore');
var Rx              = require('rx');
                      require('../rx-jquery-stub');
var util            = require('./util.js');


//$DOM * hex -> Observable hex
function makeInspector ($elt, color) {

    var colors = new Rx.Subject();

    $elt.find('.colorSelector').ColorPicker({
        color: color,
        onShow: function (colpkr) {
            $(colpkr).fadeIn(500);
            return false;
        },
        onHide: function (colpkr) {
            $(colpkr).fadeOut(500);
            return false;
        },
        onChange: function (hsb, hex, rgb) {
            $elt.find('.colorSelector div').css('backgroundColor', '#' + hex);
            colors.onNext(rgb);
        }
    });

    return colors;
}

module.exports = function ($fg, $bg, socket, renderState) {

    var foregroundColor = new Rx.ReplaySubject(1);
    foregroundColor.onNext({r: 0, g: 0, b: 0});
    makeInspector($fg, '#000')
        .sample(10)
        .do(function (rgb) {
            socket.emit('set_colors', {rgb: rgb});
        })
        .subscribe(foregroundColor, util.makeErrorHandler('bad fg color'));

    var backgroundColor = new Rx.ReplaySubject(1);

    var initColor = _.chain(renderState.get('options').clearColor[0]).zip(['r', 'g', 'b', 'a']).map(function (pair) {
        return [pair[1], pair[0] * 255];
    }).object().value();

    backgroundColor.onNext(initColor);
    makeInspector($bg, '#fff')
        .sample(10)
        .do(function (rgb) {
            $('#simulation').css('backgroundColor', 'rgba(' + [rgb.r, rgb.g, rgb.b, 255].join(',') + ')');
        })
        .subscribe(backgroundColor, util.makeErrorHandler('bad bg color'));

    return {
        foregroundColor: foregroundColor,
        backgroundColor: backgroundColor
    };

};
