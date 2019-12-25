@{%
const moo = require("moo");
const IndentifyLexer = require("@shieldsbetter/nearley-indentify")

const indentAwareLexer = new IndentifyLexer(moo.compile({
  keywords: [
      'const', 'let', 'table',
      'i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'f32', 'f64', 'bool',
      'view', 'formula', 'app', 'statechart',
      'use', 'bind', 'export',
      'of', 'to'],
  ws:     /[ \t]+/,
  int: /-?[0-9]+/,
  float: /-?[0-9]*.[0-9]/,
  varname: /[A-Za-z$_][A-Za-z$_0-9]*/,
  arithmetic: /[=+*/?|^]/,
  selector: /[#*]?[A-Za-z$_][A-Za-z$_0-9]*\[?\]?(?:[~*$^]?\=[^\n])?/,
  singleQuoteStringLiteral:  {match: /'(?:\\['\\]|[^\n'\\])*'/, value: s => s.slice(1, -1)}, 
  doubleQuoteStringLiteral:  {match: /"(?:\\["\\]|[^\n"\\])*"/, value: s => s.slice(1, -1)}, 
  newline: { match: /[\n]/, lineBreaks: true }
}))

const toToken = ({col, line}) => ({$token: {line, col}})
%}

@lexer indentAwareLexer
main -> (statements)                           {% ([statements]) => statements %}

stringLiteral -> 
    %singleQuoteStringLiteral {% ([{value}]) => value %}
    | %doubleQuoteStringLiteral {% ([{value}]) => value %}

newlines -> %eol
    | %eol newlines

statements ->
    anyStatement      {% ([a]) => [a] %}                      
    | anyStatement statements             {% ([statement, statements]) => ([statement, ...statements]) %}

anyStatement -> 
    exportStatement {% ([a]) => a %}                     
    | appStatement  {% ([a]) => a %}                      
    | constStatement {% ([a]) => a %}                    
    | viewStatement {% ([a]) => a %}                     

exportStatement -> "export" __ %varname _ newlines          {% ([a, b, name]) => ({"type": "Export", "ref": name.value, ...toToken(a)}) %}

viewStatement -> "view" __ %varname _ newlines %indent viewRules %dedent {% ([
    $token, s, name, sp, l, i, rules]) => 
    ({"type": "View", rules, name: name.value, ...toToken($token)}) %}

viewRules -> 
    viewRule 
    | viewRule newlines viewRules {% ([rule, nl, rules]) => ([rule, ...rules]) %}

viewRule -> %selector newlines %indent viewDeclarations %dedent {% ([selector, a, b, dec]) => ({type: 'ViewRule', declarations: dec, selector: selector.value, ...toToken(selector)})  %}

viewDeclarations -> 
    viewDeclaration {% ([a]) => a %}
    | viewDeclaration newlines viewDeclaration {% ([statement, _, statements]) => [statement, ...statements] %}

viewDeclaration ->
    viewBindDeclaration

viewBindDeclaration ->
    "bind" __ viewBindTarget __ "to" __ formula _ newlines    {% ([a, b, target, c, d, e, src]) => ({type: "Bind", target, src}) %}

viewBindTarget ->
    "innerHTML" {% () => 'innerHTML' %}

selector ->
    %selector {% ([s]) => s.value %}

formula ->
    %varname {% ([ref]) => ({type: "Formula", ref: ref.value}) %}

constStatement ->
    "const" __ %varname _ maybeAs _ "=" _ constValue newlines {% ([c, s1, name, s2, type, s3, e, s4, value]) => 
        ({type: "Const", name: name.value, value, ...toToken(c)})%} 

appStatement ->
    "app" __ %varname _ newlines %indent appDeclarations %dedent {% ([a, b, name, c, nl, i, dec]) => ({type: "App", name: name.value, declarations: dec, ...toToken(a)})  %}

appDeclarations ->
    appDeclaration {% ([statement]) => [statement] %}
    | appDeclaration newlines appDeclarations {% ([one, _, more]) => [...one, ...more] %}

appDeclaration ->
    useDeclaration {% ([a]) => a %}

useDeclaration ->
    "use" __ %varname _ newlines {% ([$token, b, name]) => ({type: "Use", ref: name.value, ...toToken($token)}) %}

maybeAs -> asExpression | null
asExpression -> "as" __ type
type -> "string" | "i32" | "f32"
number -> %float | %int
boolean -> "true" | "false"
nil -> "null"
primitive -> 
    number
    | stringLiteral
    | boolean
    | nil
constValue -> primitive {% ([a]) => a[0] %}

 
# Whitespace
_ -> null | _ [\s] {% function() {} %}
__ -> [\s] | __ [\s] {% function() {} %}