// The rules that check the values in the fields (SYN-38 to SYN-41): each reports a wrong value and
// stays quiet for a right one. Values and limits come from the Synthea wiki (Generic Module
// Framework: Basics, Logic, States), see the comment at the top of each rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrap, start, end, task, timer, flow, gateway, stateType, cond, coding, SNOMED, LOINC } from './helpers.mjs';
import { lintReports } from './lint-helper.mjs';

const delay = (unit, extra = '') => `<synthea:delayConfig delayShape="EXACT" delayValue="1" delayUnit="${unit}" ${extra}/>`;
const withTimer = (inner) => wrap(start() + timer('T', 'T', stateType('Delay') + inner) + end() + flow('f1', 'S', 'T') + flow('f2', 'T', 'E'));
const withGateway = (condition) =>
  wrap(
    start() + gateway('G', 'G', 'f3') + task('B', 'B', stateType('Simple')) + task('C', 'C', stateType('Simple')) + end() +
    flow('f1', 'S', 'G') + flow('f2', 'G', 'B', cond(condition)) + flow('f3', 'G', 'C') + flow('f4', 'B', 'E') + flow('f5', 'C', 'E')
  );
const withState = (inner) => wrap(start() + task('A', 'A', inner) + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E'));

async function reported(xml, rule) {
  return (await lintReports(xml)).filter((r) => r.rule === `synthea/${rule}`).map((r) => r.message);
}

test('time-unit-valid: a unit that is not a unit of time', async () => {
  assert.match((await reported(withTimer(delay('day')), 'time-unit-valid'))[0], /"day".*not a unit of time/);
  assert.match((await reported(withTimer(delay('Days')), 'time-unit-valid'))[0], /lower case: "days"/);
  assert.match((await reported(withTimer(delay('milliseconds')), 'time-unit-valid'))[0], /milliseconds/);
});

test('time-unit-valid: every unit of the wiki is accepted', async () => {
  for (const unit of ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds']) {
    assert.deepEqual(await reported(withTimer(delay(unit)), 'time-unit-valid'), [], unit);
  }
});

test('time-unit-valid: the unit of an Age condition, a Death value and a prescription', async () => {
  assert.equal((await reported(withGateway('<synthea:condition conditionType="Age" operator="&gt;" quantity="5" unit="yrs"/>'), 'time-unit-valid')).length, 1);
  assert.equal((await reported(withState(stateType('Death') + '<synthea:valueConfig valueShape="EXACT" value="3" unit="year"/>'), 'time-unit-valid')).length, 1);
  assert.equal((await reported(withState(stateType('MedicationOrder') + '<synthea:prescriptionConfig dosageUnit="day" durationUnit="weeks"/>'), 'time-unit-valid')).length, 1);
});

test('time-unit-valid: the unit of an Observation value is a unit of measurement and is not checked', async () => {
  assert.deepEqual(await reported(withState(stateType('Observation') + '<synthea:valueConfig valueShape="EXACT" value="5" unit="mg/dL"/>'), 'time-unit-valid'), []);
});

test('condition-values-valid: operator, gender and the bounds of At Least', async () => {
  assert.match((await reported(withGateway('<synthea:condition conditionType="Age" operator="=" quantity="5" unit="years"/>'), 'condition-values-valid'))[0], /operator "=" is not valid/);
  assert.match((await reported(withGateway('<synthea:condition conditionType="Gender" gender="male"/>'), 'condition-values-valid'))[0], /gender "male" is not valid/);
  const atLeast = (minimum) =>
    `<synthea:condition conditionType="At Least" minimum="${minimum}"><synthea:conditions conditionType="Gender" gender="M"/><synthea:conditions conditionType="Gender" gender="F"/></synthea:condition>`;
  assert.match((await reported(withGateway(atLeast(3)), 'condition-values-valid'))[0], /between 1 and the number of sub-conditions \(2\)/);
  assert.deepEqual(await reported(withGateway(atLeast(2)), 'condition-values-valid'), []);
});

test('condition-values-valid: "is nil" is an operator of Attribute but not of Age', async () => {
  assert.deepEqual(await reported(withGateway('<synthea:condition conditionType="Attribute" attribute="x" operator="is nil"/>'), 'condition-values-valid'), []);
  assert.equal((await reported(withGateway('<synthea:condition conditionType="Age" operator="is nil" quantity="1" unit="years"/>'), 'condition-values-valid')).length, 1);
});

test('number-ranges-plausible: a probability above 1 and a range that runs backwards', async () => {
  const flows = (p) =>
    start() + task('A', 'A', stateType('Simple')) + task('B', 'B', stateType('Simple')) + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'B', `<synthea:probabilityConfig probability="${p}"/>`) + flow('f3', 'A', 'E') + flow('f4', 'B', 'E');
  assert.match((await reported(wrap(flows(1.5)), 'number-ranges-plausible'))[0], /probability is 1.5/);
  assert.deepEqual(await reported(wrap(flows(0.5)), 'number-ranges-plausible'), []);
  assert.match((await reported(withTimer('<synthea:delayConfig delayShape="RANGE" delayValue="5" delayValueHigh="2" delayUnit="days"/>'), 'number-ranges-plausible'))[0], /from 5 to 2/);
});

test('number-ranges-plausible: a Symptom value above 100 is accepted (Synthea\'s own lung cancer module uses 250)', async () => {
  assert.deepEqual(await reported(withState(stateType('Symptom') + '<synthea:symptomConfig symptom="Cough"/><synthea:valueConfig valueShape="EXACT" value="250"/>'), 'number-ranges-plausible'), []);
});

test('code-format-plausible: a code that cannot belong to its system', async () => {
  const code = (system, c) => withState(stateType('Procedure') + coding(system, c, 'x'));
  // coding() puts the first marker on the stateTypeConfig
  assert.match((await reported(code(SNOMED, '12a45'), 'code-format-plausible'))[0], /does not look like a SNOMED CT code/);
  assert.match((await reported(code(LOINC, '8480'), 'code-format-plausible'))[0], /LOINC/);
  assert.deepEqual(await reported(code(SNOMED, '399208008'), 'code-format-plausible'), []);
  assert.deepEqual(await reported(code(LOINC, '8480-6'), 'code-format-plausible'), []);
});

test('no-delay-after-death: a delay behind a Death state is reported, a Death at the end is not', async () => {
  const diagram = (lastIsDelay) =>
    wrap(
      start() + task('D', 'Death', stateType('Death')) +
      (lastIsDelay ? timer('T', 'Wait', stateType('Delay') + delay('days')) : task('X', 'After', stateType('Simple'))) +
      end() + flow('f1', 'S', 'D') + flow('f2', 'D', lastIsDelay ? 'T' : 'X') + flow('f3', lastIsDelay ? 'T' : 'X', 'E')
    );
  assert.match((await reported(diagram(true), 'no-delay-after-death'))[0], /"Wait" waits after this Death/);
  assert.deepEqual(await reported(diagram(false), 'no-delay-after-death'), []);
  assert.deepEqual(await reported(wrap(start() + task('D', 'Death', stateType('Death')) + end() + flow('f1', 'S', 'D') + flow('f2', 'D', 'E')), 'no-delay-after-death'), []);
});

test('observation-condition-needs-observation: a value read that nothing in the diagram records', async () => {
  const read = (operator) => `<synthea:condition conditionType="Observation" codeSystem="http://loinc.org" code="8480-6" codeDisplay="Systolic" operator="${operator}" value="140"/>`;
  assert.match((await reported(withGateway(read('&gt;')), 'observation-condition-needs-observation'))[0], /8480-6/);
  // "is nil" asks whether the observation exists: no observation needed
  assert.deepEqual(await reported(withGateway('<synthea:condition conditionType="Observation" codeSystem="http://loinc.org" code="8480-6" codeDisplay="x" operator="is nil"/>'), 'observation-condition-needs-observation'), []);
  // an Observation state with that code in the same diagram
  const recorded = wrap(
    start() + task('O', 'Measure', stateType('Observation') + coding(LOINC, '8480-6', 'Systolic')) + gateway('G', 'G', 'f4') + task('B', 'B', stateType('Simple')) + task('C', 'C', stateType('Simple')) + end() +
    flow('f1', 'S', 'O') + flow('f2', 'O', 'G') + flow('f3', 'G', 'B', cond(read('&gt;'))) + flow('f4', 'G', 'C') + flow('f5', 'B', 'E') + flow('f6', 'C', 'E')
  );
  assert.deepEqual(await reported(recorded, 'observation-condition-needs-observation'), []);
});
