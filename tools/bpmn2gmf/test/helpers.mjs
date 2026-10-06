import { convert } from '../convert.mjs';

const NS =
  'xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
  'xmlns:synthea="https://forschungsgruppe-digital-health.github.io/schema/synthea/1.0" ' +
  'xmlns:fhirmap="https://forschungsgruppe-digital-health.github.io/schema/fhirmap/1.0" ' +
  'xmlns:term="https://forschungsgruppe-digital-health.github.io/schema/terminology/1.0"';

export const wrap = (body, name = 'Test Module') =>
  `<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions ${NS} id="d" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn2:process id="P" name="${name}">${body}</bpmn2:process>
</bpmn2:definitions>`;

const ext = (inner) => (inner ? `<bpmn2:extensionElements>${inner}</bpmn2:extensionElements>` : '');

export const start = (id = 'S') => `<bpmn2:startEvent id="${id}" name="Initial"/>`;
export const end = (id = 'E', name = 'Terminal') => `<bpmn2:endEvent id="${id}" name="${name}"/>`;
export const task = (id, name, inner) => `<bpmn2:task id="${id}" name="${name}">${ext(inner)}</bpmn2:task>`;
export const gateway = (id, name, def) =>
  `<bpmn2:exclusiveGateway id="${id}" name="${name}"${def ? ` default="${def}"` : ''}/>`;
export const timer = (id, name, inner) =>
  `<bpmn2:intermediateCatchEvent id="${id}" name="${name}">${ext(inner)}<bpmn2:timerEventDefinition/></bpmn2:intermediateCatchEvent>`;
export const call = (id, name, submodule) =>
  `<bpmn2:callActivity id="${id}" name="${name}">${ext(`<synthea:submoduleConfig submodule="${submodule}"/>`)}</bpmn2:callActivity>`;
export const flow = (id, from, to, inner) =>
  `<bpmn2:sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}">${ext(inner)}</bpmn2:sequenceFlow>`;

export const stateType = (t) => `<synthea:stateTypeConfig stateType="${t}"/>`;
export const setAttr = (attribute, value) =>
  `${stateType('SetAttribute')}<synthea:setAttributeConfig attribute="${attribute}" value="${value}"/>`;
export const prob = (p) => `<synthea:probabilityConfig probability="${p}"/>`;
export const cond = (inner) => `<synthea:conditionConfig>${inner}</synthea:conditionConfig>`;
export const attrCond = (attribute, operator, value, extra = '') =>
  `<synthea:condition conditionType="Attribute" attribute="${attribute}" operator="${operator}"${value === undefined ? '' : ` value="${value}"`}${extra}/>`;

export const coding = (system, code, display) => `<term:coding system="${system}" code="${code}" display="${display}"/>`;
export const SNOMED = 'http://snomed.info/sct';
export const LOINC = 'http://loinc.org';
export const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';

// Converts one diagram; returns the single module result and all diagnostics.
export async function run(body, { path = 'test.bpmn', name, strict = false } = {}) {
  const { modules, diagnostics } = await convert([{ path, xml: wrap(body, name) }], { strict });
  return { module: modules[0], diagnostics, codes: diagnostics.items.map((i) => i.code) };
}
