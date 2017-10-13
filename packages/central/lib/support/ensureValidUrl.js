import url from 'url';
import _ from 'underscore';

/**
 * Converts ad-hoc URL object(s) (i.e., one we constructed by hand, possibly incomplete or
 * invalid) into as complete a URL object as node's URL module can muster. This is done by
 * converting the ad-hoc URL to a formatted string, then re-parsing it into a URL object.
 *
 * @param {...Object} url - One or more URL-like objects. Multiple arguments will be combined into
 * a single URL object, with later arguments overwriting earlier ones.
 *
 * @returns {Object} A valid Node.js URL object.
 */
export function ensureValidUrl() {
    var args = [{}];
    for(var i in arguments) { args.push(arguments[i]); }

    var adHocUrl = _.extend.apply(_, args);

    return url.parse(url.format(adHocUrl), true, true);
}
