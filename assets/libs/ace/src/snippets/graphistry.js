/* global ace */

ace.define('ace/snippets/graphistry',
    ['require','exports','module'],
    function(require, exports/*, module*/) {
        'use strict';

        /*jshint multistr: true */
        exports.snippetText = '# CAST\n\
snippet cast\n\
	CAST(${1:expression} AS ${2:data_type})\n\
# IN\n\
snippet in\n\
	IN (${1:first}, ${2:next})\n\
# BETWEEN\n\
snippet between\n\
	BETWEEN ${1:low} AND ${2:high}\n\
# STRING\n\
snippet string\n\
	STRING(${1:expression})\n\
# DATE\n\
snippet date\n\
	DATE(${1:string})\n\
# CONCAT\n\
snippet concat\n\
	CONCAT(${1:first}, ${2:next})\n\
# NUMBER\n\
snippet number\n\
	NUMBER(${1:expression)\n\
# INT\n\
snippet int\n\
	INT(${1:expression)\n\
# FIRST\n\
snippet first\n\
	FIRST(${1:body}, ${2:number_of_elements})\n\
# LAST\n\
snippet last\n\
	LAST(${1:body}, ${2:number_of_elements})\n\
# MID\n\
snippet mid\n\
	MID(${1:body}, ${2:start_index}, ${3:number_of_elements})\n\
# SUBSTRING\n\
snippet substring\n\
	SUBSTRING(${1:body}, ${2:start_index}, ${3:end_index})\n\
# CONTAINS\n\
snippet contains\n\
	CONTAINS(${1:body}, ${2:substring})\n\
# STARTSWITH\n\
snippet startswith\n\
	STARTSWITH(${1:body}, ${2:substring})\n\
# ENDSWITH\n\
snippet endswith\n\
	ENDSWITH(${1:body}, ${2:substring})\n\
# FIND\n\
snippet find\n\
	FIND(${1:body}, ${2:substring})\n\
# REPLACE\n\
snippet replace\n\
	REPLACE(${1:body}, ${2:substring}, ${3:replacement})\n\
# MAX\n\
snippet max\n\
	MAX(${1:first}, ${2:next})\n\
# MIN\n\
snippet min\n\
	MIN(${1:first}, ${2:next})\n\
# COALESCE\n\
snippet coalesce\n\
	COALESCE(${1:first}, ${2:next})\n\
';
        exports.scope = 'graphistry';

    });
