"use strict";

var util = require("util");
var chalk = require("chalk");

/** Returns a string with all args converted to a string using util.inspect, and formatting plain
strings with strFormatter */
function formattedInspect(args, strFormatter) {
	var res = "";

	for(var i = 0; i < args.length; i++) {
        res += " "
		var item = args[i];
		if(typeof item === "string") {
            res += typeof strFormatter === "function" ? strFormatter(item) : item;
		} else {
            res += util.inspect(item, {depth: 5, colors: true});
        }
	}

    return res.substr(1);
}

console._rawError = console.error;
console.error = function() {
    console._rawError(formattedInspect(arguments, chalk.bgRed));
};
console.debug = function() {
    console.warn(formattedInspect(arguments, chalk.blue));
};
