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

  function buildLogicalExpression(first, rest) {
    return buildTree(first, rest, function(result, element) {
      return {
        type:     "LogicalExpression",
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

TypeIdentifier "type" =
  ( name )+
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
       / ( PrefixOperator Expression )
       / call_function
       / ( __ lparen Expression __ rparen )
       / ( CAST lparen Expression AS type_name rparen )
       // TODO: NOT-EXISTS:
       // / ( ( NOT ? EXISTS )? lparen select_stmt rparen )
       / ( CASE Expression ? ( WHEN Expression THEN Expression )+ ( ELSE Expression )? END )
       // TODO: RAISE
       // / raise_function
       ) )
  { return v[1] }

NOTExpression
  = NOT __ RelationalExpression
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

Expression
  = LimitExpression
  / ORExpression


call_function =
  ( function_name
    __ lparen
               ( ( DISTINCT ? ( Expression (__ comma Expression)* )+ )
               / __ star )?
    __ rparen )

LiteralValue "literal" =
  ( NumericLiteral / StringLiteral / BlobLiteral
  / NULL / CURRENT_TIME / CURRENT_DATE / CURRENT_TIMESTAMP )

Elision
  = comma commas:(__ comma)* { return filledArray(commas.length + 1, null); }

ElementList
  = first:(
      elision:(Elision __)? element:PrimaryExpression {
        return optionalList(extractOptional(elision, 0)).concat(element);
      }
    )
    rest:(
      __ comma __ elision:(Elision __)? element:PrimaryExpression {
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
  = callee:Identifier __ lparen __ elements:ElementList __ rparen
  {
    return {
      type: 'FunctionCall',
      callee: callee,
      elements: elements
    }
  }

PrimaryExpression
  = Identifier
  / LiteralValue
  / ListLiteral
  / lparen __ expression:Expression __ rparen { return expression; }

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
  = DecimalIntegerLiteral "." DecimalDigit* ExponentPart? {
      return { type: "Literal", value: parseFloat(text()) };
    }
  / "." DecimalDigit+ ExponentPart? {
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
  / [0-9]

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
  = minusminus (!LineTerminator SourceCharacter)*

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
CommentBegin = '/*'
CommentEnd = '*/'
AnythingExceptCommentEnd = .* & '*/'
nil = ''

Keyword
  = AND
  / AS
  / BEGIN
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

NullLiteral
  = NULL { return { type: "Literal", value: null }; }

BooleanLiteral
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

IsExpression
  = first:ShiftExpression __ IS __ comparedvalue:Expression
  / first:ShiftExpression __ rest:ISNULL
  / first:ShiftExpression __ rest:NOTNULL
  { return buildBinaryExpression(first, rest); }

InExpression
  = first:IsExpression __ IN __ container:Expression
  / first:PrimaryExpression __ NOT ? __ IN __ lparen ( ( PrimaryExpression comma __ )+ )? __ rparen
  { return buildLogicalExpression(first, [container]); }

BetweenAndExpression
  = value:InExpression __ NOT ? BETWEEN __ low:InExpression __ AND __ high:InExpression
    {
      // TODO: use negated
      return {
          type: 'BetweenAndExpression',
          value: value,
          start: low,
          stop:  high
      };
    }
  / InExpression

LikeExpression
  = first:BetweenAndExpression
    rest:(__ NOT ? LIKE __ ShiftExpression)
    { return buildBinaryExpression(first, rest); }

RelationalOperator "relational operator"
  = lte
  / gte
  / $(lessthan !lessthan)
  / $(greaterthan !greaterthan)
  / IN

RelationalExpression
  = first:ShiftExpression
    rest:(__ RelationalOperator __ ShiftExpression)*
    { return buildBinaryExpression(first, rest); }

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

PostfixOperator "postfix operator"
  = ISNULL
  / NOTNULL

PostfixExpression
  = argument:PrimaryExpression __ operator:PostfixOperator {
      return {
        type: 'UnaryExpression',
        operator: operator,
        argument: argument,
        fixity: 'postfix'
      }
    }
  / PrimaryExpression

PrefixOperator "prefix operator"
  = minus
  / plus
  / not_op
  / NOT

UnaryExpression
  = PostfixExpression
  / operator:PrefixOperator __ argument:UnaryExpression {
    return {
      type: 'UnaryExpression',
      operator: operator,
      argument: argument,
      fixity: 'prefix'
    }
  }
  

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

name =
  str:[A-Za-z0-9_]+
  { return str.join('') }
// TODO: improve this to extract point/edge etc.
graph_scoped_name =
  str:[A-Za-z0-9_:]+
  { return str.join('') }

database_name = name
table_name = name
table_alias = name
table_or_index_name = name
new_table_name = name
index_name = name
graph_namespace = name
column_name = graph_scoped_name
graph_column_name =
  gcn: ( ( c: ( graph_namespace colon column_name )
           { return { column: c[2], graph_namespace: c[1] } } )
         / ( c: column_name
           { return { column: c } } ) )
  { return gcn[1] }

column_alias = name
foreign_table = name
savepoint_name = name
collation_name = name
trigger_name = name
view_name = name
module_name = name
module_argument = name
bind_parameter =
  '?' name
function_name = name
pragma_name = name

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
