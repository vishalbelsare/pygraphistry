'use strict';

var $               = window.$;
var _               = require('underscore');
var Rx              = require('rx');
                      require('../rx-jquery-stub');
var util            = require('./util.js');
var Color           = require('color');


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
            var color = new Color(rgb);
            colors.onNext(color);
        }
    });

    return colors;
}


function renderConfigValueForColor(colorValue) {
    return _.map(colorValue.rgbaArray(), function (value, index) {
        //255,255,255,1 -> 1,1,1,1
        return index === 3 ? value : (value/255);
    });
}


function colorFromRenderConfigValue(rgbaFractions) {
    return new Color()
        .rgb(rgbaFractions.slice(0,3).map(function (v) { return v * 255; }))
        .alpha(rgbaFractions[3]);
}


/**
 *
 * @param {HTMLElement} $fg - Element for the foreground color button affordance.
 * @param {HTMLElement} $bg - Element for the background color button affordance.
 * @param {Socket} socket - socket or proxy
 * @param {RenderState} renderState
 */
module.exports = {
    init: function ($fg, $bg, foregroundColorObservable, backgroundColorObservable, socket) {

        foregroundColorObservable.first()
            .subscribe(function (initForegroundColor) {
                makeInspector($fg, initForegroundColor.hexString())
                    .throttleFirst(10)
                    .do(function (foregroundColor) {
                        // Execute the server command:
                        socket.emit('set_colors', {
                            rgb: {
                                r: foregroundColor.red(),
                                g: foregroundColor.green(),
                                b: foregroundColor.blue(),
                                a: foregroundColor.alpha()
                            }
                        });
                        // Update the color picker swatch affordance:
                        $('.colorSelector div', $fg).css('background-color', foregroundColor.hexString());
                    })
                    .subscribe(foregroundColorObservable, util.makeErrorHandler('bad foreground color'));
            });

        backgroundColorObservable.first()
            .subscribe(function (initBackgroundColor) {
                makeInspector($bg, initBackgroundColor.hexString())
                    .throttleFirst(10)
                    .do(function (backgroundColor) {
                        // Set the background color directly/locally via CSS:
                        $('#simulation').css('backgroundColor', backgroundColor.rgbaString());
                        // Update the server render config:
                        var newValue = renderConfigValueForColor(backgroundColor);
                        socket.emit('update_render_config', {'options': {'clearColor': [newValue]}});
                        // Update the color picker swatch affordance:
                        $('.colorSelector div', $bg).css('background-color', backgroundColor.hexString());
                    })
                    .subscribe(backgroundColorObservable, util.makeErrorHandler('bad background color'));
            });
    },

    makeInspector: makeInspector,

    colorFromRenderConfigValue: colorFromRenderConfigValue,

    renderConfigValueForColor: renderConfigValueForColor,

    foregroundColorObservable: function () {
        var foregroundColorObservable = new Rx.ReplaySubject(1);
        var blackForegroundDefault = (new Color()).rgb(0, 0, 0);
        foregroundColorObservable.onNext(blackForegroundDefault);
        return foregroundColorObservable;
    },

    backgroundColorObservable: function (initialRenderState, urlParams) {
        var backgroundColorObservable = new Rx.ReplaySubject(1);
        var urlParamsBackgroundColor;
        if (urlParams.hasOwnProperty('bg')) {
            try {
                var hex = decodeURIComponent(urlParams.bg);
                urlParamsBackgroundColor = new Color(hex);
                var configValueForColor = renderConfigValueForColor(urlParamsBackgroundColor);
                initialRenderState.get('options').clearColor = [configValueForColor];
                backgroundColorObservable.onNext(urlParamsBackgroundColor);
            } catch (e) {
                console.error('Invalid color from URL', e, urlParams.bg);
            }
        } else {
            var renderStateBackgroundColor = colorFromRenderConfigValue(initialRenderState.get('options').clearColor[0]);
            backgroundColorObservable.onNext(renderStateBackgroundColor);
        }
        return backgroundColorObservable;
    }
};
