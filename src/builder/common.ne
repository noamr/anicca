
type -> "string" {%id %}
        | "i32" {%id %}
        | "f32" {%id %}
number -> %float | %int {%id %}
boolean -> "true" | "false" {%id %}
nil -> "null" {%id %}

@builtin "whitespace.ne"
