import BpmnModdle from 'bpmn-moddle';
// A JSON import instead of readFileSync, so this file also runs in the browser
// (the demo converts the open diagram client-side).
import descriptor from '../../extension/model/synthea.json' with { type: 'json' };

export { descriptor };

// fhirmap:, term:, i18n: and cp: have no descriptor here on purpose: bpmn-moddle
// keeps unknown-namespace elements as generic elements whose attributes are
// plain properties, which is all the converter needs from them.
export async function parseBpmn(xml) {
  const moddle = new BpmnModdle({ synthea: descriptor });
  const { rootElement, warnings } = await moddle.fromXML(xml);
  return { definitions: rootElement, warnings: warnings.map((w) => w.message) };
}
