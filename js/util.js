define(["jQuery", "Q"], function($, Q) {
	function getSource(id) {
		var url = "shaders/" + id;

		return Q($.ajax(url, {dataType: "text"}));
	}


	return {
		"getSource": getSource
	};
});