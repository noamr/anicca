@{%
const moo = require("moo")
const lexer = moo.compile({
  keywords: ['i8', 'u8', 'i16', 'u16', 'i32', 'u32', 'i64', 'u64', 'f32', 'f64', 'i128', 'u128', 'string', 'bool', 'ByteArray'],
  ws: /[ \t]+/,
  word: /[A-Za-z_$][A-Za-z_$0-9]*/,
  symbols: /[\[\],{}:]/
})

%}
@builtin "whitespace.ne"

@lexer lexer

type ->
    singular {% id %}
    | tuple {% id %}
    | dictionary {% id %}

singular ->
    _ %keywords _ {% ([,{value}]) => value %}

tuple ->
    _ "[" _ args _ "]" _ {% ([,,,args]) => ({tuple: args}) %}

args ->
    type
    | _ args _ "," _ type _ {% ([,multi,,,, single]) => [...multi, single] %}

dictionary ->
    _ "{" _ type _ ":" _ type "}" {% ([,,,a,,,,b]) => ({dictionary: [a, b]}) %}