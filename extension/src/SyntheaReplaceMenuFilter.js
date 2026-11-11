// What the converter does not accept (tools/bpmn2gmf/ir.mjs: REJECTED and
// BOUNDARY_EVENT_UNSUPPORTED) is not offered in the replace menu: the complex and event-based
// gateway, transactions, ad-hoc and event sub-processes, the boundary events, and the
// loop / multi-instance markers (the converter reports them as LOOP_MARKER_UNSUPPORTED).
// The parallel and the inclusive gateway are offered: a split and its join are rewritten
// (tools/bpmn2gmf/gateways.mjs).
const UNSUPPORTED_ENTRIES = [
  'replace-with-complex-gateway',
  'replace-with-event-based-gateway',
  'replace-with-transaction',
  'replace-with-event-subprocess',
  'replace-with-ad-hoc-subprocess',
  'replace-with-collapsed-ad-hoc-subprocess',
  ...[
    'message', 'timer', 'escalation', 'conditional', 'error', 'cancel', 'signal', 'compensation',
    'non-interrupting-message', 'non-interrupting-timer', 'non-interrupting-escalation',
    'non-interrupting-conditional', 'non-interrupting-signal'
  ].map((kind) => `replace-with-${kind}-boundary`)
];

// The loop / multi-instance toggles sit in the header of the menu, not in its list.
const UNSUPPORTED_HEADER_ENTRIES = ['toggle-parallel-mi', 'toggle-sequential-mi', 'toggle-loop'];

// Below bpmn-js's own replace menu (default priority 1000), so its entries exist when this runs.
const PRIORITY = 100;

export default function SyntheaReplaceMenuFilter(popupMenu) {
  popupMenu.registerProvider('bpmn-replace', PRIORITY, this);
}

SyntheaReplaceMenuFilter.$inject = ['popupMenu'];

SyntheaReplaceMenuFilter.prototype.getPopupMenuEntries = function () {
  return function (entries) {
    for (const id of UNSUPPORTED_ENTRIES) {
      delete entries[id];
    }

    return entries;
  };
};

SyntheaReplaceMenuFilter.prototype.getPopupMenuHeaderEntries = function () {
  return function (entries) {
    for (const id of UNSUPPORTED_HEADER_ENTRIES) {
      delete entries[id];
    }

    return entries;
  };
};
