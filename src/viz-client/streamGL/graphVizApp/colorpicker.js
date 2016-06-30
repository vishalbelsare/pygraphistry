'use strict';

const $               = window.$;
const _               = require('underscore');
const Rx              = require('@graphistry/rxjs');
                      require('../rx-jquery-stub');
const util            = require('./util.js');
const Color           = require('color');


//$DOM * hex -> Observable hex
function makeInspector ($elt, hexColor) {

    const colors = new Rx.Subject();

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
            const color = new Color(rgb);
            colors.onNext(color);
        }
    });

    return colors;
}


function renderConfigValueForColor(colorValue) {
    return _.map(colorValue.rgbaArray(), (value, index) => {
        //255,255,255,1 -> 1,1,1,1
        return index === 3 ? value : (value/255);
    });
}


function colorFromRenderConfigValue(rgbaFractions) {
    return new Color()
        .rgb(rgbaFractions.slice(0,3).map((v) => v * 255))
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
            .subscribe((initForegroundColor) => {
                makeInspector($fg, initForegroundColor && initForegroundColor.hexString())
                    .auditTime(10)
                    .do((foregroundColor) => {
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
                        $('.colorSelector div', $fg).css('background-color', foregroundColor && foregroundColor.hexString());
                    })
                    .subscribe(foregroundColorObservable, util.makeErrorHandler('bad foreground color'));
            });

        backgroundColorObservable.first()
            .subscribe((initBackgroundColor) => {
                makeInspector($bg, initBackgroundColor && initBackgroundColor.hexString())
                    .auditTime(10)
                    .do((backgroundColor) => {
                        // Set the background color directly/locally via CSS:
                        $('#simulation').css('backgroundColor', backgroundColor.rgbaString());
                        // Update the server render config:
                        const newValue = renderConfigValueForColor(backgroundColor);
                        socket.emit('update_render_config', {'options': {'clearColor': [newValue]}}, _.identity);
                        // Update the color picker swatch affordance:
                        $('.colorSelector div', $bg).css(
                            'background-color', backgroundColor && backgroundColor.hexString()
                        );
                    })
                    .subscribe(backgroundColorObservable, util.makeErrorHandler('bad background color'));
            });
    },

    makeInspector: makeInspector,

    colorFromRenderConfigValue: colorFromRenderConfigValue,

    renderConfigValueForColor: renderConfigValueForColor,

    foregroundColorObservable: function () {
        const foregroundColorObservable = new Rx.ReplaySubject(1);
        foregroundColorObservable.onNext(undefined);
        return foregroundColorObservable;
    },

    backgroundColorObservable: function (initialRenderState, urlParams) {
        const backgroundColorObservable = new Rx.ReplaySubject(1);
        let urlParamsBackgroundColor;
        if (urlParams.hasOwnProperty('bg')) {
            try {
                const hex = decodeURIComponent(urlParams.bg);
                urlParamsBackgroundColor = new Color(hex);
                const configValueForColor = renderConfigValueForColor(urlParamsBackgroundColor);
                initialRenderState.get('options').clearColor = [configValueForColor];
                backgroundColorObservable.onNext(urlParamsBackgroundColor);
            } catch (e) {
                console.error('Invalid color from URL', e, urlParams.bg);
            }
        } else {
            const configValueForColor = initialRenderState.get('options').clearColor[0];
            const renderStateBackgroundColor = colorFromRenderConfigValue(configValueForColor);
            backgroundColorObservable.onNext(renderStateBackgroundColor);
        }
        return backgroundColorObservable;
    }
};
