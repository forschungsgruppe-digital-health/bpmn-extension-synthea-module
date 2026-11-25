/**
 * Stage 1: BPMN XML text -> moddle tree. Reads a string, not a file, so the same code runs in Node and
 * in the browser (the demo converts the open diagram on the client).
 */
import BpmnModdle from 'bpmn-moddle';
// A JSON import instead of readFileSync, so this file also runs in the browser
// (the demo converts the open diagram client-side).
import descriptor from '../../model/synthea.json' with { type: 'json' };

/**
 * The moddle descriptor of the `synthea:` extension (extension/model/synthea.json), re-exported for
 * the stages that need to know the types.
 */
export { descriptor };

// fhirmap:, term:, i18n: and cp: have no descriptor here on purpose: bpmn-moddle
// keeps unknown-namespace elements as generic elements whose attributes are
// plain properties, which is all the converter needs from them.
/**
 * Parses a BPMN XML string with the `synthea:` descriptor registered.
 *
 * @param {string} xml the text of a .bpmn file
 * @returns {Promise<{definitions: object, warnings: string[]}>} the root `bpmn:Definitions` element and the
 *   messages of what the parser could not place
 * @throws {Error} when the text is not well-formed XML
 */
export async function parseBpmn(xml) {
  const moddle = new BpmnModdle({ synthea: descriptor });
  const { rootElement, warnings } = await moddle.fromXML(xml);
  return { definitions: rootElement, warnings: warnings.map((w) => w.message) };
}
