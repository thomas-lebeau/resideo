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
  private readonly legacyKey: string | undefined;
  private readonly store: Conf<Record<string, T>>;

  /**
   * @param key Key the value is stored under.
   * @param legacyKey Key the value used to be stored under. If the value is
   * only found there, it is moved to `key`. If both exist, `key` wins and the
   * legacy entry is left alone until `clear()`.
   * @param conf Underlying store, overridable for tests.
   */
  constructor(key: U, legacyKey?: string, conf: Conf = store) {
    this.key = key;
    this.legacyKey = legacyKey === key ? undefined : legacyKey;
    this.store = conf as Conf<Record<string, T>>;

    this.migrateLegacyValue();
  }

  /**
   * Moves the value from `legacyKey` to `key`, unless there is no legacy value
   * or `key` already holds one.
   */
  private migrateLegacyValue() {
    if (
      this.legacyKey === undefined ||
      this.store.has(this.key) ||
      !this.store.has(this.legacyKey)
    ) {
      return;
    }

    this.store.set(this.key, this.store.get(this.legacyKey));
    this.store.delete(this.legacyKey);
  }

  get(): T | undefined {
    return this.store.get(this.key);
  }

  set(value: T) {
    this.store.set(this.key, value);
  }

  clear() {
    this.store.delete(this.key);

    // A leftover legacy value would otherwise be moved back on the next start.
    if (this.legacyKey !== undefined) {
      this.store.delete(this.legacyKey);
    }
  }
}
