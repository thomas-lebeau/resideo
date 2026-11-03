import Conf from "conf";
import { config } from "./config.mts";

const store = new Conf({
  projectName: config.PACKAGE_NAME,
  projectVersion: config.PACKAGE_VERSION,
});

export class Store<
  T extends Record<string, string | number | boolean>,
  U extends string = string
> {
  private readonly key: U;
  private readonly store: Conf<Record<string, T>>;

  /**
   * @param key Key the value is stored under.
   * @param legacyKey Key the value used to be stored under. If the value is
   * only found there, it is moved to `key`.
   * @param conf Underlying store, overridable for tests.
   */
  constructor(key: U, legacyKey?: string, conf: Conf = store) {
    this.key = key;
    this.store = conf as Conf<Record<string, T>>;

    if (
      legacyKey !== undefined &&
      legacyKey !== key &&
      !this.store.has(key) &&
      this.store.has(legacyKey)
    ) {
      this.store.set(key, this.store.get(legacyKey));
      this.store.delete(legacyKey);
    }
  }

  get(): T | undefined {
    return this.store.get(this.key);
  }

  set(value: T) {
    this.store.set(this.key, value);
  }

  clear() {
    this.store.delete(this.key);
  }
}
