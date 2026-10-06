import { readFileSync } from 'node:fs';
import BpmnModdle from 'bpmn-moddle';

export const descriptor = JSON.parse(
  readFileSync(new URL('../../extension/model/synthea.json', import.meta.url))
);

// fhirmap:, term:, i18n: and cp: have no descriptor here on purpose: bpmn-moddle
// keeps unknown-namespace elements as generic elements whose attributes are
// plain properties, which is all the converter needs from them.
export async function parseBpmn(xml) {
  const moddle = new BpmnModdle({ synthea: descriptor });
  const { rootElement, warnings } = await moddle.fromXML(xml);
  return { definitions: rootElement, warnings: warnings.map((w) => w.message) };
}
