'use strict';

var $ = window.$;


// [ string ] * [ DOM ]_1 -> ()
exports.error = function() {
    var args = Array.prototype.slice.call(arguments);
    var message = args.length === 1 ? args[0] : args.join(' ');

    if (typeof($) !== 'undefined') {
        var $icon = $('<i class="fa fa-exclamation-triangle"></i>');
        var $text = $('<span>').append(message);
        var $msg = $('<div>')
            .addClass('status-error')
            .append($icon, $text)
            .click(function() { $(this).slideUp(); });

        $('.load-spinner').hide();
        $('.status-bar')
            .append($msg)
            .css('visibility', 'visible');
    }
};


//FIXME return a completion event notification
exports.hideSpinnerShowBody = function () {
    $('.load-spinner').fadeOut(200, function () {
        $('.graphistry-body').css('display', 'none').css('visibility', 'visible').fadeIn(400);
        $(this).empty();
    });
};

/**
 * Convenience function callable from the browser console to enable/disable `debug()` output
 *
 * @function logging
 * @param {?boolean} [enable]   - True to print debug output, false to disable printing. If missing,
 *                                then the current state is toggled.
 * @param {boolean} [all=false] - Print debugging output from non-StreamGL modules.
 */
window.logging = function(enable, all) {
    enable = (typeof enable === 'undefined' || enable === null) ?
        !(localStorage.debug === '*' || localStorage.debug === 'StreamGL:*') : enable;
    all = !!(all); // If all is undefined/null, it's set to false
    var reloadDelay = 4;

    if(enable) {
        localStorage.debug = (all) ? '*' : 'StreamGL:*';
    } else {
        localStorage.removeItem('debug');
    }

    console.log('%c%s debugging%s. Reloading browser in %d seconds.',
        'font-size: 14pt; font-weight: bold; font-family: \'Helvetica Neue\', Helvetica, sans-serif; color: rgb(77, 159, 252);',
        (enable ? 'Enabled' : 'Disabled'),
        (enable ? (all ? ' all modules' : 'StreamGL modules') : ''),
        reloadDelay);

    window.setTimeout(function() { window.location.reload(); }, reloadDelay * 1000);

    return enable;
};


/**
 * Returns an Object representing each of the window URL's query paramters.
 * @example the url "index.html?foo=bar&baz" returns {"foo": "bar", "baz": true}
 */
exports.getQueryParams = function() {
    var query = window.location.search.substring(1);

    var spaces = /\+/g;
    var qParts = /([^&=]+)(=([^&]*))?/;

    return query.split('&').reduce(function(res, param) {
        if(param === '') { return res; }

        var parts = qParts.exec(param);
        var key = parts[1].replace(spaces, ' ');
        var value = (typeof parts[3] === 'undefined' ? '' : parts[3]).replace(spaces, ' ');

        res[key] = value;
        return res;
    }, {});
};
