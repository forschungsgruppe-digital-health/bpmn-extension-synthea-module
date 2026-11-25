// The contract between validation and conversion: everything the converter rejects, the lint (the
// validation that runs before it, and live in the modeler) has to report too, with the same code.
// Each case is a diagram with one mistake. The test converts it for real, then lints it, and checks
// that every converter error shows up in the lint report. It also checks that the lint leaves the
// model alone: the modeler lints the model the user is editing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert } from '../src/converter/convert.mjs';
import BpmnModdle from 'bpmn-moddle';
import { descriptor } from '../src/converter/parse.mjs';
import { lintReports, linter, rc } from './lint-helper.mjs';
import { wrap, start, end, task, flow, gateway, stateType, prob, cond, attrCond, coding, SNOMED } from './helpers.mjs';

// Converter codes the lint reports under another rule, or cannot report from one file.
const NOT_FROM_CONVERTER_RULE = new Set(['STATE_NAME_DUPLICATE', 'TRANSITION_NO_FALLBACK', 'INITIAL_WITHOUT_WAIT', 'SUBMODULE_NOT_FOUND', 'SUBMODULE_CYCLE']);

const mid = (...names) => names.join('');
const simple = (id) => task(id, id, stateType('Simple'));

const CASES = {
  'unknown state type': wrap(mid(start(), task('A', 'A', stateType('Bogus')), end(), flow('f1', 'S', 'A'), flow('f2', 'A', 'E'))),
  'procedure without a code': wrap(mid(start(), task('A', 'A', stateType('Procedure')), end(), flow('f1', 'S', 'A'), flow('f2', 'A', 'E'))),
  'two start events': wrap(mid(start('S'), start('S2'), simple('A'), end(), flow('f1', 'S', 'A'), flow('f2', 'S2', 'A'), flow('f3', 'A', 'E'))),
  'boundary event': wrap(mid(
    start(), simple('A'), end(), '<bpmn2:boundaryEvent id="B" name="B" attachedToRef="A"><bpmn2:timerEventDefinition/></bpmn2:boundaryEvent>',
    flow('f1', 'S', 'A'), flow('f2', 'A', 'E')
  )),
  'loop marker': wrap(mid(
    start(), '<bpmn2:task id="A" name="A"><bpmn2:extensionElements>' + stateType('Simple') + '</bpmn2:extensionElements><bpmn2:standardLoopCharacteristics/></bpmn2:task>',
    end(), flow('f1', 'S', 'A'), flow('f2', 'A', 'E')
  )),
  'probabilities and conditions on one element': wrap(mid(
    start(), simple('A'), simple('B'), simple('C'), end(),
    flow('f1', 'S', 'A'), flow('f2', 'A', 'B', prob(0.5)), flow('f3', 'A', 'C', cond(attrCond('x', '==', '1'))),
    flow('f4', 'B', 'E'), flow('f5', 'C', 'E')
  )),
  'branches without condition or probability': wrap(mid(
    start(), simple('A'), simple('B'), simple('C'), end(),
    flow('f1', 'S', 'A'), flow('f2', 'A', 'B'), flow('f3', 'A', 'C'), flow('f4', 'B', 'E'), flow('f5', 'C', 'E')
  )),
  'condition without a type': wrap(mid(
    start(), gateway('G', 'G', 'f3'), simple('B'), simple('C'), end(),
    flow('f1', 'S', 'G'), flow('f2', 'G', 'B', cond('<synthea:condition/>')), flow('f3', 'G', 'C'), flow('f4', 'B', 'E'), flow('f5', 'C', 'E')
  )),
  'link throw without catch': wrap(mid(
    start(), '<bpmn2:intermediateThrowEvent id="L" name="L"><bpmn2:linkEventDefinition name="nowhere"/></bpmn2:intermediateThrowEvent>',
    flow('f1', 'S', 'L')
  )),
  'encounter group without an id': wrap(mid(
    start(),
    task('A', 'A', stateType('SetAttribute') + '<synthea:setAttributeConfig attribute="x" value="1"/><synthea:encounterContext requiresEncounterContext="true" encounterId=""/>'),
    end(), flow('f1', 'S', 'A'), flow('f2', 'A', 'E')
  )),
  'condition onset with an unknown target encounter': wrap(mid(
    start(),
    task('A', 'A', stateType('ConditionOnset') + coding(SNOMED, '1', 'x') + '<synthea:encounterReference targetEncounter="nowhere"/>'),
    end(), flow('f1', 'S', 'A'), flow('f2', 'A', 'E')
  ))
};

for (const [name, xml] of Object.entries(CASES)) {
  test(`the lint reports what the converter rejects: ${name}`, async () => {
    const { diagnostics } = await convert([{ path: 'case.bpmn', xml }], { strict: true });
    const errors = diagnostics.items.filter((i) => i.level === 'error' && !NOT_FROM_CONVERTER_RULE.has(i.code));
    assert.ok(errors.length, 'the case must be a real converter error, or it tests nothing');

    const reports = await lintReports(xml);
    const text = reports.map((r) => r.message).join('\n');
    for (const code of new Set(errors.map((e) => e.code))) {
      assert.match(text, new RegExp(`\\[${code}\\]`), `the converter says ${code}, the lint does not`);
    }
    // And the lint reports it as an error, so `validate` stops.
    assert.ok(reports.some((r) => r.category === 'error' && /\[[A-Z_]+\]/.test(r.message)));
  });
}

test('a diagram the converter accepts gets no converter error from the lint', async () => {
  const xml = wrap(mid(start(), simple('A'), end(), flow('f1', 'S', 'A'), flow('f2', 'A', 'E')));
  const { diagnostics } = await convert([{ path: 'case.bpmn', xml }], { strict: true });
  assert.equal(diagnostics.errorCount, 0);
  const reports = await lintReports(xml);
  assert.deepEqual(reports.filter((r) => r.category === 'error' && /\[[A-Z_]+\]/.test(r.message)), []);
});

test('a problem found after the conversion is reported on the BPMN element, not on the state name', async () => {
  // REQUIRED_FIELD_MISSING comes from the check of the finished state, which only knows its name.
  const xml = wrap(mid(start(), task('Activity_1', 'Chest X-Ray', stateType('Procedure')), end(), flow('f1', 'S', 'Activity_1'), flow('f2', 'Activity_1', 'E')));
  const report = (await lintReports(xml)).find((r) => r.message.includes('[REQUIRED_FIELD_MISSING]'));
  assert.ok(report, 'the missing field is reported');
  assert.equal(report.id, 'Activity_1');
});

test('the lint sees a change made to the same model after the first run (the modeler edits one live model)', async () => {
  const xml = wrap(mid(start(), task('A', 'A', stateType('Procedure') + coding(SNOMED, '399208008', 'x')), end(), flow('f1', 'S', 'A'), flow('f2', 'A', 'E')));
  const moddle = new BpmnModdle({ synthea: descriptor });
  const { rootElement } = await moddle.fromXML(xml);
  const lint = async () => {
    const results = await linter.lint(rootElement, rc);
    return Object.values(results).flat().filter((r) => r.category === 'error').length;
  };
  assert.equal(await lint(), 0);
  const config = rootElement.rootElements[0].flowElements.find((e) => e.id === 'A').extensionElements.values.find((v) => v.$type === 'synthea:StateTypeConfig');
  config.code = '';
  assert.equal(await lint(), 1);
});
