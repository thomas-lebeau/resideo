if (typeof globalThis.File === "undefined") {
  globalThis.File = class File {
    constructor(bits, name, options = {}) {
      this.bits = bits;
      this.name = name;
      this.type = options.type || "";
      this.lastModified = options.lastModified || Date.now();
    }
  };
}
if (typeof globalThis.FormData === "undefined") {
  globalThis.FormData = class FormData {
    constructor() {
      this._data = new Map();
    }
    append(name, value) {
      this._data.set(name, value);
    }
    get(name) {
      return this._data.get(name);
    }
  };
}
