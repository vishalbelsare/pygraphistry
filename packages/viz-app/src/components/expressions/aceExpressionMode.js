/* global ace */
import ace from 'brace';

ace.define(
  'ace/mode/graphistry_highlight_rules',
  ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text_highlight_rules'],
  function(acequire, exports /*, module*/) {
    'use strict';

    var oop = acequire('../lib/oop');
    var TextHighlightRules = acequire('./text_highlight_rules').TextHighlightRules;

    var GraphistryHighlightRules = function() {
      var operatorKeywords =
        'between|and|or|not|in|memberof|' +
        'is|isnull|notnull|defined|undefined|' +
        'like|ilike|regexp|similar|to|escape|' +
        'union|intersect';
      var controlKeywords = 'limit|' + 'case|when|if|then|else|end|type';

      var identifierRe = '[a-zA-Z\\$_\u00a1-\uffff][a-zA-Z:\\d\\$_\u00a1-\uffff]*\\b';

      var escapedRe =
        '\\\\(?:x[0-9a-fA-F]{2}|' + // hex
        'u[0-9a-fA-F]{4}|' + // unicode
        '[0-2][0-7]{0,2}|' + // oct
        '3[0-6][0-7]?|' + // oct
        '37[0-7]?|' + // oct
        '[4-7][0-7]?|' + //oct
        '.)';

      var builtinFunctions =
        'DATE|NOW|' +
        'STRING|SUBSTR|SUBSTRING|FIRST|LEFT|LAST|RIGHT|MID|FIND|' +
        'ISBLANK|ISEMPTY|STARTSWITH|ENDSWITH|CONTAINS|' +
        'CONCAT|SPLIT|LOWER|UPPER|LEN|LENGTH|' +
        'REPLACE|TRIM|LTRIM|RTRIM|' +
        'INT|NUMBER|' +
        'MAX|MIN|GREATEST|LEAST|COALESCE|NULLIF|' +
        'ABS|SIGN|TRUNC|FLOOR|CEIL|ROUND|' +
        'LOG|LN|LOG2|LOG10|EXP|POW|' +
        'SIN|COS|TAN|ASIN|ACOS|ATAN' /* +
                'COUNT|COUNTDISTINCT|COUNTD|MIN|MAX|AVG|SUM|STDDEV|MEDIAN|RANK'*/;

      var keywordMapper = this.createKeywordMapper(
        {
          'variable.language': 'now', // it?
          'keyword.control': controlKeywords,
          'keyword.operator': operatorKeywords,
          'constant.language.boolean': 'true|false',
          'constant.language': 'null|Infinity|NaN',
          'support.function': builtinFunctions,
          'support.type': 'string|integer|array|number|boolean|null|date|time|timestamp'
        },
        'identifier',
        true
      );

      this.$rules = {
        start: [
          {
            token: 'comment',
            regex: '--.*$'
          },
          {
            token: 'comment', // multi line comment
            regex: /\/\*/
          },
          {
            token: 'string',
            regex: "'(?=.)",
            next: 'qstring'
          },
          {
            token: 'string',
            regex: '"(?=.)',
            next: 'qqstring'
          },
          {
            token: 'constant.numeric', // hex
            regex: /0[xX][0-9a-fA-F]+\b/
          },
          {
            token: 'constant.numeric', // float
            regex: /[+-]?\d+(?:(?:\.\d*)?(?:[eE][+-]?\d+)?)?\b/
          },
          {
            token: keywordMapper,
            regex: identifierRe
          },
          {
            token: 'variable.other',
            regex: identifierRe
          },
          {
            token: 'paren.lbracket',
            regex: '[\\[](?=.)',
            next: 'quotedIdentifier'
          },
          {
            token: 'keyword.operator',
            regex: '\\+|\\-|\\/|\\/\\/|%|[*]|[*][*]|<@>|@>|<@|&|\\^|~|<|>|<=|=>|==|!=|<>|='
          },
          {
            token: 'paren.lparen',
            regex: /[\[({]/,
            next: 'start'
          },
          {
            token: 'paren.rparen',
            regex: /[\])}]/
          },
          {
            token: 'paren.lbracket',
            regex: '[\\[]',
            next: 'start'
          },
          {
            token: 'paren.rbracket',
            regex: '[\\]]'
          },
          {
            token: 'text',
            regex: '\\s+'
          }
        ],
        quotedIdentifier: [
          {
            token: 'constant.language.escape',
            regex: escapedRe
          },
          {
            token: 'variable.other',
            regex: '\\\\$',
            next: 'quotedIdentifier'
          },
          {
            token: 'variable.other',
            regex: ']|$',
            next: 'start'
          },
          {
            defaultToken: 'quotedIdentifier'
          }
        ],
        qqstring: [
          {
            token: 'constant.language.escape',
            regex: escapedRe
          },
          {
            token: 'string',
            regex: '\\\\$',
            next: 'qqstring'
          },
          {
            token: 'string',
            regex: '"|$',
            next: 'start'
          },
          {
            defaultToken: 'string'
          }
        ],
        qstring: [
          {
            token: 'constant.language.escape',
            regex: escapedRe
          },
          {
            token: 'string',
            regex: '\\\\$',
            next: 'qstring'
          },
          {
            token: 'string',
            regex: "'|$",
            next: 'start'
          },
          {
            defaultToken: 'string'
          }
        ]
      };
      this.normalizeRules();
    };

    oop.inherits(GraphistryHighlightRules, TextHighlightRules);

    exports.GraphistryHighlightRules = GraphistryHighlightRules;
  }
);

ace.define(
  'ace/mode/graphistry',
  [
    'require',
    'exports',
    'module',
    'ace/lib/oop',
    'ace/mode/text',
    'ace/mode/graphistry_highlight_rules',
    'ace/range'
  ],
  function(acequire, exports /*, module*/) {
    'use strict';

    var oop = acequire('../lib/oop');
    var TextMode = acequire('./text').Mode;
    var GraphistryHighlightRules = acequire('./graphistry_highlight_rules')
      .GraphistryHighlightRules;
    //var Range = acequire('../range').Range;

    var Mode = function() {
      this.HighlightRules = GraphistryHighlightRules;
    };
    oop.inherits(Mode, TextMode);

    (function() {
      this.lineCommentStart = '--';
      this.$id = 'ace/mode/graphistry';
    }.call(Mode.prototype));

    exports.Mode = Mode;
  }
);
