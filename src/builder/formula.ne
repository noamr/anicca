@{%
const moo = require("moo")
const lexer = moo.compile({
  singleQuoteStringLiteral:  {match: /'(?:\\['\\]|[^\n'\\])*'/}, 
  doubleQuoteStringLiteral:  {match: /"(?:\\["\\]|[^\n"\\])*"/},
  assign: /[=\+*/?|%^&\-]?=/,
  pipeline: /\|\>/,
  nullishCoalescing: /\?\?/,
  optionalChain: /\?\./,
  shift: /(?:\<\<)|(?:\>\>\>?)/,
  compare: /(?:[<>!=]\=)|(?:[<>])/,
  float: /-?(?:[0-9]+\.[0-9]*)|(?:\.[0-9]+)/,
  and: /\&\&/,
  oiw: /\*\*/,
  or: /\|\|/,
  operator: /[!~+*/?|%\^&\-,.:]/,
  parentheses: /[(){}[\]]/,
  varname: /[A-Za-z$_][A-Za-z$_0-9]*/,
  qvar: /[A-Za-z$_][A-Za-z$_0-9]*.[A-Za-z$_][A-Za-z$_0-9]*/,
  ws: /[ \t]+/,
  int: /-?[0-9]+/,
  hex: /0x[0-9A-Fa-f]+/,
  binary: /0b[0-1]+/,
  selector: /[#*]?[A-Za-z$_][A-Za-z$_0-9]*\[?\]?(?:[~*$^]?\=[^\n])?/,
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

const ExtractOp = (op, postprocess) => ([obj]) => (postprocess || (a => a))(({op, ...obj}))

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

Next[A] ->
    W $A {% ([,a]) => a %}
    | W %indent W $A %dedent {% ([,,,a]) => a %}

RValue[Op, Value] ->
    Next[$Op $Value] {% ([[token, [args]]]) => ({token, args}) %}

Ternary[A, Op1, B, Op2, C] ->
    Binary[$A, $Op1, Binary[$B, $Op2, $C]]
        {% ([{token, args}]) => {
            return ({token, args: [...args[0], ...args[1].args.map(([a]) => a)]})
         } %}

Binary[L, Op, R] ->
    $L RValue[$Op, $R] {% ([[l], {token, args}]) => ({token, args: [l, ...args]}) %}

Unary[Op, R] ->
    RValue[$Op, $R] {% ([{token, args}]) => ({token, args}) %}

# Follow the JS order of precendence 
# https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence
ATOM ->
    WS primitive WS             {% ([,$primitive]) => ({$primitive}) %}
    | WS %varname WS             {% ([,token]) => ({$ref: token.value, token}) %}

P -> WS "(" Next[anyExpression] ")" WS {% ([,,[d]]) => d %}
    | ATOM {% id %}

optionalChain ->
    Binary[GET, "?.", %varname] {% ExtractOp('oc', 
        ({token, op, args}) => ({token, op: 'cond', args: [
            {op: 'isNil', args: [args[0]]},
            args[0], {op: 'get', args: [args[0], {$primitive: args[1].value, token: args[1]}]}]})) %}

GET -> 
    GET Next["[" Next[GET] "]"] {% ([a,[,[b]]]) => ({op: 'get', args: [a, b]}) %}
    | GET Next["." %varname] {% ([a,[token, b]]) => ({op: 'get', token, args: [a, {$primitive: b.value}]}) %}
    | functionCall {% id %}
    | optionalChain {% id %}
    | arrayConstructor {% id %}
    | objectConstructor {% id %}
    | P {% id %}

UNARY -> 
    Unary["!", UNARY]       {% ExtractOp('not') %}
    | Unary["~", UNARY]     {% ExtractOp('bwnot') %}
    | Unary["-", UNARY]     {% ExtractOp('negate') %}
    | GET             {% id %}
    
# Exponents
E -> Binary[E, "**" , UNARY]     {% ExtractOp('pow') %}
    | UNARY                     {% id %}

# Multiplication and division
MD -> Binary[MD, "*", E]    {% ExtractOp('mult') %}
    | Binary[MD, "/", E]    {% ExtractOp('div') %}
    | Binary[MD, "%", E]    {% ExtractOp('mod') %}
    | E                     {% id %}

W ->
    %eol {% NOOP %}
    | _ {% NOOP %}

# Addition and subtraction
AS -> Binary[AS, "+", MD] {% ExtractOp('add') %}
    | Binary[AS, "-", MD] {% ExtractOp('sub') %}
    | MD            {% id %}

BWS -> Binary[BWS, "<<", AS] {% ExtractOp('shl') %}
    | Binary[BWS, ">>", AS] {% ExtractOp('shr') %}
    | Binary[BWS, ">>>", AS] {% ExtractOp('ushr') %}
    | AS {% id %}

COMPARE ->
    Binary[COMPARE, "==", BWS] {% ExtractOp('eq') %}
    | Binary[COMPARE, "<=", BWS] {% ExtractOp('lte') %}
    | Binary[COMPARE, ">=", BWS] {% ExtractOp('gte') %}
    | Binary[COMPARE, ">", BWS] {% ExtractOp('gt') %}
    | Binary[COMPARE, "<", BWS] {% ExtractOp('lt') %}
    | BWS {% id %}

BWAND ->
    Binary[BWAND, "&", COMPARE] {% ExtractOp('bwand') %}
    | COMPARE {% id %}

BWXOR ->
    Binary[BWXOR, "^", BWAND] {% ExtractOp('bwxor') %}
    | BWAND {% id %}

BWOR ->
    Binary[BWOR, "|", BWXOR] {% ExtractOp('bwor') %}
    | BWXOR {% id %}

NC ->
    Binary[NC, "??", BWOR] {% ExtractOp('nc', 
        ({token, op, args}) => ({token, op: 'cond', args: [
            {op: 'isNil', args: [args[0]]},
            args[0], args[1]]})) %}
    | BWOR {% id %}

LAND ->
    Binary[LAND, "&&", NC] {% ExtractOp('and') %}
    | NC {% id %}

LOR ->
    Binary[LOR, "||", LAND] {% ExtractOp('or') %}
    | LAND {% id %}

COND ->
    Ternary[COND, "?", COND, ":", LOR] {% ExtractOp('cond') %}
    | LOR {% id %}

operand -> COND {% id %}
    
pipeFunctionCall ->
    anyExpression WS %pipeline WS partialFunctionCall 
        {% ([input,, token,, resolvePartial]) => resolvePartial({token, input}) %}

standardFunctionCall ->
    WS %varname WS "(" WS arguments WS ")" WS {% ([,op,,,, args]) => ({token: op, op: op.value, args}) %}

arrayConstructor ->
    WS "[" WS arguments WS "]" WS {% ([,token,,args]) => ({token, op: 'array', args}) %}

objectKey ->
    stringLiteral {% ([p]) => ({$primitive: JSON.parse(p)}) %}
    | %varname {% ([p]) => ({$primitive: p.value}) %}
    | %int {% ([p]) => ({$primitive: +p.value}) %}
    | %float {% ([p]) => ({$primitive: +p.value}) %}
    | "[" WS anyExpression WS "]" {% ([,,p]) => p %}

objectEntry ->
    Binary[objectKey, ":", anyExpression]
        {% ([{token, args}]) => 
        ({op: 'entry', token, args}) %}    

objectEntries ->
    objectEntry
    | objectEntry WS "," WS objectEntries {% ([one,, additionalArgs]) => ([one, ...additionalArgs]) %}
    | null {% () => [] %}

objectConstructor ->
    WS "{" WS objectEntries WS "}" WS {% ([,token,,args]) => ({token, op: 'object', args}) %}

partialFunctionCall ->
    WS %varname WS "(" WS partialArgs WS ")" {%
        ([,op, , , , args], location, reject) => {
            const index = args.findIndex(a => a === partialSymbol)
            return ({token, input}) => {
                const resolvedArgs = [...args]
                resolvedArgs.splice(index, index < 0 ? 0 : 1, input)
                return {op: op.value, token, args: resolvedArgs}
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



