{
  //var unroll = options.util.makeUnroll(line, column, offset, SyntaxError)
  //var ast    = options.util.makeAST(line, column, offset, options)

  // Header/utility functions for grammar match bodies.
  //

  function joinWords() {
    var words;
    if (arguments.length === 1) {
      if (typeof arguments[0] === 'string') {
        return arguments[0];
      } else {
        words = arguments[0];
      }
    } else {
      words = Array.prototype.slice.call(arguments);
    }
    if (words.length === 1 && typeof words[0] === 'string') {
      return words[0];
    }
    return words.join('');
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

  function buildBinaryPredicate(first, rest) {
    return buildTree(first, rest, function(result, element) {
      return {
        type:     "BinaryPredicate",
        operator: element[1],
        left:     result,
        right:    element[3]
      };
    });
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

start = Term

TypeName "type name"
  = STRING
  / BOOLEAN
  / NULL
  / INTEGER
  / NUMBER
  / ARRAY
  / DATE
  / TIME
  / TIMESTAMP

TypeIdentifier "type"
  = ( TypeName )+
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

CASEListExpression "cases"
  = first:(
      WHEN __ condition:Expression __ THEN __ result:Expression {
        return {
          type: 'CaseBranch',
          condition: condition,
          result: result
        };
      }
    )
    rest:(
      __ WHEN __ condition:Expression __ THEN __ result:Expression {
        return {
          type: 'CaseBranch',
          condition: condition,
          result: result
        };
      }
    )*
    { return [first].concat(rest); }

CASEExpression "case"
  = CASE __ value:Expression
    __ cases:CASEListExpression __ END
    {
      return {
        type: 'CaseExpression',
        value: value,
        cases: cases,
        elseClause: undefined
      };
    }
  / CASE __ cases:CASEListExpression __ END
    {
      return {
        type: 'CaseExpression',
        value: undefined,
        cases: cases,
        elseClause: undefined
      };
    }
  / CASE __ value:Expression
    __ cases:CASEListExpression
    __ ELSE __ elseClause:Expression __ END
    {
      return {
        type: 'CaseExpression',
        value: value,
        cases: cases,
        elseClause: elseClause
      };
    }
  / CASE __ cases:CASEListExpression
    __ ELSE __ elseClause:Expression __ END
    {
      return {
        type: 'CaseExpression',
        value: undefined,
        cases: cases,
        elseClause: elseClause
      };
    }

ConditionalBranchExpression
  = first:(
    IF __ condition:Expression __ THEN __ result:Expression {
      return {
        type: 'CaseBranch',
        condition: condition,
        result: result
      };
    }
  )
  rest:(
    __ ELSE __ IF __ condition:Expression __ THEN __ result:Expression {
      return {
        type: 'CaseBranch',
        condition: condition,
        result: result
      };
    }
  )*
  { return [first].concat(rest); }

ConditionalExpression "conditional"
  = cases:ConditionalBranchExpression __ END
    {
      return {
        type: 'ConditionalExpression',
        cases: cases,
        elseClause: undefined
      };
    }
  / cases:ConditionalBranchExpression
    __ ELSE __ elseClause:Expression __ END
    {
      return {
        type: 'ConditionalExpression',
        cases: cases,
        elseClause: elseClause
      };
    }

NOTPredicate "not"
  = operator:NOT __ argument:NOTPredicate {
      return {
        type: 'NotExpression',
        operator: operator,
        value: argument
      };
    }
  / KeywordPredicate

ANDPredicate
  = first:NOTPredicate
    rest:(__ AND __ NOTPredicate)*
    { return buildBinaryPredicate(first, rest); }

ORPredicate
  = first:ANDPredicate
    rest:(__ OR __ ANDPredicate)*
    { return buildBinaryPredicate(first, rest); }

LimitClause "limit"
  = LIMIT __ limit:ArithmeticExpression
    { return { type: 'LimitExpression', value: limit } }

MemberOfOperator =
  IN / MEMBEROF

MemberOfSetPredicate "in set"
  = operator:MemberOfOperator !IdentifierPart __ value:ArithmeticExpression {
    return {
      type: 'MemberOfExpression',
      operator: operator,
      value: value
    };
  }

KeywordPredicate
  = LikePredicate
  / MemberOfSetPredicate
  / RegexPredicate
  / BetweenPredicate
  / InPredicate
  / PostfixExpression
  / IsPredicate
  / EqualityPredicate

Expression
  = CASEExpression
  / ConditionalExpression
  / ORPredicate

// Syntactically, predicates and expressions are mixable.

Predicate "predicate"
  = Expression

Term
  = LimitClause
  / Predicate

TimePseudoLiteral "now"
  = CURRENT_TIME / CURRENT_DATE / CURRENT_TIMESTAMP

LiteralValue "literal"
  = NumericLiteral
  / NumericConstant
  / StringLiteral
  / BlobLiteral
  / NullLiteral
  / BooleanLiteral
  / TimePseudoLiteral

ElementList "elements"
  = first:(
      element:Expression {
        return optionalList(element);
      }
    )
    rest:(
      __ comma __ element:Expression {
        return optionalList(element);
      }
    )*
    { return Array.prototype.concat.apply(first, rest); }

ListLiteral "list"
  = lparen __ rparen {
      return {
        type: 'ListExpression',
        elements: []
      }
    }
  / lparen __ elements:ElementList __ rparen {
      return {
        type: 'ListExpression',
        elements: elements
      }
    }
  / lparen __ elements:ElementList __ comma __ rparen {
      return {
        type: 'ListExpression',
        elements: elements
      }
    }

FunctionIdentifier
  = !ReservedWord name:IdentifierName { return { type: 'FunctionIdentifier', name: name.name }; }

FunctionInvocation "function call"
  = callee:FunctionIdentifier __ lparen __ rparen
  {
    return {
      type: 'FunctionCall',
      callee: callee,
      arguments: []
    };
  }
  / callee:FunctionIdentifier __ lparen __ elements:ElementList __ rparen
  {
    return {
      type: 'FunctionCall',
      callee: callee,
      arguments: elements
    };
  }

AggregateInvocation "aggregate invocations"
  = callee:FunctionIdentifier __ OF __ argument:ArithmeticExpression __ PER __ partition:ArithmeticExpression
  {
    return {
      type: 'AggregateInvocation',
      callee: callee,
      partition: partition,
      argument: argument
    };
  }
  / callee:FunctionIdentifier __ OF __ argument:ArithmeticExpression
  {
    return {
      type: 'AggregateInvocation',
      callee: callee,
      partition: undefined,
      argument: argument
    };
  }

TimeTypeName "time type name"
  = DATE
  / TIME
  / TIMESTAMP

TimeExpression "time"
  = typeName:TimeTypeName __ expression:ArithmeticExpression
  {
    return {
      type: 'FunctionCall',
      callee: callee,
      arguments: [expression]
    };
  }

DecimalDigit
  = [0-9]

NonZeroDigit
  = [1-9]

DecimalIntegerLiteral
  = "0" {
    return { type: "Literal", dataType: 'integer', value: 0 };
  }
  / NonZeroDigit DecimalDigit* {
    return { type: "Literal", dataType: 'integer', value: parseInt(text()) };
  }

ExponentIndicator
  = "e"i

SignedInteger
  = [+-]? DecimalDigit+

ExponentPart
  = ExponentIndicator SignedInteger

DecimalLiteral
  = DecimalIntegerLiteral dot DecimalDigit* ExponentPart? {
      return { type: "Literal", dataType: 'float', value: parseFloat(text()) };
    }
  / dot DecimalDigit+ ExponentPart? {
      return { type: "Literal", dataType: 'float', value: parseFloat(text()) };
    }
  / DecimalIntegerLiteral ExponentPart? {
      return { type: "Literal", dataType: 'integer', value: parseFloat(text()) };
    }

HexDigit
  = [0-9a-f]i

HexIntegerLiteral
  = "0x"i digits:$HexDigit+ {
      return { type: "Literal", dataType: 'integer', value: parseInt(digits, 16) };
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

NumericConstant "numeric constant"
  = INFINITY {
    return {type: "Literal", dataType: 'number', value: 'Infinity' };
  }
  / NAN {
    return {type: "Literal", dataType: 'number', value: 'NaN' };
  }

EscapedEscapeCharacter = "\\"

BracketedIdentifier "identifier with brackets"
  = lbracket chars:BracketedIdentifierCharacter* rbracket {
      return {
        type: "Identifier",
        name: chars.join("")
      };
    }

BracketedIdentifierCharacter
  = !(rbracket / EscapedEscapeCharacter / LineTerminator) SourceCharacter { return text(); }
  / EscapedEscapeCharacter sequence:EscapeSequence { return sequence; }
  / LineContinuation

doublequote = '"'
singlequote = "'"

StringLiteral "string"
  = doublequote chars:DoubleStringCharacter* doublequote {
      return { type: "Literal", dataType: 'string', value: chars.join("") };
    }
  / singlequote chars:SingleStringCharacter* singlequote {
      return { type: "Literal", dataType: 'string', value: chars.join("") };
    }

DoubleStringCharacter
  = !(doublequote / EscapedEscapeCharacter / LineTerminator) SourceCharacter { return text(); }
  / EscapedEscapeCharacter sequence:EscapeSequence { return sequence; }
  / LineContinuation

SingleStringCharacter
  = !(singlequote / EscapedEscapeCharacter / LineTerminator) SourceCharacter { return text(); }
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
  = singlequote
  / doublequote
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
power = '**'
divide = '/'
modulo = '%'
not_op = '~'
lparen = '('
rparen = ')'
lbracket = '['
rbracket = ']'
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
  = AND          !IdentifierPart
  / AS           !IdentifierPart
  / BEGIN        !IdentifierPart
  / BETWEEN      !IdentifierPart
  / CASE         !IdentifierPart
  / CAST         !IdentifierPart
  / DEFINED      !IdentifierPart
  / ELSE         !IdentifierPart
  / END          !IdentifierPart
  / ESCAPE       !IdentifierPart
  / EXISTS       !IdentifierPart
  / FROM         !IdentifierPart
  / IF           !IdentifierPart
  / IN           !IdentifierPart
  / IS           !IdentifierPart
  / ISNULL       !IdentifierPart
  / LIKE         !IdentifierPart
  / MEMBEROF     !IdentifierPart
  / NOT          !IdentifierPart
  / NOTNULL      !IdentifierPart
  / OF           !IdentifierPart
  / OR           !IdentifierPart
  / PER          !IdentifierPart
  / REGEXP       !IdentifierPart
  / SIMILAR      !IdentifierPart
  / THEN         !IdentifierPart
  / TO           !IdentifierPart
  / UNDEFINED    !IdentifierPart
  / WHEN         !IdentifierPart
  / WHERE        !IdentifierPart

NullLiteral "null"
  = NULL { return { type: "Literal", dataType: 'null', value: null }; }

BooleanLiteral "boolean"
  = TRUE  { return { type: "Literal", dataType: 'boolean', value: true  }; }
  / FALSE { return { type: "Literal", dataType: 'boolean', value: false }; }

ReservedWord "reserved word"
  = Keyword
  / NullLiteral
  / BooleanLiteral
  / NumericConstant

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

ArithmeticExpression "arithmetic"
  = ShiftExpression

ComparisonOperator "comparison"
  = lte
  / gte
  / $(lessthan !lessthan)
  / $(greaterthan !greaterthan)

ComparisonPredicate
  = first:ArithmeticExpression
    rest:(__ ComparisonOperator __ ArithmeticExpression)*
    { return buildBinaryPredicate(first, rest); }
  / ArithmeticExpression

EqualityPredicate
  = first:ComparisonPredicate
    rest:(__ EqualityOperator __ ComparisonPredicate)*
    { return buildBinaryPredicate(first, rest); }

EqualityOperator "equality operator"
  = notequals
  / doubleequals
  / equals
  / gtlt

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
  / DEFINED
  / UNDEFINED

PostfixExpression
  = argument:ArithmeticExpression __ operator:PostfixKeyword {
      return {
        type: 'UnaryExpression',
        operator: operator,
        argument: argument,
        fixity: 'postfix'
      };
    }

IsPredicate
  = left:ArithmeticExpression __ operator:IS __ right:ArithmeticExpression {
      return {
        type: 'BinaryPredicate',
        operator: operator,
        left: left,
        right: right
      };
    }
  / left:ArithmeticExpression __ operator:IS __ negation:NOT __ right:ArithmeticExpression {
    return {
      type: 'NotExpression',
      operator: negation,
      value: {
        type: 'BinaryPredicate',
        operator: operator,
        left: left,
        right: right
      }
    };
  }

InPredicate
  = left:ArithmeticExpression __ operator:IN __ right:ArithmeticExpression {
    return {
      type: 'BinaryPredicate',
      operator: joinWords(operator),
      left: left,
      right: right
    };
  }
  / left:ArithmeticExpression __ operator:IN __ lparen ( ( elements:ElementList comma __ )+ )? __ rparen {
    return {
      type: 'BinaryPredicate',
      operator: joinWords(operator),
      left: left,
      right: elements
    };
  }
  / left:ArithmeticExpression __ negation:NOT __ operator:IN __ right:ArithmeticExpression {
    return {
      type: 'NotExpression',
      operator: negation,
      value: {
        type: 'BinaryPredicate',
        operator: joinWords(operator),
        left: left,
        right: right
      }
    };
  }
  / left:ArithmeticExpression __ negation:NOT __ operator:IN __ lparen ( ( elements:ElementList comma __ )+ )? __ rparen {
    return {
      type: 'NotExpression',
      operator: negation,
      value: {
        type: 'BinaryPredicate',
        operator: joinWords(operator),
        left: left,
        right: elements
      }
    };
  }

BetweenPredicate
  = value:ArithmeticExpression __ BETWEEN __ low:ArithmeticExpression __ AND __ high:ArithmeticExpression
    {
      return {
          type: 'BetweenPredicate',
          value: value,
          start: low,
          stop:  high
      };
    }
  / value:ArithmeticExpression __ operator:NOT __ BETWEEN __ low:ArithmeticExpression __ AND __ high:ArithmeticExpression
    {
      return {
        type: 'NotExpression',
        operator: operator,
        value: {
          type: 'BetweenPredicate',
          value: value,
          start: low,
          stop:  high
        }
      };
    }

LikeOperator "text comparison"
  = LIKE / ILIKE

LikePredicate "text comparison"
  = value:ArithmeticExpression
    __ operator:LikeOperator __ like:ArithmeticExpression __ ESCAPE __ escapeChar:StringLiteral
    {
      return {
        type: 'LikePredicate',
        operator: joinWords(operator),
        left: value,
        right: like,
        escapeChar: escapeChar
      };
    }
  / value:ArithmeticExpression
    __ operator:LikeOperator __ like:ArithmeticExpression
    {
      return {
        type: 'LikePredicate',
        operator: joinWords(operator),
        left: value,
        right: like
      };
    }
  / value:ArithmeticExpression __ negation:NOT
    __ operator:LikeOperator __ like:ArithmeticExpression __ ESCAPE __ escapeChar:StringLiteral
    {
      return {
        type: 'NotExpression',
        operator: negation,
        value: {
          type: 'LikePredicate',
          operator: joinWords(operator),
          left: value,
          right: like,
          escapeChar: escapeChar
        }
      };
    }
  / value:ArithmeticExpression __ negation:NOT
    __ operator:LikeOperator __ like:ArithmeticExpression
    {
      return {
        type: 'NotExpression',
        operator: negation,
        value: {
          type: 'LikePredicate',
          operator: joinWords(operator),
          left: value,
          right: like
        }
      };
    }

RegexOperator
  = REGEXP / SIMILAR __ TO

RegexPredicate "regex expression"
  = value:ArithmeticExpression
    __ operator:RegexOperator __ matcher:ArithmeticExpression
    {
      return {
        type: 'RegexPredicate',
        operator: joinWords(operator),
        left: value,
        right: matcher
      };
    }
  / value:ArithmeticExpression __ negation:NOT
    __ operator:RegexOperator __ matcher:ArithmeticExpression
    {
      return {
        type: 'NotExpression',
        operator: negation,
        value: {
          type: 'RegexPredicate',
          operator: joinWords(operator),
          left: value,
          right: matcher
        }
      };
    }

PrimaryExpression
  = BracketedIdentifier
  / CastExpression
  / TimeExpression
  / FunctionInvocation
  / Identifier
  / LiteralValue
  / lparen __ expression:Predicate __ rparen { return expression; }
  / ListLiteral

MemberAccess
  = first:PrimaryExpression
    rest: ( __ lbracket __ property:Expression __ rbracket { return { property: property }; } )*
    {
      return buildTree(first, rest, function(result, element) {
        return {
          type:     'MemberAccess',
          object:   result,
          property: element.property
        };
      });
    }

PrefixOperator "prefix operator"
  = minus
  / plus
  / not_op

UnaryExpression
  = operator:PrefixOperator __ argument:MemberAccess {
    return {
      type: 'UnaryExpression',
      operator: operator,
      argument: argument,
      fixity: 'prefix'
    };
  }
  / MemberAccess

MultiplicativeExpression
  = first:UnaryExpression
    rest:(__ MultiplicativeOperator __ UnaryExpression)*
    { return buildBinaryExpression(first, rest); }

MultiplicativeOperator "multiplicative operator"
  = power
  / times
  / divide
  / modulo

// TODO: improve this to extract point/edge etc.
graph_scoped_name =
  str:[A-Za-z0-9_:]+
  { return str.join(''); }

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
           { return { column: c[2], graph_namespace: c[1] }; } )
         / ( c: column_name
           { return { column: c }; } ) )
  { return gcn[1]; }

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
ARRAY = "ARRAY"i
AS = "AS"i
ASC = "ASC"i
ATTACH = "ATTACH"i
AUTOINCREMENT = "AUTOINCREMENT"i
BEFORE = "BEFORE"i
BEGIN = "BEGIN"i
BETWEEN = "BETWEEN"i
BOOLEAN = "BOOLEAN"i
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
DATE = "DATE"i
DEFAULT = "DEFAULT"i
DEFERRABLE = "DEFERRABLE"i
DEFERRED = "DEFERRED"i
DEFINED = "DEFINED"i
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
INFINITY = "INFINITY"i
INITIALLY = "INITIALLY"i
INNER = "INNER"i
INSERT =
  __ "INSERT"i
INSTEAD = "INSTEAD"i
INTEGER = "INTEGER"i
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
MEMBEROF = "MEMBEROF"i
NAN = "NaN"i
NATURAL = "NATURAL"i
NO = "NO"i
NOT = "NOT"i
NOTNULL = "NOTNULL"i
NULL = "NULL"i
NUMBER = "NUMBER"i
OF = "OF"i
OFFSET = "OFFSET"i
ON = "ON"i
OR = "OR"i
ORDER = "ORDER"i
OUTER = "OUTER"i
PER = "PER"i
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
STRING = "STRING"i
TABLE = "TABLE"i
TEMP = "TEMP"i
TEMPORARY = "TEMPORARY"i
THEN = "THEN"i
TIME = "TIME"i
TIMESTAMP = "TIMESTAMP"i
TO = "TO"i
TRANSACTION = "TRANSACTION"i
TRIGGER = "TRIGGER"i
TRUE = "TRUE"i
UNDEFINED = "UNDEFINED"i
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
