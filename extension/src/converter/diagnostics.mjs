/**
 * Collects problems found during a conversion. Errors prevent a module from
 * being written; warnings and notes are informational.
 */
export class Diagnostics {
  constructor() {
    /** @type {{level: string, code: string, message: string, module?: string, element?: string, label?: string}[]} */
    this.items = [];
  }

  /**
   * Records one message.
   *
   * @param {'error'|'warning'|'note'} level how serious it is
   * @param {string} code the stable code of the message, e.g. `REQUIRED_FIELD_MISSING`
   * @param {string} message what is wrong and what to change
   * @param {{module?: string, element?: string, label?: string}} [where] the file, element id and label it concerns
   */
  add(level, code, message, where = {}) {
    this.items.push({ level, code, message, ...where });
  }

  /** Records an error: the module it concerns is not written. @param {string} code @param {string} message @param {object} [where] */
  error(code, message, where) {
    this.add('error', code, message, where);
  }

  /** Records a warning. @param {string} code @param {string} message @param {object} [where] */
  warn(code, message, where) {
    this.add('warning', code, message, where);
  }

  /** Records a note. @param {string} code @param {string} message @param {object} [where] */
  note(code, message, where) {
    this.add('note', code, message, where);
  }

  /** The number of errors recorded so far. @returns {number} */
  get errorCount() {
    return this.items.filter((i) => i.level === 'error').length;
  }

  /**
   * The messages of one module.
   *
   * @param {string} module the file base name of the module
   * @returns {object[]} the items whose `module` is that name
   */
  forModule(module) {
    return this.items.filter((i) => i.module === module);
  }

  /** One readable line per message: level, code, where, text. @returns {string[]} */
  format() {
    return this.items.map((i) => {
      const where = [i.module, i.element].filter(Boolean).join(' / ');
      const label = i.label ? ` "${i.label}"` : '';
      return `${i.level.toUpperCase().padEnd(7)} ${i.code}${where ? ` [${where}${label}]` : ''}: ${i.message}`;
    });
  }
}
