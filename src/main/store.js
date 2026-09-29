const fs = require('fs');
const path = require('path');

/**
 * A JSON document kept in memory and written to disk with a debounce.
 * Writes go to a temp file first and are then renamed so a crash never
 * leaves a half-written file behind.
 */
class JsonFile {
  constructor(file, defaults, { delay = 400 } = {}) {
    this.file = file;
    this.delay = delay;
    this.timer = null;
    this.data = this.load(defaults);
  }

  load(defaults) {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return typeof defaults === 'function' ? defaults() : defaults;
    }
  }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.delay);
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const json = JSON.stringify(this.data);
    const tmp = `${this.file}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, this.file);
    } catch {
      try {
        fs.writeFileSync(this.file, json);
      } catch (err) {
        console.error('Failed to save', this.file, err);
      }
    }
  }
}

module.exports = { JsonFile };
