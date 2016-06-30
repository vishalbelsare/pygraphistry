'use strict';

var $               = window.$;
var _               = require('underscore');
var Rx              = require('@graphistry/rxjs');
                      require('../rx-jquery-stub');
const util            = require('./util.js');
const Command         = require('./command.js');

import template from './fork/template.handlebars';

function nameToLink (urlParams, name) {
    const overrides = {dataset: encodeURIComponent(name), play: 0};
    const params = _.extend({}, _.omit(urlParams, 'dataset', 'datasetname'), overrides);
    const paramStr = _.map(params, (v, k) => k + '=' + v).join('&');
    return window.location.origin + window.location.pathname + '?' + paramStr;
}


module.exports = function (socket, urlParams) {
    const $btn = $('#forkButton');

    Rx.Observable.fromEvent($btn, 'click')
        // show
        .map(() => {
            const uid = util.createAlphaNumericUID();
            const datasetParam = urlParams.dataset;
            const parts = datasetParam.split('/');
            const suffix = parts.slice(-parts.length - 1);
            let defaultName;
            if (parts.length === 2) {
                defaultName = suffix + '_' + uid;
            } else {
                defaultName = datasetParam.replace(/\.json$/, '_' + uid + '.json');
            }
            return $(template({defName: defaultName}));
        })
        .do(($modal) => {
            $('body').append($modal);
            $('.status', $modal).css('display', 'none');
            $modal.modal('show');
        })
        .flatMap(($modal) => Rx.Observable.fromEvent($('.modal-footer button', $modal), 'click')
            .map(_.constant($modal)))
        // notify server & wait
        .do(($modal) => {
            $('.status', $modal).css('display', 'inline');
            $('.modal-footer button', $modal).css('display', 'none');
        })
        .flatMap(($modal) => {
            const name = $('.modal-body input', $modal).val();
            const forkCommand = new Command('Fork VGraph', 'fork_vgraph', socket);
            return forkCommand.sendWithObservableResult(name)
                .map((reply) => ({reply: reply, $modal: $modal}));
        })
        // show
        .do((pair) => {
            const reply = pair.reply;
            if (!reply || !reply.success)  {
                throw new Error({msg: 'Server error on inspectHeader', v: (reply||{}).error});
            }
            const $modal = pair.$modal;
            const url = nameToLink(urlParams, reply.name);
            $('.modal-body', $modal)
                .empty()
                .append($('<span>').text('Static copy at: '))
                .append($('<a>')
                    .attr('target', '_blank')
                    .text(url)
                    .attr('href', url));
            $('.status', $modal).css('display', 'none');
        })
        .subscribe(_.identity,
            (err) => {
                console.error('err', err);
                try { $('.forker').remove(); } catch (ignore) { }
                util.makeErrorHandler('exn forking vgraph', err);
            });

};
