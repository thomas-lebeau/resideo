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

  constructor(key: U) {
    this.key = key;
  }

  get(): T | undefined {
    return store.get(this.key) as T | undefined;
  }

  set(value: T) {
    store.set(this.key, value);
  }

  clear() {
    store.delete(this.key);
  }
}
