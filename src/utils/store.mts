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
  private readonly store: Conf<Record<U, T>> = store as Conf<Record<U, T>>;

  constructor(key: U) {
    this.key = key;
  }

  get(): T | undefined {
    return this.store.get(this.key);
  }

  set(value: T) {
    store.set(this.key, value);
  }

  clear() {
    this.store.delete(this.key);
  }
}
