@{%
const moo = require('moo')
const lexer = moo.states({
  main: {
    startTemplateLiteral: {match: '`', push: 'lit'},
    singleQuoteStringLiteral:  {match: /'(?:\\['\\]|[^\n'\\])*'/}, 
    doubleQuoteStringLiteral:  {match: /"(?:\\["\\]|[^\n"\\])*"/},
    comment: { match: /\n#[^\n]+/, lineBreaks: true },
    lbrace:   {match: '{', push: 'main'},
    rbrace:   {match: '}', pop: true},
    stuff: {match: /[^;{}]+/, lineBreaks: true, value: v => v.trim()},
    ws: {match: /\s/, lineBreaks: true},
    newlines: { match: /[;\n]/, lineBreaks: true },
  },

  lit: {
    interp:               {match: '${', push: 'main'},
    escape:               /\\./,
    endTemplateLiteral:   {match: '`', pop: true},
    templateConst:        {match: /(?:[^$`]|\$(?!\{))+/, lineBreaks: true},
  }})

  const NOOP = () => null

%}

@lexer lexer
@builtin "whitespace.ne"


Root -> _ Something:* _ {% ([,things]) => things.filter(a => a) %}
MaybeSemicolon -> 
    _ ";" _ {% NOOP %}
    | _ {% NOOP %}
OneThing -> _ %stuff MaybeSemicolon {% ([,a]) => a %}
Dictionary -> %stuff _ %lbrace _ Root _ %rbrace {% ([key,,,, value]) => ({key, value}) %}
Something ->
    Dictionary {% id %}
    | OneThing {% id %}



