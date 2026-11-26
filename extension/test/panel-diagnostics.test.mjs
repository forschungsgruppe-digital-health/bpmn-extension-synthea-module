// The lint and converter messages in the properties panel (extension/src/SyntheaDiagnostics.js): how
// they are read, which field they go to, and that the service keeps the panel's own listeners working.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import SyntheaDiagnostics, {
  FIELD,
  PROBLEMS_ENTRY_ID,
  DIAGNOSTICS_CHANGED_EVENT,
  fromLintIssues,
  fromConverterItems,
  fieldOf,
  toPanelDiagnostics
} from '../src/SyntheaDiagnostics.js';

const root = resolve(import.meta.dirname, '../..');
const element = (type) => ({ id: 'X', businessObject: { $instanceOf: (t) => t === type } });
const flow = element('bpmn:SequenceFlow');
const task = element('bpmn:Task');

test('lint issues: the rule without its plugin prefix, warn is a warning, the converter code from the message', () => {
  const byElement = fromLintIssues({
    Task_1: [
      { rule: 'synthea/state-code-complete', category: 'error', message: 'stateTypeConfig is missing code' },
      { rule: 'synthea/converter-warnings', category: 'warn', message: '[INITIAL_WITHOUT_WAIT] runs at birth' }
    ]
  });
  assert.deepEqual(byElement.get('Task_1'), [
    { source: 'lint', severity: 'error', code: 'state-code-complete', message: 'stateTypeConfig is missing code' },
    { source: 'lint', severity: 'warning', code: 'INITIAL_WITHOUT_WAIT', message: 'runs at birth' }
  ]);
});

test('converter messages: an element named by id or by state name, notes are infos, the rest is left out', () => {
  const ids = { Task_1: 'Task_1', 'Diagnosis: Anemia': 'Task_2' };
  const byElement = fromConverterItems([
    { level: 'error', code: 'REQUIRED_FIELD_MISSING', message: 'missing codes', element: 'Diagnosis: Anemia' },
    { level: 'note', code: 'LINK_RESOLVED', message: 'joined', element: 'Task_1' },
    { level: 'warning', code: 'DISTRIBUTION_SUM', message: 'sum', element: 'Simple_made_by_converter' },
    { level: 'error', code: 'NO_PROCESS', message: 'no process' }
  ], (ref) => ids[ref]);
  assert.deepEqual([...byElement.keys()], ['Task_2', 'Task_1']);
  assert.equal(byElement.get('Task_1')[0].severity, 'info');
  assert.equal(byElement.get('Task_2')[0].source, 'converter');
});

test('a message goes under its field, the most severe first, and every message into the Problems entry', () => {
  const messages = [
    { source: 'lint', severity: 'warning', code: 'unique-element-names', message: 'name twice' },
    { source: 'converter', severity: 'error', code: 'REQUIRED_FIELD_MISSING', message: 'missing field(s) Synthea needs: codes.' },
    { source: 'lint', severity: 'error', code: 'probability-sum-valid', message: 'sum above 1' }
  ];
  const diagnostics = toPanelDiagnostics(messages, task);
  assert.deepEqual(diagnostics.name, [{ severity: 'warning', message: 'name twice' }]);
  assert.deepEqual(diagnostics['synthea-code-value'], [{ severity: 'error', message: 'missing field(s) Synthea needs: codes.' }]);
  assert.deepEqual(diagnostics[PROBLEMS_ENTRY_ID].map((d) => d.severity), ['error', 'error', 'warning']);
  assert.equal(Object.keys(diagnostics).length, 3, 'probability-sum-valid has no field on the gateway');
  assert.deepEqual(toPanelDiagnostics([], task), {});
});

test('the field depends on the element where the message can concern a flow or a gateway', () => {
  assert.equal(fieldOf({ code: 'CONDITION_INVALID', message: '' }, flow), 'synthea-condition-type');
  assert.equal(fieldOf({ code: 'CONDITION_INVALID', message: '' }, element('bpmn:ExclusiveGateway')), 'synthea-guard-condition-type');
  assert.equal(fieldOf({ code: 'TRANSITION_PROBABILITY_MISSING', message: '' }, task), undefined);
  assert.equal(fieldOf({ code: 'REQUIRED_FIELD_MISSING', message: 'needs: exact, range' }, task), 'synthea-state-type-value');
});

test('every field of the table is an entry of the panel, every key a lint rule or a converter code', () => {
  const provider = readFileSync(join(root, 'extension/src/SyntheaPropertiesProvider.js'), 'utf8');
  const rules = new Set(readdirSync(join(root, 'extension/lint/bpmnlint-plugin-synthea/rules')).map((f) => f.replace(/\.js$/, '')));
  const converterDir = join(root, 'extension/src/converter');
  const converter = readdirSync(converterDir).filter((f) => f.endsWith('.mjs')).map((f) => readFileSync(join(converterDir, f), 'utf8')).join('\n');
  for (const [key, target] of Object.entries(FIELD)) {
    assert.ok(rules.has(key) || converter.includes(`'${key}'`), `${key} is neither a lint rule nor a converter code`);
    const ids = typeof target === 'function'
      ? [flow, task, element('bpmn:ExclusiveGateway')].map((e) => target(e, 'codes'))
      : [target];
    for (const id of ids.filter(Boolean)) {
      assert.ok(id === 'name' || provider.includes(`'${id}'`), `${key}: no panel entry ${id}`);
    }
  }
});

function fakeModeler(selected) {
  const listeners = {};
  const fired = [];
  const eventBus = {
    on(name, priorityOrFn, fn) {
      (listeners[name] ||= []).push(typeof priorityOrFn === 'function' ? priorityOrFn : fn);
    },
    fire(name, data) {
      fired.push([name, data]);
      for (const l of listeners[name] || []) assert.equal(l(data), undefined, `a listener of ${name} returned a value and would stop the event`);
    }
  };
  const elements = { [selected.id]: selected };
  const elementRegistry = {
    get: (id) => elements[id],
    filter: (fn) => Object.values(elements).filter(fn)
  };
  const selection = { get: () => [selected] };
  return { eventBus, elementRegistry, selection, fired };
}

test('the service puts the lint of the selected element into the panel and drops converter messages at a change', async () => {
  const selected = { id: 'Task_1', type: 'bpmn:Task', businessObject: { name: 'Diagnosis: Anemia', $instanceOf: (t) => t === 'bpmn:Task' } };
  const { eventBus, elementRegistry, selection, fired } = fakeModeler(selected);
  const service = new SyntheaDiagnostics(eventBus, selection, elementRegistry);

  eventBus.fire('linting.completed', { issues: { Task_1: [{ rule: 'synthea/state-code-complete', category: 'error', message: 'missing code' }] } });
  const panel = fired.filter(([name]) => name === 'propertiesPanel.setDiagnostics').at(-1)[1].diagnostics;
  assert.deepEqual(panel['synthea-code-value'], [{ severity: 'error', message: 'missing code' }]);

  service.setConverterMessages([{ level: 'warning', code: 'INITIAL_WITHOUT_WAIT', message: 'at birth', element: 'Diagnosis: Anemia' }]);
  assert.equal(service.messagesFor('Task_1').length, 2);
  const changed = fired.filter(([name]) => name === DIAGNOSTICS_CHANGED_EVENT).at(-1)[1];
  assert.equal(changed.messages.length, 2);

  eventBus.fire('commandStack.changed', {});
  assert.deepEqual(service.messagesFor('Task_1').map((m) => m.source), ['lint']);

  // the panel listens to the same events: none of ours may stop them
  eventBus.fire('selection.changed', {});
  eventBus.fire('propertiesPanel.updated', {});
  await new Promise((r) => setTimeout(r, 0));
});
