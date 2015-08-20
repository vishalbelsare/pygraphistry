'use strict';

var $               = window.$;
var _               = require('underscore');
var Rx              = require('rx');
                      require('../rx-jquery-stub');
var util            = require('./util.js');


function colorObjectToCSS(c) {
    return 'rgba(' + [c.r, c.g, c.b, c.a | 1].join(',') + ')';
}


function colorObjectToHex(c) {
    return '#' + (c.r | 0).toString(16) + (c.g | 0).toString(16) + (c.b | 0).toString(16) + (c.a | 0).toString(16);
}


function colorObjectToBytes(c) {
    return [c.r, c.g, c.b, c.a];
}


//$DOM * hex -> Observable hex
function makeInspector ($elt, hexColor) {

    var colors = new Rx.Subject();

    $elt.find('.colorSelector').ColorPicker({
        color: hexColor,
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

/**
 *
 * @param {HTMLElement} $fg - Element for the foreground color button affordance.
 * @param {HTMLElement} $bg - Element for the background color button affordance.
 * @param {Socket} socket - socket or proxy
 * @param {RenderState} renderState
 * @returns {{foregroundColor: *, backgroundColor: *}} - streams of r,g,b objects
 */
module.exports = {
    init: function ($fg, $bg, socket, renderState) {

        var foregroundColor = new Rx.ReplaySubject(1),
            blackForegroundDefault = {r: 0, g: 0, b: 0};
        foregroundColor.onNext(blackForegroundDefault);
        makeInspector($fg, colorObjectToHex(blackForegroundDefault))
            .throttleFirst(10)
            .do(function (foregroundColor) {
                socket.emit('set_colors', {rgb: foregroundColor});
            })
            .subscribe(foregroundColor, util.makeErrorHandler('bad fg color'));

        var backgroundColor = new Rx.ReplaySubject(1);

        var renderStateBackgroundColorRGBA = renderState.get('options').clearColor[0],
            rgbaBytes = _.map(renderStateBackgroundColorRGBA, function (value) { return value * 255; }),
            renderStateBackgroundColorObject = {r: rgbaBytes[0], g: rgbaBytes[1], b: rgbaBytes[2], a: rgbaBytes[3]};

        backgroundColor.onNext(renderStateBackgroundColorObject);
        makeInspector($bg, colorObjectToHex(renderStateBackgroundColorObject))
            .throttleFirst(10)
            .do(function (backgroundColor) {
                // Set the background color directly/locally via CSS:
                $('#simulation').css('backgroundColor', colorObjectToCSS(backgroundColor));
                // Update the server render config:
                socket.emit('update_render_config', {'options': {'clearColor': [colorObjectToBytes(backgroundColor)]}});
            })
            .subscribe(backgroundColor, util.makeErrorHandler('bad background color'));

        return {
            foregroundColor: foregroundColor,
            backgroundColor: backgroundColor
        };
    },

    makeInspector: makeInspector,

    colorObjectToCSS: colorObjectToCSS,

    colorObjectToHex: colorObjectToHex,

    colorObjectToBytes: colorObjectToBytes
};
