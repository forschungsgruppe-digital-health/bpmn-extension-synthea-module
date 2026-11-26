/**
 * Shows in the properties panel what the lint and the converter found on the selected element: all
 * of it in a list "Problems" at the top of the Synthea group, and a message under the field to change
 * where the message clearly belongs to one field. It uses the panel's own mechanism for this
 * (`propertiesPanel.setDiagnostics`, error / warning / info), the same one the medical terminology
 * extension uses for its errors, so the panel also marks the group.
 *
 * Sources: the lint of `bpmn-js-bpmnlint` (event `linting.completed`, only when the host registers it)
 * and the converter, whose messages the host hands over with `setConverterMessages` after a
 * conversion. Converter messages are dropped at the next change of the diagram, so an old result is
 * never shown for the current one. Every update fires `synthea.diagnostics.changed`, for hosts that
 * want to show the problems elsewhere.
 */
// No import of bpmn-js here, so the tests run in plain Node.
const is = (element, type) => !!element?.businessObject?.$instanceOf?.(type);

/** Fired after every update: `{ element, messages }` for the selected element (or `null`). */
export const DIAGNOSTICS_CHANGED_EVENT = 'synthea.diagnostics.changed';

/** The id of the "Problems" entry at the top of the Synthea group. */
export const PROBLEMS_ENTRY_ID = 'synthea-problems';

const LINT_SEVERITY = { error: 'error', warn: 'warning', warning: 'warning', info: 'info' };
const CONVERTER_SEVERITY = { error: 'error', warning: 'warning', note: 'info' };
const RANK = { info: 0, warning: 1, error: 2 };

// The two lint rules that run the converter's own checks put the converter's code in front of the
// message: "[REQUIRED_FIELD_MISSING] …".
const CODE_IN_MESSAGE = /^\[([A-Z][A-Z0-9_]*)\]\s*/;

const onFlow = (element) => is(element, 'bpmn:SequenceFlow');
const hasDelay = (element) => (element.businessObject?.extensionElements?.values || []).some((v) => v.$type === 'synthea:DelayConfig');

/**
 * Message (lint rule or converter code) -> the panel entry of the field to change: an entry id, or a
 * function of the element (and the message text) that returns one. Only where the message clearly
 * concerns one field of the element it is reported on; everything else is shown in the Problems list
 * only. A test checks that every entry exists in the panel and every key is a rule or a code.
 */
export const FIELD = {
  // lint rules
  'state-code-complete': 'synthea-code-value',
  'delay-requires-shape': 'synthea-delay-shape',
  'delay-range-requires-high-value': 'synthea-delay-value-high',
  'value-range-requires-high-value': 'synthea-value-high',
  'time-unit-valid': (element) => (hasDelay(element) ? 'synthea-delay-unit' : 'synthea-value-unit'),
  'counter-requires-action': 'synthea-counter-action',
  'set-attribute-requires-attribute': 'synthea-set-attribute-value',
  'callsubmodule-requires-submodule-config': 'synthea-submodule-ref',
  'guard-allow-requires-condition': 'synthea-guard-condition-type',
  'negate-requires-condition': (element) => (onFlow(element) ? 'synthea-condition-type' : 'synthea-guard-condition-type'),
  'encounter-code-complete-and-consistent': 'synthea-encounter-context-code',
  'encounter-class-consistent-within-encounter': 'synthea-encounter-context-class',
  'wellness-consistent-within-encounter': 'synthea-encounter-context-wellness',
  'encounter-reference-requires-condition-or-allergy-context': 'synthea-encounter-reference-value',
  'careplan-activity-requires-code-and-display': 'synthea-activity-code',
  'referenced-by-attribute-matches-assign': 'synthea-referenced-by-attribute-value',
  'gateway-branches-require-condition-or-probability': (element) => (onFlow(element) ? 'synthea-probability-kind' : undefined),
  'inclusive-branches-require-condition-or-probability': (element) => (onFlow(element) ? 'synthea-probability-kind' : undefined),
  'unique-element-names': 'name',
  // converter codes
  STATE_TYPE_UNKNOWN: 'synthea-state-type-value',
  STATE_TYPE_REQUIRED: 'synthea-state-type-value',
  STATE_TYPE_NOT_IMPLEMENTED: 'synthea-state-type-value',
  REQUIRED_FIELD_MISSING: (element, message) => (/\bcodes\b/.test(message) ? 'synthea-code-value' : 'synthea-state-type-value'),
  ENCOUNTER_ID_MISSING: 'synthea-encounter-context-id',
  ENCOUNTER_CODE_INCOMPLETE: 'synthea-encounter-context-code',
  ENCOUNTER_CODE_SYSTEM_UNKNOWN: 'synthea-encounter-context-code-system',
  ENCOUNTER_WELLNESS_CLASS: 'synthea-encounter-context-wellness',
  ENCOUNTER_DISCHARGE_INCOMPLETE: 'synthea-encounter-context-discharge-code',
  SUBMODULE_NOT_FOUND: 'synthea-submodule-ref',
  CONDITION_INVALID: (element) => (onFlow(element) ? 'synthea-condition-type' : 'synthea-guard-condition-type'),
  TRANSITION_PROBABILITY_MISSING: (element) => (onFlow(element) ? 'synthea-probability-value' : undefined),
  TRANSITION_PROBABILITY_EMPTY: (element) => (onFlow(element) ? 'synthea-probability-value' : undefined),
  TRANSITION_PROBABILITY_DEFAULT: (element) => (onFlow(element) ? 'synthea-probability-default' : undefined),
  TRANSITION_PROBABILITY_CONFLICT: (element) => (onFlow(element) ? 'synthea-probability-kind' : undefined),
  DOCUMENTATION_ONLY_NOT_ALLOWED: 'synthea-documentation-only-switch',
  DOCUMENTATION_ONLY_NEEDS_ONE_EXIT: 'synthea-documentation-only-switch',
  DOCUMENTATION_ONLY_HAS_CONFIG: 'synthea-documentation-only-switch',
  DOCUMENTATION_ONLY_LOOP: 'synthea-documentation-only-switch'
};

/**
 * The lint issues of `bpmn-js-bpmnlint` (`linting.completed`), per element id, as messages.
 *
 * @param {Object<string, {message: string, category: string, rule?: string}[]>} issues keyed by element id
 * @returns {Map<string, {source: string, severity: string, code: string, message: string}[]>} the messages per element id
 */
export function fromLintIssues(issues = {}) {
  const byElement = new Map();
  for (const [id, list] of Object.entries(issues)) {
    for (const issue of list || []) {
      const rule = String(issue.rule || '').replace(/^.*\//, '');
      const match = CODE_IN_MESSAGE.exec(issue.message || '');
      const message = {
        source: 'lint',
        severity: LINT_SEVERITY[issue.category] || 'error',
        code: match ? match[1] : rule,
        message: match ? issue.message.slice(match[0].length) : issue.message || ''
      };
      byElement.set(id, [...(byElement.get(id) || []), message]);
    }
  }
  return byElement;
}

/**
 * The messages of a conversion (`diagnostics.items` of `convert`), per element id. The converter names
 * an element by its id, or by the name of the state it became; `resolve` turns either into the id.
 * Messages that name no element of the diagram (a whole module, a state the converter made) are left
 * out: they have no place in the panel.
 *
 * @param {{level: string, code: string, message: string, element?: string}[]} items the converter's messages
 * @param {(ref: string) => string|undefined} [resolve] element id for an id or state name; by default the reference itself
 * @returns {Map<string, {source: string, severity: string, code: string, message: string}[]>} the messages per element id
 */
export function fromConverterItems(items = [], resolve = (ref) => ref) {
  const byElement = new Map();
  for (const item of items) {
    const id = item.element && resolve(item.element);
    if (!id) continue;
    const message = { source: 'converter', severity: CONVERTER_SEVERITY[item.level] || 'error', code: item.code, message: item.message };
    byElement.set(id, [...(byElement.get(id) || []), message]);
  }
  return byElement;
}

/**
 * The panel entry of the field a message is about, if it clearly concerns one.
 *
 * @param {{code: string, message: string}} message a lint or converter message
 * @param {object} element the diagram element it is reported on
 * @returns {string|undefined} the entry id, or undefined (then it is shown in the Problems list only)
 */
export function fieldOf(message, element) {
  const target = FIELD[message.code];
  return typeof target === 'function' ? target(element, message.message) : target;
}

/**
 * The diagnostics for `propertiesPanel.setDiagnostics`: each message under its field, the most
 * severe first, and every message in the Problems entry, so the panel marks the Synthea group too.
 *
 * @param {{source: string, severity: string, code: string, message: string}[]} messages the messages of one element
 * @param {object} element the diagram element
 * @returns {Object<string, {severity: string, message: string}[]>} diagnostics keyed by entry id
 */
export function toPanelDiagnostics(messages, element) {
  const diagnostics = {};
  const sorted = [...messages].sort((a, b) => RANK[b.severity] - RANK[a.severity]);
  for (const m of sorted) {
    const id = fieldOf(m, element);
    if (id) (diagnostics[id] ||= []).push({ severity: m.severity, message: m.message });
  }
  if (sorted.length) diagnostics[PROBLEMS_ENTRY_ID] = sorted.map((m) => ({ severity: m.severity, message: m.message }));
  return diagnostics;
}

/**
 * The service `syntheaDiagnostics`: collects the lint and converter messages and puts those of the
 * selected element into the properties panel.
 *
 * @param {object} eventBus the bpmn-js event bus (injected)
 * @param {object} selection the bpmn-js selection (injected)
 * @param {object} elementRegistry the bpmn-js element registry (injected)
 */
export default function SyntheaDiagnostics(eventBus, selection, elementRegistry) {
  let lint = new Map();
  let converter = new Map();

  const selected = () => {
    const list = selection.get();
    return list.length === 1 ? list[0] : null;
  };

  /**
   * The lint and converter messages of one element.
   *
   * @param {string} id the element id
   * @returns {{source: string, severity: string, code: string, message: string}[]} lint first, then converter
   */
  this.messagesFor = (id) => [...(lint.get(id) || []), ...(converter.get(id) || [])];

  const update = () => {
    const element = selected();
    const messages = element ? this.messagesFor(element.id) : [];
    // a new map re-renders the panel, and with it the Problems entry, which reads messagesFor
    eventBus.fire('propertiesPanel.setDiagnostics', { diagnostics: element ? toPanelDiagnostics(messages, element) : {} });
    eventBus.fire(DIAGNOSTICS_CHANGED_EVENT, { element, messages });
  };

  /**
   * The diagram element a converter message names: by its id, or by the name of the state it became
   * (the element's name; the lint keeps names unique, SYN-34).
   *
   * @param {string} ref an element id or a state name
   * @returns {string|undefined} the element id, or undefined when no element of the diagram fits
   */
  this.resolve = (ref) => {
    if (elementRegistry.get(ref)) return ref;
    const named = elementRegistry.filter((e) => e.type !== 'label' && (e.businessObject?.name || '').trim() === ref.trim());
    return named.length === 1 ? named[0].id : undefined;
  };

  /**
   * Shows the messages of a conversion until the next change of the diagram.
   *
   * @param {{level: string, code: string, message: string, element?: string}[]} items `diagnostics.items` of `convert`
   */
  this.setConverterMessages = (items) => {
    converter = fromConverterItems(items, this.resolve);
    update();
  };

  /** Removes the messages of the last conversion. */
  this.clearConverterMessages = () => {
    if (!converter.size) return;
    converter = new Map();
    update();
  };

  eventBus.on('linting.completed', ({ issues }) => {
    lint = fromLintIssues(issues);
    update();
  });
  eventBus.on('commandStack.changed', () => {
    this.clearConverterMessages();
  });
  eventBus.on('import.done', () => {
    lint = new Map();
    converter = new Map();
    update();
  });
  // after the panel has switched to another element, or redrawn the same one after a change. A
  // listener must not return a value: the event bus would stop the event there, before the panel.
  const later = () => {
    setTimeout(update, 0);
  };
  eventBus.on('selection.changed', later);
  eventBus.on('propertiesPanel.updated', later);
}

SyntheaDiagnostics.$inject = ['eventBus', 'selection', 'elementRegistry'];
