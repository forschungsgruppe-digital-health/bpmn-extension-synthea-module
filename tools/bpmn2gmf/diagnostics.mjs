// Collects problems found during a conversion. Errors prevent a module from
// being written; warnings and notes are informational.
export class Diagnostics {
  constructor() {
    this.items = [];
  }

  add(level, code, message, where = {}) {
    this.items.push({ level, code, message, ...where });
  }

  error(code, message, where) {
    this.add('error', code, message, where);
  }

  warn(code, message, where) {
    this.add('warning', code, message, where);
  }

  note(code, message, where) {
    this.add('note', code, message, where);
  }

  get errorCount() {
    return this.items.filter((i) => i.level === 'error').length;
  }

  forModule(module) {
    return this.items.filter((i) => i.module === module);
  }

  format() {
    return this.items.map((i) => {
      const where = [i.module, i.element].filter(Boolean).join(' / ');
      const label = i.label ? ` "${i.label}"` : '';
      return `${i.level.toUpperCase().padEnd(7)} ${i.code}${where ? ` [${where}${label}]` : ''}: ${i.message}`;
    });
  }
}
