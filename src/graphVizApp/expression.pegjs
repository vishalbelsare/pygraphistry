{
  // Header/utility functions for sql.pegjs grammar match bodies.
  //
  function append(arr, x) {
    arr[arr.length] = x;
    return arr;
  }

  function flatten(x, rejectSpace, acc) {
    acc = acc || [];
    if (x == null || x == undefined) {
      if (!rejectSpace) {
        return append(acc, x);
      }
      return acc;
    }
    if (x.length == undefined) { // Just an object, not a string or array.
      return append(acc, x);
    }
    if (rejectSpace &&
      ((x.length == 0) ||
       (typeof(x) == "string" &&
        x.match(/^\s*$/)))) {
      return acc;
    }
    if (typeof(x) == "string") {
      return append(acc, x);
    }
    for (var i = 0; i < x.length; i++) {
      flatten(x[i], rejectSpace, acc);
    }
    return acc;
  }

  function flatstr(x, rejectSpace, joinChar) {
    return flatten(x, rejectSpace, []).join(joinChar || '');
  }

  function filter(arr, x) {
    var acc = [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] != x) {
        acc[acc.length] = arr[i];
      }
    }
    return acc;
  }

  function nonempty(x) {             // Ex: nonempty("") == null;
    if (x == null || x.length > 0) { // Ex: nonempty(null) == null;
      return x;
    }
    return null;
   }

  function put_if_not_null(m, key, val) {
    if (val) {
      m[key] = val;
    }
    return m;
  }
  function merge(src, dst) {
    for (var k in src) {
      dst[k] = src[k];
    }
    return dst;
  }
}

start = expr

type_name =
  ( name )+
  ( ( lparen signed_number rparen )
  / ( lparen signed_number comma signed_number rparen ) )?

signed_number =
  ( ( plus / minus )? numeric_literal )

value =
  v: ( whitespace
       ( ( x: literal_value
           { return { literal: x } } )
       / ( b: bind_parameter
           { return { bind: b } } )
       / ( t: ( table_name dot column_name )
           { return { column: t[2], table: t[1] } } )
       / ( c: column_name
           { return { column: c } } )
       / ( unary_operator expr )
       / call_function
       / ( whitespace lparen expr whitespace rparen )
       / ( CAST lparen expr AS type_name rparen )
       // / ( ( NOT ? EXISTS )? lparen select_stmt rparen )
       / ( CASE expr ? ( WHEN expr THEN expr )+ ( ELSE expr )? END )
       // / raise_function
       ) )
  { return v[1] }

expr =
  e: ( whitespace
       ( ( value binary_operator expr )
       / ( value COLLATE collation_name )
       / ( value NOT ? ( LIKE / GLOB / REGEXP / MATCH ) expr ( ESCAPE expr )? )
       / ( value ( ISNULL / NOTNULL / ( NOT NULL ) ) )
       / ( value IS NOT ? expr )
       / ( value NOT ? BETWEEN expr AND expr )
       // / ( value NOT ? IN ( ( lparen ( select_stmt / ( expr comma )+ )? rparen )
       //                   / table_ref ) )
       / value ) )
  { return e[1]; }


call_function =
  ( function_name
    whitespace lparen
               ( ( DISTINCT ? ( expr (whitespace comma expr)* )+ )
               / whitespace star )?
    whitespace rparen )

literal_value =
  ( numeric_literal / string_literal / blob_literal
  / NULL / CURRENT_TIME / CURRENT_DATE / CURRENT_TIMESTAMP )

numeric_literal =
  digits:( ( ( ( digit )+ ( decimal_point ( digit )+ )? )
           / ( decimal_point ( digit )+ ) )
           ( E ( plus / minus )? ( digit )+ )? )
  { var x = flatstr(digits);
    if (x.indexOf('.') >= 0) {
      return parseFloat(x);
    }
    return parseInt(x);
  }

select_core =
  ( SELECT d: ( ( DISTINCT / ALL )? )
           c: ( select_result
                ( cx: ( whitespace comma select_result )*
                      { var acc = [];
                        for (var i = 0; i < cx.length; i++) {
                          acc[i] = cx[i][2];
                        }
                        return acc;
                      } ) )
    f: ( j: ( ( FROM join_source )? )
         { return j ? j[1] : [] } )
    w: ( e: ( ( WHERE expr )? )
         { return e ? e[1] : [] } )
    // g: ( GROUP BY ( ordering_term comma )+ ( HAVING expr )? )?
    )
  { c[1].unshift(c[0]);
    var res = { results: c[1] };
    res = put_if_not_null(res, "distinct", nonempty(flatstr(d)));
    res = put_if_not_null(res, "from", nonempty(f));
    res = put_if_not_null(res, "where", nonempty(w));
    // res = put_if_not_null(res, "group_by", nonempty(g));
    return res;
  }

select_result =
  r: ( whitespace
       ( ( c: ( column_ref ( a: ( AS whitespace column_alias )
                             { return { alias: a[2] } } )? )
              { return merge(c[1], c[0]) } )
       / ( c: ( table_name dot star )
              { return { table: c[0],
                         column: '*' } } )
       / ( star
           { return { column: '*' } } ) ) )
  { return r[1] }

join_source =
  s: ( whitespace single_source
       ( join_op whitespace single_source join_constraint )* )
  { var acc = [s[1]];
    var rest = s[2];
    for (var i = 0; rest != null && i < rest.length; i++) {
      acc[acc.length] = merge(merge(rest[i][0], rest[i][2]), rest[i][3]);
    }
    return acc;
  }

single_source =
  ( ( x: ( database_name dot table_name AS whitespace1 table_alias )
      { return { database: x[0], table: x[2], alias: x[5] } } )
  / ( x: ( database_name dot table_name )
      { return { database: x[0], table: x[2] } } )
  / ( x: ( table_name AS whitespace1 table_alias )
      { return { table: x[0], alias: x[3] } } )
  / ( x: table_name
      { return { table: x } } )
  / ( s: ( ( t: ( table_ref ( a: ( AS whitespace1 table_alias )
                              { return { alias: a[2] } } )? )
             { return merge(t[1], t[0]) } )
           ( ( idx: ( INDEXED BY whitespace index_name )
               { return { indexed_by: idx[3] } } )
           / ( ( NOT INDEXED )
               { return { indexed_by: null } } ) )? )
      { return merge(s[1], s[0]) } )
  / ( j: ( lparen join_source rparen )
      { return j[1] } )
  )

join_op =
  r: ( ( ( ( whitespace comma )
           { return "JOIN" } )
       / ( j: ( NATURAL ?
                ( ( LEFT ( OUTER )? )
                  / INNER
                  / CROSS )?
                JOIN )
           { return flatstr(j) } ) ) )
  { return { join_op: r } }

join_constraint =
  r: ( ( ( ON expr )
       / ( USING
           whitespace lparen
           ( whitespace column_name ( whitespace comma whitespace column_name )* )
           whitespace rparen ) )? )
  { return { join_constraint: nonempty(r) } }

compound_operator =
  o: ( ( UNION ALL ? )
     / INTERSECT
     / EXCEPT )
  { return { compound_operator: flatstr(o) } }

table_ref =
  r: ( ( d: ( database_name dot )
         { return { database: d[0] } } )?
       ( x: table_name
         { return { table: x } } ) )
  { return merge(r[1], r[0]) }

column_ref =
  r: ( ( t: ( table_name dot )
         { return { table: t[0] } } )?
       ( x: column_name
         { return { column: x } } ) )
  { return merge(r[1], r[0]) }

comment_syntax =
  ( ( minusminus ( anything_except_newline )+ ( newline / end_of_input ) )
  / ( comment_beg ( anything_except_comment_end )+ ( comment_end / end_of_input ) ) )

dot = '.'
comma = ','
colon = ':'
semicolon = ';'
minusminus = '--'
minus = '-'
plus = '+'
lparen = '('
rparen = ')'
star = '*'
newline = '\n'
anything_except_newline = [^\n]*
comment_beg = '/*'
comment_end = '*/'
anything_except_comment_end = .* & '*/'
string_literal = '"' (escape_char / [^"])* '"'
escape_char = '\\' .
nil = ''

whitespace =
  [ \t\n\r]*
whitespace1 =
  [ \t\n\r]+

unary_operator =
  x: ( whitespace
       ( '-' / '+' / '~' / 'NOT'i) )
  { return x[1] }

binary_operator =
  x: ( whitespace
       ('||'
        / '*' / '/' / '%'
        / '+' / '-'
        / '<<' / '>>' / '&' / '|'
        / '<=' / '>='
        / '<' / '>'
        / '=' / '==' / '!=' / '<>'
        / 'IS'i / 'IS NOT'i / 'IN'i / 'LIKE'i / 'GLOB'i / 'MATCH'i / 'REGEXP'i
        / 'AND'i
        / 'OR'i) )
  { return x[1] }

digit = [0-9]
decimal_point = dot
equal = '='

name =
  str:[A-Za-z0-9_:]+
  { return str.join('') }

database_name = name
table_name = name
table_alias = name
table_or_index_name = name
new_table_name = name
index_name = name
graph_namespace = name
column_name = name
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

error_message = string_literal

CURRENT_TIME = 'now'
CURRENT_DATE = 'now'
CURRENT_TIMESTAMP = 'now'

blob_literal = string_literal

end_of_input = ''

ABORT = whitespace1 "ABORT"i
ACTION = whitespace1 "ACTION"i
ADD = whitespace1 "ADD"i
AFTER = whitespace1 "AFTER"i
ALL = whitespace1 "ALL"i
ALTER = whitespace1 "ALTER"i
ANALYZE = whitespace1 "ANALYZE"i
AND = whitespace1 "AND"i
AS = whitespace1 "AS"i
ASC = whitespace1 "ASC"i
ATTACH = whitespace1 "ATTACH"i
AUTOINCREMENT = whitespace1 "AUTOINCREMENT"i
BEFORE = whitespace1 "BEFORE"i
BEGIN = whitespace1 "BEGIN"i
BETWEEN = whitespace1 "BETWEEN"i
BY = whitespace1 "BY"i
CASCADE = whitespace1 "CASCADE"i
CASE = whitespace1 "CASE"i
CAST = whitespace1 "CAST"i
CHECK = whitespace1 "CHECK"i
COLLATE = whitespace1 "COLLATE"i
COLUMN = whitespace1 "COLUMN"i
COMMIT = whitespace1 "COMMIT"i
CONFLICT = whitespace1 "CONFLICT"i
CONSTRAINT = whitespace1 "CONSTRAINT"i
CREATE =
  whitespace "CREATE"i
CROSS = whitespace1 "CROSS"i
DATABASE = whitespace1 "DATABASE"i
DEFAULT = whitespace1 "DEFAULT"i
DEFERRABLE = whitespace1 "DEFERRABLE"i
DEFERRED = whitespace1 "DEFERRED"i
DELETE =
  whitespace "DELETE"i
DESC = whitespace1 "DESC"i
DETACH = whitespace1 "DETACH"i
DISTINCT = whitespace1 "DISTINCT"i
DROP = whitespace1 "DROP"i
E =
  "E"i
EACH = whitespace1 "EACH"i
ELSE = whitespace1 "ELSE"i
END = whitespace1 "END"i
ESCAPE = whitespace1 "ESCAPE"i
EXCEPT = whitespace1 "EXCEPT"i
EXCLUSIVE = whitespace1 "EXCLUSIVE"i
EXISTS = whitespace1 "EXISTS"i
EXPLAIN =
  whitespace "EXPLAIN"i
FAIL = whitespace1 "FAIL"i
FOR = whitespace1 "FOR"i
FOREIGN = whitespace1 "FOREIGN"i
FROM = whitespace1 "FROM"i
GLOB = whitespace1 "GLOB"i
GROUP = whitespace1 "GROUP"i
HAVING = whitespace1 "HAVING"i
IF = whitespace1 "IF"i
IGNORE = whitespace1 "IGNORE"i
IMMEDIATE = whitespace1 "IMMEDIATE"i
IN = whitespace1 "IN"i
INDEX = whitespace1 "INDEX"i
INDEXED = whitespace1 "INDEXED"i
INITIALLY = whitespace1 "INITIALLY"i
INNER = whitespace1 "INNER"i
INSERT =
  whitespace "INSERT"i
INSTEAD = whitespace1 "INSTEAD"i
INTERSECT = whitespace1 "INTERSECT"i
INTO = whitespace1 "INTO"i
IS = whitespace1 "IS"i
ISNULL = whitespace1 "ISNULL"i
JOIN = whitespace1 "JOIN"i
KEY = whitespace1 "KEY"i
LEFT = whitespace1 "LEFT"i
LIKE = whitespace1 "LIKE"i
LIMIT = whitespace1 "LIMIT"i
MATCH = whitespace1 "MATCH"i
NATURAL = whitespace1 "NATURAL"i
NO = whitespace1 "NO"i
NOT = whitespace1 "NOT"i
NOTNULL = whitespace1 "NOTNULL"i
NULL = whitespace1 "NULL"i
OF = whitespace1 "OF"i
OFFSET = whitespace1 "OFFSET"i
ON = whitespace1 "ON"i
OR = whitespace1 "OR"i
ORDER = whitespace1 "ORDER"i
OUTER = whitespace1 "OUTER"i
PLAN = whitespace1 "PLAN"i
PRAGMA = whitespace1 "PRAGMA"i
PRIMARY = whitespace1 "PRIMARY"i
QUERY = whitespace1 "QUERY"i
RAISE = whitespace1 "RAISE"i
REFERENCES = whitespace1 "REFERENCES"i
REGEXP = whitespace1 "REGEXP"i
REINDEX = whitespace1 "REINDEX"i
RELEASE = whitespace1 "RELEASE"i
RENAME = whitespace1 "RENAME"i
REPLACE =
  whitespace "REPLACE"i
RESTRICT = whitespace1 "RESTRICT"i
ROLLBACK = whitespace1 "ROLLBACK"i
ROW = whitespace1 "ROW"i
SAVEPOINT = whitespace1 "SAVEPOINT"i
SELECT =
  whitespace "SELECT"i
SET = whitespace1 "SET"i
TABLE = whitespace1 "TABLE"i
TEMP = whitespace1 "TEMP"i
TEMPORARY = whitespace1 "TEMPORARY"i
THEN = whitespace1 "THEN"i
TO = whitespace1 "TO"i
TRANSACTION = whitespace1 "TRANSACTION"i
TRIGGER = whitespace1 "TRIGGER"i
UNION = whitespace1 "UNION"i
UNIQUE = whitespace1 "UNIQUE"i
UPDATE =
  whitespace "UPDATE"i
USING = whitespace1 "USING"i
VACUUM = whitespace1 "VACUUM"i
VALUES = whitespace1 "VALUES"i
VIEW = whitespace1 "VIEW"i
VIRTUAL = whitespace1 "VIRTUAL"i
WHEN = whitespace1 "WHEN"i
WHERE = whitespace1 "WHERE"i