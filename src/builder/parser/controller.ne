@include "./formula.ne"

conrtollerAtom ->
  transition {% id %}
  | state {% id %}
  | onEntry {% id %}
  | onExit {% id %}

historyHeader ->
   "history" {%  () => true %}
   | "shallow" __ "history" {% () => false %}
   | "deep" __ "history" {% () => true %}

state ->
    "state" __ V {% ([,,name]) => ({type: 'State', name: name.value}) %}
    | V {% ([name]) => ({type: 'State', name: name.value}) %}
    | "parallel" __ V {% ([,,name]) => ({type: 'Parallel', name: name.value}) %}
    | "final" __ V {% ([,,name]) => ({type: 'Final', name: name.value}) %}
    | "initial" {% () => ({type: 'Initial'}) %}
    | historyHeader __ V {% ([deep,,name]) => ({deep, type: 'History', name: name.value}) %}

maybeComma ->
    _ "," _ {% NOOP %}
    | null {% NOOP %}
payloadItem ->
    _ V __ AS __ V maybeComma {% ([,name,,,,type]) => ([name.value, type.value]) %}

payloadItems ->
    payloadItem:* {% ([args]) => args.reduce((a, [name, type], i) => ({...a, [name]: [i, type]}), {}) %}

eventTrigger ->
    "on" __ V {% ([,,event]) => ({event: event.value}) %}
    | "on" __ V _ "(" _ payloadItems _ ")" {% ([,,event,,,,payload]) => ({event: event.value, payload}) %}

timeUnit ->
    "milliseconds" {% () => 1 %}
    | "ms" {% () => 1 %}
    | "seconds" {% () => 1 %}
    | "s" {% () => 1000 %}
    | "minutes" {% () => 60 * 1000 %}
    | "m" {% () => 60 * 1000 %}
    | "hours" {% () => 60 * 60 * 1000 %}
    | "h" {% () => 60 * 60 * 1000 %}
    | "days" {% () => 24 * 60 * 60 * 1000 %}
    | "d" {% () => 24 * 60 * 60 * 1000 %}

timeout ->
    "after" __ formulaWithoutTokens __ timeUnit {% ([,,time,,unit]) => ({timeout: {op: 'mult', args: [time, {$primitive: unit}]}}) %}

condition ->
    "when" __ formulaWithoutTokens {% ([,,condition]) => ({condition}) %}

trigger ->
    eventTrigger {% id %}
    | timeout {% id %}

transitionHeader ->
    trigger {% id %}
    | condition {% id %}
    | trigger __ condition {% ([t,,c]) => ({...t, ...c}) %}

transition ->
    transitionHeader {% ([transition]) => ({type: 'Transition', ...transition}) %}

onEntry ->
    "entering" {% () => ({type: 'OnEntry'}) %}

onExit ->
    "leaving" {% () => ({type: 'OnExit'}) %}

