@{%
const moo = require("moo")
const lexer = moo.compile({
  keywords: [
      'const', 'let', 'table',
      'i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'f32', 'f64', 'bool',
      'view', 'formula', 'app', 'controller',
      'use', 'bind', 'export',
      'html', 'attribute', 'style',
      'prevent default', 'dispatch',
      'of', 'to', 'on'],

  pipeline: /\|\>/,
  operator: /[+*/?|%^&\-,]/,
  parentheses: /[(){}[\].]/,
  varname: /[A-Za-z$_][A-Za-z$_0-9]*/,
  ws: /[ \t]+/,
  int: /-?[0-9]+/,
  hex: /0x[0-9A-Fa-f]+/,
  binary: /0b[0-1]+/,
  unary: /[!~]/,
  float: /-?[0-9]*.[0-9]/,
  and: /\&\&/,
  or: /\|\|/,
  assign: /[=+*/?|%^&\-]?=/,
  selector: /[#*]?[A-Za-z$_][A-Za-z$_0-9]*\[?\]?(?:[~*$^]?\=[^\n])?/,
  singleQuoteStringLiteral:  {match: /'(?:\\['\\]|[^\n'\\])*'/}, 
  doubleQuoteStringLiteral:  {match: /"(?:\\["\\]|[^\n"\\])*"/},
  newline: { match: /[\n]/, lineBreaks: true }
})

const IndentifyLexer = require("@shieldsbetter/nearley-indentify")

const indentAwareLexer = new IndentifyLexer(lexer)

const NOOP = () => {}
const partialSymbol = Symbol("partial")
const extractToken = t => 
    t instanceof Array ?
        extractToken(t[0]) :
        t.col ? {col: t.col, line: t.line} : undefined

function fixTokens({op, args, token, ...rest}) {
    return ({op, $token: token ? extractToken(token): undefined, args: args ? args.map(fixTokens).flat() : undefined, ...rest})
}

%}

@lexer indentAwareLexer
@builtin "whitespace.ne"

rawFormula -> anyExpression                          {% ([id]) => JSON.parse(JSON.stringify(fixTokens(id))) %}

WS ->
    _ {% NOOP %}
    | %eol  {% NOOP %}
    | %indent  {% NOOP %}

stringLiteral -> 
    %singleQuoteStringLiteral {% ([{value}]) => value %}
    | %doubleQuoteStringLiteral {% ([{value}]) => value %}

type -> "string" {%id %}
        | "i32" {%id %}
        | "f32" {%id %}
number -> %float  {% ([a]) => parseFloat(a) %}
        | %int {% ([a]) => parseInt(a) %}
boolean -> "true" {%id %} | "false" {%id %}
nil -> "null" {%id %}
primitive -> 
    number {% ([n]) => +n %}
    | stringLiteral {% ([s]) => eval(s) %}
    | boolean {%id %}
    | nil {%id %}

anyExpression -> 
    WS operand WS {% ([,e]) => e %}

# Follow the JS order of precendence 
# https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence
ATOM ->
    WS primitive WS             {% ([,$primitive]) => ({$primitive}) %}
    | WS %varname WS             {% ([,token]) => ({$ref: token.value, token}) %}

P -> WS "(" anyExpression ")" WS {% ([,,d]) => d %}
    | ATOM {% id %}

GET -> 
    GET WS "[" WS GET WS "]" {% ([a,,,,b]) => ({op: 'get', args: [a, b]}) %}
    | GET WS "." WS %varname {% ([a,,,,b]) => ({op: 'get', args: [a, {$primitive: b.value}]}) %}
    | functionCall {% id %}
    | P {% id %}

UNARY -> 
    WS "!" WS UNARY    {% ([,token,,a]) => ({op: 'not', token, args: [a]}) %}
    | WS "~" WS UNARY    {% ([,token,,a]) => ({op: 'bwnot', token, args: [a]}) %}
    | WS "-" WS UNARY    {% ([,token,,a]) => ({op: 'minus', token, args: [{$primitive: 0}, a]}) %}
    | WS "+" WS UNARY    {% ([,token,,a]) => ({op: 'toNumber', token, args: [a]}) %}
    | GET             {% id %}
    
# Exponents
E -> UNARY WS "**" WS E    {% ([a,,token,,b]) => ({op: 'pow', token, args: [a, b]}) %}
    | UNARY             {% id %}

# Multiplication and division
MD -> MD WS "*" WS E  {% ([a,,token,,b]) => ({op: 'mult', args: [a, b], token}) %}
    |MD WS "/" WS E  {% ([a,,token,,b]) => ({op: 'div', args: [a, b], token}) %}
    |MD WS "%" WS E  {% ([a,,,,b]) => ({op: 'mod', args: [a, b], token}) %}
    | E             {% id %}

# Addition and subtraction
AS -> AS WS "+" WS MD {% function([a,,token,,b]) {return ({op: 'add', token, args: [a, b]}) } %}
    | AS WS "-" WS MD {% function([a,,token,,b]) {return ({op: 'sub', token, args: [a, b]}) } %}
    | MD            {% id %}

operand -> AS {% id %}
    
pipeFunctionCall ->
    anyExpression WS %pipeline WS partialFunctionCall 
        {% ([input,, token,, resolvePartial]) => resolvePartial({token, input}) %}

standardFunctionCall ->
    %varname WS "(" WS arguments WS ")" WS {% ([op,,,, args]) => ({token: op, op: op.value, args}) %}

partialFunctionCall ->
    %varname WS "(" WS partialArgs WS ")" {%
        ([op, , , , args], location, reject) => {
            const index = args.findIndex(a => a === partialSymbol)
            return ({token, input}) => {
                const resolvedArgs = [...args]
                resolvedArgs.splice(index, index < 0 ? 0 : 1, input)
                return {op: op.value, token, input, args: resolvedArgs}
            }
        }
    %}

arguments ->
    anyExpression
    | anyExpression "," arguments {% ([one,, additionalArgs]) => ([one, ...additionalArgs]) %}
    | null {% () => [] %}

partialArg ->
    anyExpression {% id %}
    | WS "?" WS {% () => partialSymbol %}

partialArgs ->
    partialArg
    | partialArg WS "," WS partialArgs {% ([one,,,, additionalParialArgs], loc, reject) => {
        if (one === partialSymbol && additionalParialArgs.findIndex(a => a === partialSymbol) >= 0) {
            return reject
        }

        return [one, ...additionalParialArgs]
    } %}
    | null {% () => [] %}

functionCall ->
    pipeFunctionCall {% id %}
    | standardFunctionCall  {% id %}



