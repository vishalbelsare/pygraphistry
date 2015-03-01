'use strict';

var $               = window.$;
var Rx              = require('rx');
                      require('./rx-jquery-stub');
var _               = require('underscore');
var jsColorPicker   = window.jsColorPicker;



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

    //node/edge color
    makeInspector($fg, '#000')
        .sample(10)
        .do(function (rgb) {
            socket.emit('set_colors', {rgb: rgb});
        })
        .subscribe(_.identity, function (err) { console.error('bad fg color', err, (err||{}).stack); });

    //canvas color
    makeInspector($bg, '#fff')
        .sample(10)
        .do(function (rgb) {
            $('#simulation').css('backgroundColor', 'rgb(' + [rgb.r, rgb.g, rgb.b].join(',') + ')');
        })
        .subscribe(_.identity, function (err) { console.error('bad bg color', err, (err||{}).stack); });

};