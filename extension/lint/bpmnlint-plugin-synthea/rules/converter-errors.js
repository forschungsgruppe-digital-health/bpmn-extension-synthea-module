const { reportAll } = require('../lib/converter-check');

/**
 * SYN-36 — converter-errors.
 *
 * Reports what the converter (tools/bpmn2gmf) would reject: a state type it cannot determine, a
 * field Synthea requires that is missing, an element GMF has no equivalent for (boundary events,
 * loop markers), unstructured parallel or inclusive gateways, mixed probabilities and conditions,
 * an encounter that cannot be formed, and more. Every message starts with the converter's code,
 * e.g. [REQUIRED_FIELD_MISSING]; docs/converter-overview.md and the Messages tab of the demo explain
 * each one. The diagram is therefore valid for the conversion before the conversion runs.
 *
 * Not checked here: that called sub-modules exist (they are other files; the converter checks it).
 */
module.exports = reportAll('error');
