define(["jQuery", "Q"], function($, Q) {
    'use strict';

	function getSource(id) {
		var url = "shaders/" + id;

		return Q($.ajax(url, {dataType: "text"}));
	}


	// Extends target by adding the attributes of one or more other objects to it
	function extend(target, object1, objectN) {
		return $.extend.apply($, arguments);
	}


	return {
		"getSource": getSource,
		"extend": extend
	};
});