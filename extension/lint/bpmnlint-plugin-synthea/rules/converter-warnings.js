const { reportAll } = require('../lib/converter-check');

/**
 * SYN-37 — converter-warnings.
 *
 * The converter's warnings: things it converts but that probably do not do what the author meant,
 * such as ignored configuration, a condition fallback that is not the default flow, a timing or
 * encounter order that Synthea will not accept as drawn. Same messages and codes as SYN-36, as a
 * warning. Notes (information only) are not reported.
 */
module.exports = reportAll('warning');
