@{%
const moo = require("moo");
const IndentifyLexer = require("@shieldsbetter/nearley-indentify")

const indentAwareLexer = new IndentifyLexer(moo.compile({
  ws:     /[ \t]+/,
  int: /-?[0-9]+/,
  float: /-?[0-9]*.[0-9]/,
  varname: /[A-Za-z$_][A-Za-z$_0-9]*/,
  selectorToken: /[#\[\]=]/,
  singleQuoteStringLiteral: /'?[^'\n]*'/, 
  doubleQuoteStringLiteral: /"?:[^"\n]*"/, 
  newline: { match: /\n/, lineBreaks: true },
  newlines: { match: /\n+/, lineBreaks: true }
}))

%}

@lexer indentAwareLexer
main -> (statements)                           {% ([[statements]]) => statements %}

stringLiteral -> 
    %singleQuoteStringLiteral {% ([{value}]) => value %}
    | %doubleQuoteStringLiteral {% ([{value}]) => value %}

newlines -> "\n"
    | "\n" newlines
    | null

statements ->
    anyStatement                                 
    | anyStatement newlines statements             {% ([statement, _, statements]) => ([statement, ...statements]) %}

anyStatement -> 
    exportStatement                     
    | viewStatement                     
    | appStatement                     
    | constStatement                   

exportStatement -> "export" __ %varname _ newlines          {% ([a, b, name]) => ({"type": "ExportStatement", "ref": name.value}) %}

viewStatement -> "view" __ %varname _ newlines %indent viewRules dedent {% ([v, s, name, sp, l, i, rules]) => 
    ({"type": "View", rules, name: name.value}) %}

viewRules -> 
    viewRule
    | viewRule newlines viewRules {% ([rule, nl, rules]) => ([rule, ...rules]) %}

viewRule -> selector newlines %indent viewDeclarations dedent {% ([selector, a, b, dec]) => ({type: 'ViewRule', declrations: dec, selector})  %}

viewDeclarations -> 
    viewDeclaration
    | viewDeclaration %newlines viewDeclaration {% ([statement, _, statements]) => [statement, ...statements] %}

viewDeclaration ->
    viewBindDeclaration

viewBindDeclaration ->
    "bind" __ viewBindTarget __ "to" __ formula _ newlines    {% ([a, b, target, c, d, e, src]) => ({type: "Bind", target, src}) %}

viewBindTarget ->
    "innerHTML" {% () => 'innerHTML' %}

selector ->
    "#" %varname {% ([t, statement]) => t + statement %}

formula ->
    %varname {% ([ref]) => ({type: "Formula", ref: ref.value}) %}

constStatement ->
    "const" __ %varname _ maybeAs _ "=" _ constValue {% ([c, s1, name, s2, type, s3, e, s4, value]) => 
        ({type: "Const", name: name.value, value})%} 

appStatement ->
    "app" __ %varname _ newlines %indent appDeclarations dedent {% ([a, b, name, c, nl, i, dec]) => ({type: "App", declaration: dec})  %}

appDeclarations ->
    appDeclaration {% ([statement]) => [statement] %}
    | appDeclaration newlines appDeclarations {% ([statement, _, statements]) => [statement, ...statements] %}

appDeclaration ->
    useDeclaration

useDeclaration ->
    "use" __ %varname _ newlines {% ([a, b, name]) => ({type: "Use", name: name.value}) %}

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
constValue -> primitive {% ([a]) => a %}

dedent -> %dedent
    | newlines 
_ => %ws | null 
__ => %ws

