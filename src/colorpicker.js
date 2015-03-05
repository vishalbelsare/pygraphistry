'use strict';

var $               = window.$;
var Rx              = require('rx');
                      require('./rx-jquery-stub');
var _               = require('underscore');


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

module.exports = function ($fg, $bg, socket) {

    var foregroundColor = new Rx.ReplaySubject(1);
    foregroundColor.onNext({r: 0, g: 0, b: 0});
    makeInspector($fg, '#000')
        .sample(10)
        .do(function (rgb) {
            socket.emit('set_colors', {rgb: rgb});
        })
        .subscribe(foregroundColor, function (err) { console.error('bad fg color', err, (err||{}).stack); });

    var backgroundColor = new Rx.ReplaySubject(1);
    backgroundColor.onNext({r: 237, g: 248, b: 255, a: 255});
    makeInspector($bg, '#fff')
        .sample(10)
        .do(function (rgb) {
            $('#simulation').css('backgroundColor', 'rgb(' + [rgb.r, rgb.g, rgb.b, 255].join(',') + ')');
        })
        .subscribe(backgroundColor, function (err) { console.error('bad bg color', err, (err||{}).stack); });

    return {
        foregroundColor: foregroundColor,
        backgroundColor: backgroundColor
    };

};