/**
 * Replace menu filter: takes out of the replace menu everything the converter does not accept or
 * cannot tell apart (extension/src/converter/ir.mjs: REJECTED, BOUNDARY_EVENT_UNSUPPORTED, kindOf):
 *
 * - the complex and event-based gateway, transactions, ad-hoc and event sub-processes, the boundary
 *   events, and the loop / multi-instance markers (LOOP_MARKER_UNSUPPORTED) are rejected;
 * - the typed tasks (user, service, send, receive, manual, business rule, script) are all the same
 *   state to the converter (`kindOf`: any `bpmn:Task`), so only the plain task stays;
 * - a start or end event with an event definition (message, timer, conditional, signal, error,
 *   escalation, compensation, terminate) is still just the start or end of the module; the
 *   definition changes nothing, so only the plain one stays;
 * - the intermediate events that give no state type (message, signal, conditional, escalation,
 *   compensation) are not offered: the converter asks for an explicit state type for them. The
 *   plain, the timer (a `Delay`) and the link event (resolved into a flow) stay;
 * - a flow with a BPMN condition expression: the converter does not read it (the condition or the
 *   probability of the flow is a `synthea:` setting).
 *
 * The parallel and the inclusive gateway are offered: a split and its join are rewritten
 * (extension/src/converter/gateways.mjs).
 */
export const UNSUPPORTED_ENTRIES = [
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
  ].map((kind) => `replace-with-${kind}-boundary`),
  ...['user', 'service', 'send', 'receive', 'manual', 'rule', 'script'].map((kind) => `replace-with-${kind}-task`),
  'replace-with-message-start',
  'replace-with-timer-start',
  'replace-with-conditional-start',
  'replace-with-signal-start',
  ...['message', 'escalation', 'error', 'compensation', 'signal', 'terminate'].map((kind) => `replace-with-${kind}-end`),
  ...['message-intermediate-catch', 'message-intermediate-throw', 'escalation-intermediate-throw',
    'conditional-intermediate-catch', 'compensation-intermediate-throw', 'signal-intermediate-catch',
    'signal-intermediate-throw'].map((kind) => `replace-with-${kind}`),
  'replace-with-conditional-flow'
];

// The loop / multi-instance toggles sit in the header of the menu, not in its list.
const UNSUPPORTED_HEADER_ENTRIES = ['toggle-parallel-mi', 'toggle-sequential-mi', 'toggle-loop'];

// Below bpmn-js's own replace menu (default priority 1000), so its entries exist when this runs.
const PRIORITY = 100;

/**
 * Registers the filter as a provider of the replace menu, after bpmn-js's own provider, so the
 * entries it removes exist by then.
 *
 * @param {import('diagram-js/lib/features/popup-menu/PopupMenu').default} popupMenu the popup menu service (injected)
 */
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
