@include "./formula.ne"

RootTypeDeclaration ->
    RootType __ ref {% ([[{value}],,ref]) => ({type: value[0].toUpperCase() + value.substr(1), name: ref.$ref}) %}

RootType ->
    "controller" 
    | "view" 
    | "let" 
    | "table" 
    | "slot"
    | "bus"
    | "import"

