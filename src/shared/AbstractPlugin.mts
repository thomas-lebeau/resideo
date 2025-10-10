export abstract class AbstractPlugin<
  T extends Record<string, unknown> | Array<Record<string, unknown>>,
  U extends readonly string[] = []
> {
  protected readonly config: Record<U[number], string> = {} as Record<
    U[number],
    string
  >;

  constructor(keys: U) {
    for (const key of keys) {
      if (!process.env[key]) {
        throw new Error(`${key} is not set`);
      }

      this.config[key as U[number]] = process.env[key];
    }
  }

  abstract run(): Promise<T>;
}
