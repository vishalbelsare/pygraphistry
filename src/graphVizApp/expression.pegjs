{
  //var unroll = options.util.makeUnroll(line, column, offset, SyntaxError)
  //var ast    = options.util.makeAST(line, column, offset, options)

  // Header/utility functions for grammar match bodies.
  //

  function extractOptional(optional, index) {
    return optional ? optional[index] : null;
  }

  function extractList(list, index) {
    var result = new Array(list.length), i;

    for (i = 0; i < list.length; i++) {
      result[i] = list[i][index];
    }

    return result;
  }

  function buildList(first, rest, index) {
    return [first].concat(extractList(rest, index));
  }

  function buildTree(first, rest, builder) {
    var result = first, i;

    for (i = 0; i < rest.length; i++) {
      result = builder(result, rest[i]);
    }

    return result;
  }

  function buildBinaryExpression(first, rest) {
    return buildTree(first, rest, function(result, element) {
      return {
        type:     "BinaryExpression",
        operator: element[1],
        left:     result,
        right:    element[3]
      };
    });
  }

  function optionalList(value) {
    return value !== null ? value : [];
  }
}

start = Expression

TypeIdentifier "type"
  = ( Identifier )+
    ( ( lparen SignedInteger rparen )
      / ( lparen SignedInteger comma SignedInteger rparen ) )?

CastExpression "cast"
  = CAST __ lparen __ value:Expression __ AS __ type_name:TypeIdentifier __ rparen
  {
    return {
      type: 'CastExpression',
      value: value,
      type_name: type_name
    };
  }

value =
  v: ( __
       ( ( x: LiteralValue
           { return { literal: x } } )
       / ( b: bind_parameter
           { return { bind: b } } )
       / ( t: ( table_name dot column_name )
           { return { column: t[2], table: t[1] } } )
       / ( c: column_name
           { return { column: c } } )
       // TODO: NOT-EXISTS:
       // / ( ( NOT ? EXISTS )? lparen select_stmt rparen )
       / ( CASE Expression ? ( WHEN Expression THEN Expression )+ ( ELSE Expression )? END )
       ) )
  { return v[1] }

NOTExpression
  = operator:NOT __ argument:NOTExpression {
      return {
        type: 'UnaryExpression',
        operator: operator,
        argument: argument,
        fixity: 'prefix'
      };
    }
  / RelationalExpression

ANDExpression
  = first:NOTExpression
    rest:(__ AND __ NOTExpression)*
    { return buildBinaryExpression(first, rest); }

ORExpression
  = first:ANDExpression
    rest:(__ OR __ ANDExpression)*
    { return buildBinaryExpression(first, rest); }

LimitExpression
  = LIMIT __ limit:NumericLiteral
    { return { type: 'Limit', value: limit } }

ConditionExpression
  = ORExpression

Expression
  = LimitExpression
  / ConditionExpression

TimePseudoLiteral "now"
  = CURRENT_TIME / CURRENT_DATE / CURRENT_TIMESTAMP

LiteralValue "literal"
  = NumericLiteral
  / StringLiteral
  / BlobLiteral
  / NullLiteral
  / BooleanLiteral
  / TimePseudoLiteral

Elision
  = comma commas:(__ comma)* { return filledArray(commas.length + 1, null); }

ElementList
  = first:(
      elision:(Elision __)? element:ConditionExpression {
        return optionalList(extractOptional(elision, 0)).concat(element);
      }
    )
    rest:(
      __ comma __ elision:(Elision __)? element:ConditionExpression {
        return optionalList(extractOptional(elision, 0)).concat(element);
      }
    )*
    { return Array.prototype.concat.apply(first, rest); }

ListLiteral
  = lparen __ elision:(Elision __)? rparen {
      return {
        type: 'ListExpression',
        elements: optionalList(extractOptional(elision, 0))
      }
    }
  / lparen __ elements:ElementList __ rparen {
      return {
        type: 'ListExpression',
        elements: elements
      }
    }
  / lparen __ elements:ElementList __ comma __ elision:(Elision __)? rparen {
      return {
        type: 'ListExpression',
        elements: elements.concat(optionalList(extractOptional(elision, 0)))
      }
    }

FunctionCallExpression "function call"
  = callee:FunctionName __ lparen elements:ElementList rparen
  {
    return {
      type: 'FunctionCall',
      callee: callee,
      arguments: elements
    }
  }

PrimaryExpression
  = FunctionCallExpression
  / Identifier
  / LiteralValue
  / lparen __ expression:Expression __ rparen { return expression; }
  / ListLiteral

DecimalDigit
  = [0-9]

NonZeroDigit
  = [1-9]

DecimalIntegerLiteral
  = "0"
  / NonZeroDigit DecimalDigit*

ExponentIndicator
  = "e"i

SignedInteger
  = [+-]? DecimalDigit+

ExponentPart
  = ExponentIndicator SignedInteger

DecimalLiteral
  = DecimalIntegerLiteral dot DecimalDigit* ExponentPart? {
      return { type: "Literal", value: parseFloat(text()) };
    }
  / dot DecimalDigit+ ExponentPart? {
      return { type: "Literal", value: parseFloat(text()) };
    }
  / DecimalIntegerLiteral ExponentPart? {
      return { type: "Literal", value: parseFloat(text()) };
    }

HexDigit
  = [0-9a-f]i

HexIntegerLiteral
  = "0x"i digits:$HexDigit+ {
      return { type: "Literal", value: parseInt(digits, 16) };
     }

SourceCharacter
  = .

IdentifierStart
  = [A-Za-z_]

IdentifierPart
  = IdentifierStart
  / colon
  / DecimalDigit

IdentifierName "identifier"
  = first:IdentifierStart rest:IdentifierPart* {
      return {
        type: "Identifier",
        name: first + rest.join("")
      };
    }

Identifier
  = !ReservedWord name:IdentifierName { return name; }

NumericLiteral "number"
  = literal:HexIntegerLiteral !(IdentifierStart / DecimalDigit) {
      return literal;
    }
  / literal:DecimalLiteral !(IdentifierStart / DecimalDigit) {
      return literal;
    }

StringLiteral "string"
  = '"' chars:DoubleStringCharacter* '"' {
      return { type: "Literal", value: chars.join("") };
    }
  / "'" chars:SingleStringCharacter* "'" {
      return { type: "Literal", value: chars.join("") };
    }

EscapedEscapeCharacter = "\\"

DoubleStringCharacter
  = !('"' / EscapedEscapeCharacter / LineTerminator) SourceCharacter { return text(); }
  / "\\" sequence:EscapeSequence { return sequence; }
  / LineContinuation

SingleStringCharacter
  = !("'" / EscapedEscapeCharacter / LineTerminator) SourceCharacter { return text(); }
  / EscapedEscapeCharacter sequence:EscapeSequence { return sequence; }
  / LineContinuation

LineContinuation
  = EscapedEscapeCharacter LineTerminatorSequence { return ""; }

EscapeSequence
  = CharacterEscapeSequence
  / "0" !DecimalDigit { return "\0"; }
  / HexEscapeSequence
  / UnicodeEscapeSequence

CharacterEscapeSequence
  = SingleEscapeCharacter
  / NonEscapeCharacter

SingleEscapeCharacter
  = "'"
  / '"'
  / EscapedEscapeCharacter
  / "b"  { return "\b";   }
  / "f"  { return "\f";   }
  / "n"  { return "\n";   }
  / "r"  { return "\r";   }
  / "t"  { return "\t";   }
  / "v"  { return "\x0B"; }   // IE does not recognize "\v".

NonEscapeCharacter
  = !(EscapeCharacter / LineTerminator) SourceCharacter { return text(); }

EscapeCharacter
  = SingleEscapeCharacter
  / DecimalDigit
  / "x"
  / "u"

HexEscapeSequence
  = "x" digits:$(HexDigit HexDigit) {
      return String.fromCharCode(parseInt(digits, 16));
    }

UnicodeEscapeSequence
  = "u" digits:$(HexDigit HexDigit HexDigit HexDigit) {
      return String.fromCharCode(parseInt(digits, 16));
    }

Comment "comment"
  = MultiLineComment
  / SingleLineComment

SingleLineComment
  = SingleLineCommentBegin (!LineTerminator SourceCharacter)*

MultiLineComment
  = CommentBegin (!CommentEnd SourceCharacter)* CommentEnd

MultiLineCommentNoLineTerminator
  = CommentBegin (!(CommentEnd / LineTerminator) SourceCharacter)* CommentEnd

dot = '.'
comma = ','
colon = ':'
semicolon = ';'
minusminus = '--'
minus = '-'
plus = '+'
times = '*'
divide = '/'
modulo = '%'
not_op = '~'
lparen = '('
rparen = ')'
concat = '||'
lessthan = '<'
greaterthan = '>'
lte = '<='
gte = '>='
equals = '='
doubleequals = '=='
notequals = '!='
gtlt = '<>'
star = '*'
newline = '\n'
AnythingExceptNewline = [^\n]*
SingleLineCommentBegin = '//' / minusminus
CommentBegin = '/*'
CommentEnd = '*/'
AnythingExceptCommentEnd = .* & '*/'
nil = ''

Keyword
  = AND
  / AS
  / BEGIN
  / BETWEEN
  / CASE
  / CAST
  / ELSE
  / END
  / ESCAPE
  / EXISTS
  / FROM
  / IF
  / IN
  / IS
  / ISNULL
  / LIKE
  / NOT
  / NOTNULL
  / OR
  / THEN
  / TO
  / WHEN
  / WHERE

NullLiteral "null"
  = NULL { return { type: "Literal", value: null }; }

BooleanLiteral "boolean"
  = TRUE  { return { type: "Literal", value: true  }; }
  / FALSE { return { type: "Literal", value: false }; }

ReservedWord "reserved word"
  = Keyword
  / NullLiteral
  / BooleanLiteral

AdditiveOperator
  = plus
  / minus

AdditiveExpression
  = first:MultiplicativeExpression
    rest:(__ AdditiveOperator __ MultiplicativeExpression)*
    { return buildBinaryExpression(first, rest); }

ShiftOperator "shift operator"
  = '<<'
  / '>>'

ShiftExpression
  = first:AdditiveExpression
    rest:(__ ShiftOperator __ AdditiveExpression)*
    { return buildBinaryExpression(first, rest); }

RelationalOperator "comparison"
  = lte
  / gte
  / $(lessthan !lessthan)
  / $(greaterthan !greaterthan)

RelationalExpression
  = first:ShiftExpression
    rest:(__ RelationalOperator __ ShiftExpression)*
    { return buildBinaryExpression(first, rest); }
  / LikeExpression

EqualityExpression
  = first:RelationalExpression
    rest:(__ EqualityOperator __ RelationalExpression)*
    { return buildBinaryExpression(first, rest); }

EqualityOperator "equality operator"
  = "==="
  / "!=="
  / "=="
  / "!="
  / "<>"

WhiteSpace "whitespace"
  = "\t"
  / "\v"
  / "\f"
  / " "
  / "\u00A0"
  / "\uFEFF"

LineTerminator "line terminator"
  = [\n\r\u2028\u2029]

LineTerminatorSequence "end of line"
  = "\n"
  / "\r\n"
  / "\r"
  / "\u2028"
  / "\u2029"

__
  = (WhiteSpace / LineTerminatorSequence / Comment)*

_
  = (WhiteSpace / MultiLineCommentNoLineTerminator)*

PostfixKeyword "postfix keyword"
  = ISNULL
  / NOTNULL

PostfixExpression
  = argument:PrimaryExpression __ operator:PostfixKeyword {
      return {
        type: 'UnaryExpression',
        operator: operator,
        argument: argument,
        fixity: 'postfix'
      }
    }

IsExpression
  = left:PrimaryExpression __ operator:IS __ right:UnaryExpression {
      return {
        type: 'LogicalExpression',
        operator: operator,
        left: left,
        right: right
      };
    }

InExpression
  = left:PrimaryExpression __ operator:IN __ right:Expression
    { return {
         type: 'LogicalExpression',
         operator: operator,
         left: left,
         right: right
      };
    }
  / left:PrimaryExpression __ operator:IN __ lparen ( ( PrimaryExpression comma __ )+ )? __ rparen
    { return buildBinaryExpression(first, rest); }

BetweenAndExpression
  = value:PrimaryExpression __ BETWEEN __ low:PrimaryExpression __ AND __ high:PrimaryExpression
    {
      // TODO: use negated
      return {
          type: 'BetweenAndExpression',
          value: value,
          start: low,
          stop:  high
      };
    }

LikeOperator "text comparison"
  = LIKE / ILIKE

LikeExpression "text comparison"
  = value:PrimaryExpression
    __ operator:LikeOperator __ like:PrimaryExpression
    { return {
        type: 'LikeExpression',
        operator: operator,
        left: value,
        right: like
      };
    }

RegexOperator
  = REGEXP / SIMILAR __ TO

RegexExpression "regex expression"
  = value:PrimaryExpression
    __ operator:RegexOperator __ matcher:PrimaryExpression
    {
      return {
        type: 'RegexExpression',
        operator: operator,
        left: value,
        right: matcher
      };
    }

NOTKeywordExpression "not"
  = operator:NOT __ argument:KeywordExpression {
      return {
        type: 'NotExpression',
        operator: operator,
        value: argument
      }
    }

KeywordExpression
  = NOTKeywordExpression
  / LikeExpression
  / RegexExpression
  / BetweenAndExpression
  / InExpression
  / PostfixExpression
  / IsExpression
  / PrimaryExpression

PrefixOperator "prefix operator"
  = minus
  / plus
  / not_op

UnaryExpression
  = operator:PrefixOperator __ argument:KeywordExpression {
    return {
      type: 'UnaryExpression',
      operator: operator,
      argument: argument,
      fixity: 'prefix'
    }
  }
  / KeywordExpression

MultiplicativeExpression
  = first:UnaryExpression
    rest:(__ MultiplicativeOperator __ UnaryExpression)*
    { return buildBinaryExpression(first, rest); }

MultiplicativeOperator "multiplicative operator"
  = times
  / divide
  / modulo

binary_operator =
  x: ( __
       (concat
        / times / divide / modulo
        / plus / minus
        / '<<' / '>>' / '&' / '|'
        / '<=' / '>='
        / '<' / '>'
        / '=' / '==' / '!=' / '<>'
        / 'IS'i / 'IS NOT'i / 'IN'i / 'LIKE'i / 'GLOB'i / 'MATCH'i / 'REGEXP'i
        / 'AND'i
        / 'OR'i ) )
  { return x[1] }

conjunction =
  x: ( __
       ('IS'i / 'IS NOT'i / 'IN'i / 'LIKE'i / 'GLOB'i / 'MATCH'i / 'REGEXP'i
        / 'AND'i
        / 'OR'i ) )
  { return x[1] }

// TODO: improve this to extract point/edge etc.
graph_scoped_name =
  str:[A-Za-z0-9_:]+
  { return str.join('') }

database_name = Identifier
table_name = Identifier
table_alias = Identifier
table_or_index_name = Identifier
new_table_name = Identifier
index_name = Identifier
graph_namespace = Identifier
column_name = graph_scoped_name
graph_column_name =
  gcn: ( ( c: ( graph_namespace colon column_name )
           { return { column: c[2], graph_namespace: c[1] } } )
         / ( c: column_name
           { return { column: c } } ) )
  { return gcn[1] }

column_alias = Identifier
foreign_table = Identifier
savepoint_name = Identifier
collation_name = Identifier
trigger_name = Identifier
view_name = Identifier
module_name = Identifier
module_argument = Identifier
bind_parameter =
  '?' Identifier
FunctionName = Identifier
pragma_name = Identifier

CURRENT_TIME = 'now'
CURRENT_DATE = 'now'
CURRENT_TIMESTAMP = 'now'

BlobLiteral = StringLiteral

ABORT = "ABORT"i
ACTION = "ACTION"i
ADD = "ADD"i
AFTER = "AFTER"i
ALL = "ALL"i
ALTER = "ALTER"i
ANALYZE = "ANALYZE"i
AND = "AND"i
AS = "AS"i
ASC = "ASC"i
ATTACH = "ATTACH"i
AUTOINCREMENT = "AUTOINCREMENT"i
BEFORE = "BEFORE"i
BEGIN = "BEGIN"i
BETWEEN = "BETWEEN"i
BY = "BY"i
CASCADE = "CASCADE"i
CASE = "CASE"i
CAST = "CAST"i
CHECK = "CHECK"i
COLLATE = "COLLATE"i
COLUMN = "COLUMN"i
COMMIT = "COMMIT"i
CONFLICT = "CONFLICT"i
CONSTRAINT = "CONSTRAINT"i
CREATE =
  __ "CREATE"i
CROSS = "CROSS"i
DATABASE = "DATABASE"i
DEFAULT = "DEFAULT"i
DEFERRABLE = "DEFERRABLE"i
DEFERRED = "DEFERRED"i
DELETE =
  __ "DELETE"i
DESC = "DESC"i
DETACH = "DETACH"i
DISTINCT = "DISTINCT"i
DROP = "DROP"i
E =
  "E"i
EACH = "EACH"i
ELSE = "ELSE"i
END = "END"i
ESCAPE = "ESCAPE"i
EXCEPT = "EXCEPT"i
EXCLUSIVE = "EXCLUSIVE"i
EXISTS = "EXISTS"i
EXPLAIN =
  __ "EXPLAIN"i
FAIL = "FAIL"i
FALSE = "FALSE"i
FOR = "FOR"i
FOREIGN = "FOREIGN"i
FROM = "FROM"i
GLOB = "GLOB"i
GROUP = "GROUP"i
HAVING = "HAVING"i
IF = "IF"i
IGNORE = "IGNORE"i
ILIKE = "ILIKE"i
IMMEDIATE = "IMMEDIATE"i
IN = "IN"i
INDEX = "INDEX"i
INDEXED = "INDEXED"i
INITIALLY = "INITIALLY"i
INNER = "INNER"i
INSERT =
  __ "INSERT"i
INSTEAD = "INSTEAD"i
INTERSECT = "INTERSECT"i
INTO = "INTO"i
IS = "IS"i
ISNULL = "ISNULL"i
JOIN = "JOIN"i
KEY = "KEY"i
LEFT = "LEFT"i
LIKE = "LIKE"i
LIMIT = "LIMIT"i
MATCH = "MATCH"i
NATURAL = "NATURAL"i
NO = "NO"i
NOT = "NOT"i
NOTNULL = "NOTNULL"i
NULL = "NULL"i
OF = "OF"i
OFFSET = "OFFSET"i
ON = "ON"i
OR = "OR"i
ORDER = "ORDER"i
OUTER = "OUTER"i
PLAN = "PLAN"i
PRAGMA = "PRAGMA"i
PRIMARY = "PRIMARY"i
QUERY = "QUERY"i
RAISE = "RAISE"i
REFERENCES = "REFERENCES"i
REGEXP = "REGEXP"i
REINDEX = "REINDEX"i
RELEASE = "RELEASE"i
RENAME = "RENAME"i
REPLACE =
  __ "REPLACE"i
RESTRICT = "RESTRICT"i
ROLLBACK = "ROLLBACK"i
ROW = "ROW"i
SAVEPOINT = "SAVEPOINT"i
SELECT =
  __ "SELECT"i
SET = "SET"i
SIMILAR = "SIMILAR"i
TABLE = "TABLE"i
TEMP = "TEMP"i
TEMPORARY = "TEMPORARY"i
THEN = "THEN"i
TO = "TO"i
TRANSACTION = "TRANSACTION"i
TRIGGER = "TRIGGER"i
TRUE = "TRUE"i
UNION = "UNION"i
UNIQUE = "UNIQUE"i
UPDATE =
  __ "UPDATE"i
USING = "USING"i
VACUUM = "VACUUM"i
VALUES = "VALUES"i
VIEW = "VIEW"i
VIRTUAL = "VIRTUAL"i
WHEN = "WHEN"i
WHERE = "WHERE"i
