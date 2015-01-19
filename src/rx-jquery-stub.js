//rx-jquery clones, all in an effort to avoid including jquery

'use strict';

var $  = window.$;
var Rx = require('rx');

var proto = $.fn;

function observableCreateRefCount(subscribe) {
    return Rx.Observable.create(subscribe).publish().refCount();
}

var slice = Array.prototype.slice;

$.ajaxAsObservable = function(settings) {
    var subject = new Rx.AsyncSubject();

    var internalSettings = {
        success: function(data, textStatus, jqXHR) {
            subject.onNext({ data: data, textStatus: textStatus, jqXHR: jqXHR });
            subject.onCompleted();
        },
        error: function(jqXHR, textStatus, errorThrown) {
            subject.onError({ jqXHR: jqXHR, textStatus: textStatus, errorThrown: errorThrown });
        }
    };

    $.extend(true, internalSettings, settings);

    $.ajax(internalSettings);

    return subject;
};

proto.bindAsObservable = function(eventType, eventData) {
    var parent = this;
    return observableCreateRefCount(function(observer) {

      function handler(eventObject) {
        eventObject.additionalArguments = slice.call(arguments, 1);
        observer.onNext(eventObject);
      }

      parent.bind(eventType, eventData, handler);

      return function() {
        parent.unbind(eventType, eventData, handler);
      };
    });
};


proto.mousedownAsObservable = function(eventData) {
    return this.bindAsObservable('mousedown', eventData);
};
proto.mousemoveAsObservable = function(eventData) {
    return this.bindAsObservable('mousemove', eventData);
};
proto.mouseupAsObservable = function(eventData) {
    return this.bindAsObservable('mouseup', eventData);
};


proto.onAsObservable = function () {
        var parent = this, oargs = slice.call(arguments, 0), args;
        return observableCreateRefCount(function(observer) {
          function handler(eventObject) {
            eventObject.additionalArguments = slice.call(arguments, 1);
            observer.onNext(eventObject);
          }

          args = oargs.slice();
          args.push(handler);

          parent.on.apply(parent, args);

          return function() {
            parent.off.apply(parent, args);
          };
        });
    };

