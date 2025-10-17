import { Store } from "../utils/store.mts";

type OnOff = 0 | 1;

export type Thermometer = {
  type: "thermometer";
  name: string;
  temperature?: number;
  humidity?: number;
  battery_level?: number;
};

export type Thermostat = {
  type: "thermostat";
  name: string;
  state: OnOff;
  operation_mode: OnOff;
  target: number;
};

export type Light = {
  type: "light";
  name: string;
  state: OnOff;
  brightness: number;
};

export type Other = {
  type: string;
  name: string;
  state?: OnOff;
  mode?: OnOff;
  [key: string]: unknown;
};

export abstract class AbstractPlugin<
  T extends Thermometer | Thermostat | Light | Other = Other,
  U extends readonly string[] = string[],
  V extends Record<string, string | number | boolean> = Record<
    string,
    string | number | boolean
  >
> {
  protected readonly config: Record<U[number], string> = {} as Record<
    U[number],
    string
  >;
  protected readonly store = new Store<V>(this.constructor.name);

  static get slug(): string {
    return toKebabCase(this.name);
  }

  constructor(keys: U) {
    for (const key of keys) {
      if (!process.env[key]) {
        throw new Error(`${key} is not set`);
      }

      this.config[key as U[number]] = process.env[key];
    }
  }

  abstract run(): Promise<T | Array<T> | undefined>;
}

export type PluginConstructor = (new () => AbstractPlugin) &
  Omit<
    typeof AbstractPlugin,
    "prototype" | "length" | "name" | "arguments" | "caller"
  > & {
    readonly description: string;
  };

function toKebabCase(string: string): string {
  return string
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2") // Insert hyphen between lowercase/digit and uppercase
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2") // Insert hyphen in sequences like "HTTPServer"
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .toLowerCase();
}
