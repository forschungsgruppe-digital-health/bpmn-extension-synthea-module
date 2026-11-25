// Bridge to the converter's own checks (extension/src/converter). The converter knows exactly what it can turn
// into a Synthea module and what it cannot; asking it from the lint means the diagram is checked
// against the same rules before anyone converts it, with no second copy of them to keep in sync.
//
// The lint plugin is not part of the published package (the converter is, in extension/src/converter).
// If the converter cannot be loaded, the two rules that use this bridge fail loudly instead of silently
// checking nothing; leave them out of the configuration there (`plugin:synthea/all` includes them).

// Codes another lint rule already owns, so a problem is not reported twice.
const OWNED_BY_OTHER_RULE = new Set([
  'STATE_NAME_DUPLICATE', // unique-element-names (SYN-34)
  'TRANSITION_NO_FALLBACK', // exclusive-gateway-requires-default-flow (SYN-35)
  // Needs to know whether another module calls this one, which one file cannot tell: a sub-module
  // entered by a call legitimately starts right after Initial.
  'INITIAL_WITHOUT_WAIT'
]);

let checkDefinitions;

function load() {
  if (!checkDefinitions) {
    try {
      // require() of an ES module: Node >= 22.12 (bundlers resolve it statically).
      ({ checkDefinitions } = require('../../../src/converter/convert.mjs'));
    } catch (err) {
      throw new Error(`the converter (extension/src/converter) cannot be loaded, so the converter checks cannot run: ${err.message}`);
    }
  }
  return checkDefinitions;
}

// One conversion per rule and lint run (the check runs once, on the Definitions node). No cache
// across runs: the modeler lints the model the user is editing, which is the same object each time.
function problemsOf(definitions) {
  return load()(definitions).filter((i) => i.level !== 'note' && !OWNED_BY_OTHER_RULE.has(i.code));
}

// The checks after the conversion name a state, not a BPMN element: the element is the state name
// (the label). Finds the element id again, so the problem lands on the element in the modeler.
function idsByName(definitions) {
  const byName = new Map();
  const visit = (container) => {
    for (const el of container.flowElements || []) {
      if (el.name) {
        byName.set(el.name, byName.has(el.name) ? null : el.id); // null: two elements, no clear answer
      }
      if (el.flowElements) {
        visit(el);
      }
    }
  };
  for (const root of definitions.rootElements || []) {
    if (root.$type === 'bpmn:Process') {
      visit(root);
    }
  }
  return byName;
}

function reportAll(level) {
  return function() {
    function check(node, reporter) {
      if (!node || node.$type !== 'bpmn:Definitions') {
        return;
      }
      const fallback = (node.rootElements || []).find((e) => e.$type === 'bpmn:Process');
      const names = idsByName(node);
      const known = (id) => id && exists(node, id);

      for (const item of problemsOf(node).filter((i) => i.level === level)) {
        const id = (known(item.element) && item.element) || names.get(item.element) || (fallback && fallback.id) || node.id;
        const label = item.label ? ` "${item.label}"` : '';
        reporter.report(id, `[${item.code}]${label} ${item.message}`);
      }
    }
    return { check };
  };
}

// Is there a flow element, sequence flow or process with this id?
function exists(definitions, id) {
  const stack = [ ...(definitions.rootElements || []) ];

  while (stack.length) {
    const el = stack.pop();

    if (el.id === id) {
      return true;
    }
    stack.push(...(el.flowElements || []));
  }
  return false;
}

module.exports = { reportAll };
