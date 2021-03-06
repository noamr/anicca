@{%

const NOOP = () => {}
const partialSymbol = Symbol("partial")
const extractToken = t => 
    t instanceof Array ?
        extractToken(t[0]) :
        t.col ? {col: t.col, line: t.line, range: [t.offset, t.offset + t.text.length]} : undefined

function fixTokens(f) {
    if (!f)
        return f
    const {op, args, token, ...rest} = f
    return ({op, $token: token ? extractToken(token): undefined, args: args ? args.map(fixTokens).flat() : undefined, ...rest})
}

const ExtractOp = (op, postprocess) => ([obj]) => (postprocess || (a => a))(({op, ...obj}))

%}

@builtin "whitespace.ne"

rawFormula -> 
    rawFormulaWithTokens {% id %}

formulaWithoutTokens -> rawFormulaWithTokens {% ([formula]) => removeTokens(formula) %}
rawFormulaWithTokens -> anyExpression                          {% ([id]) => JSON.parse(JSON.stringify(fixTokens(id))) %}

ref -> 
    _ V _             {% ([,token]) => ({$ref: token.value, token}) %}

V ->
    %varname {% id %}
    | %internalVar {% id %}

stringLiteral -> 
    %singleQuoteStringLiteral {% ([{value}]) => value %}
    | %doubleQuoteStringLiteral {% ([{value}]) => value %}

type -> "string" {%id %}
        | "i32" {%id %}
        | "f32" {%id %}
number -> %float  {% ([a]) => parseFloat(a) %}
        | %int {% ([a]) => parseInt(a) %}
boolean -> "true" | "false" {% ([{value}]) => value %}

primitive -> 
    number {% ([n]) => eval(n) %}
    | stringLiteral {% ([s]) => eval(s) %}
    | %keywords {% ([k]) => eval(k.value) %}

anyExpression -> 
    _ operand _ {% ([,e]) => e %}

Next[A] ->
    _ $A {% ([,a]) => a %}

RValue[Op, Value] ->
    Next[$Op $Value] {% ([[token, [args]]]) => ({token, args}) %}

Ternary[A, Op1, B, Op2, C] ->
    Binary[$A, $Op1, Binary[$B, $Op2, $C]]
        {% ([{token, args}]) =>
                ({token, args: [...args[0], ...args[1].args.map(([a]) => a)]})
         %}

Binary[L, Op, R] ->
    $L RValue[$Op, $R] {% ([[l], {token, args}]) => ({token, args: [l, ...args]}) %}

Unary[Op, R] ->
    RValue[$Op, $R] {% ([{token, args}]) => ({token, args}) %}

# Follow the JS order of precendence 
# https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence
ATOM ->
    _ primitive _             {% ([,$primitive]) => ({$primitive}) %}
    | _ ref _ {% ([,r]) => r %}
    | _ templateString _ {% ([,s]) => s %}

P -> _ "(" Next[anyExpression] ")" _ {% ([,,[d]]) => d %}
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

# Addition and subtraction
AS -> Binary[AS, "+", MD] {% ExtractOp('plus') %}
    | Binary[AS, "-", MD] {% ExtractOp('minus') %}
    | MD            {% id %}

BWS -> Binary[BWS, "<<", AS] {% ExtractOp('shl') %}
    | Binary[BWS, ">>", AS] {% ExtractOp('shr') %}
    | Binary[BWS, ">>>", AS] {% ExtractOp('ushr') %}
    | AS {% id %}

COMPARE ->
    Binary[COMPARE, "==", BWS] {% ExtractOp('eq') %}
    | Binary[COMPARE, "===", BWS] {% ExtractOp('eq') %}
    | Binary[COMPARE, "<=", BWS] {% ExtractOp('lte') %}
    | Binary[COMPARE, "!=", BWS] {% ExtractOp('neq') %}
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
    Ternary[COND, "?", LOR, ":", LOR] {% ExtractOp('cond') %}
    | LOR {% id %}

operand -> COND {% id %}

pipeFunctionCall ->
    anyExpression _ %pipeline _ partialFunctionCall 
        {% ([input,, token,, resolvePartial]) => resolvePartial({token, input}) %}

standardFunctionCall ->
    _ %varname _ "(" _ arguments _ ")" _ {% ([,op,,,, args]) => ({token: op, op: op.value, args}) %}

arrayConstructor ->
    _ "[" _ arguments _ "]" _ {% ([,token,,args]) => ({token, op: args.length == 2 ? 'pair' : 'array', args}) %}

objectKey ->
    stringLiteral {% ([p]) => ({$primitive: JSON.parse(p)}) %}
    | %varname {% ([p]) => ({$primitive: p.value}) %}
    | %int {% ([p]) => ({$primitive: +p.value}) %}
    | %float {% ([p]) => ({$primitive: +p.value}) %}
    | "[" _ anyExpression _ "]" {% ([,,p]) => p %}

objectEntry ->
    Binary[objectKey, ":", anyExpression]
        {% ([{token, args}]) => 
        ({op: 'pair', token, args}) %}    

objectEntries ->
    objectEntry
    | objectEntry _ "," _ objectEntries {% ([one,, additionalArgs]) => ([one, ...additionalArgs]) %}
    | null {% () => [] %}

objectConstructor ->
    _ "{" _ objectEntries _ "}" _ {% ([,token,,args]) => ({token, op: 'object', args}) %}

partialFunctionCall ->
    _ %varname _ {% ([,op]) => (({token, input}) => ({op: op.value, token, args: [input]})) %}
    | _ %varname _ "(" _ partialArgs _ ")" {%
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
    | _ "?" _ {% () => partialSymbol %}

partialArgs ->
    partialArg
    | partialArg _ "," _ partialArgs {% ([one,,,, additionalParialArgs], loc, reject) => {
        if (one === partialSymbol && additionalParialArgs.findIndex(a => a === partialSymbol) >= 0) {
            return reject
        }

        return [one, ...additionalParialArgs]
    } %}
    | null {% () => [] %}

functionCall ->
    pipeFunctionCall {% id %}
    | standardFunctionCall  {% id %}

templateComponent ->
    %templateConst {% ([s]) => ({$primitive: s.value}) %}
    | %interp anyExpression %rbrace {% ([,arg]) => arg %}

templateComponents ->
    templateComponent:* {% id %}

templateString ->
    %startTemplateLiteral templateComponents %endTemplateLiteral {% ([,c]) => ({op: 'join', args: [{op: 'array', args: c}, {$primitive: ''}]}) %}


