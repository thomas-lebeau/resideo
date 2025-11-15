import { Logger } from "../utils/Loggers.mts";
import { Store } from "../utils/store.mts";
import { toKebabCase } from "./toKebabCase.mts";

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
  brightness?: number;
  color_temperature?: number;
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
  /**
   * The interval in minutes at which the plugin should run
   */
  static readonly interval: number = 1;

  static get slug(): string {
    return toKebabCase(this.name);
  }

  static get logger(): Logger {
    return new Logger(this.slug);
  }

  /**
   * Configuration for the plugin from the environment variables.
   */
  protected readonly config: Record<U[number], string> = {} as Record<
    U[number],
    string
  >;

  /**
   * Store for the plugin.
   * It can be used to store authentication tokens, etc. that are needed for the plugin to work.
   */
  protected readonly store = new Store<V>(this.constructor.name);

  /**
   * Logger for the plugin.
   * It is initialized with the name of the plugin.
   * It is used to log messages from the plugin.
   */
  public readonly logger: Logger = new Logger(this.constructor.name);

  constructor(keys: U) {
    for (const key of keys) {
      if (!process.env[key]) {
        throw new Error(`${key} is not set`);
      }

      this.config[key as U[number]] = process.env[key];
    }
  }

  /**
   * Method to be optionally implemented by the plugin.
   * It should be used to setup the plugin.
   * For example, to authenticate with the service, to start the scan, etc.
   */
  async setup(): Promise<void> {
    // No-op by default. Plugins can override this if they need setup logic.
  }

  /**
   * Method to be optionally implemented by the plugin.
   * It should be used to stop the plugin.
   * For example, to stop the scan, to close the connection, etc.
   */
  async stop(): Promise<void> {
    // No-op by default. Plugins can override this if they need cleanup logic.
  }

  /**
   * Clear the plugin store.
   * It is used to clear the authentication tokens, etc. that are needed for the plugin to work.
   */
  clearStore(): void {
    this.store.clear();
  }

  /**
   * Main method to be implemented by the plugin.
   * It should return the data collected by the plugin.
   */
  abstract run(): Promise<T | Array<T | undefined> | undefined>;
}

export type PluginConstructor = (new () => AbstractPlugin) &
  Omit<
    typeof AbstractPlugin,
    "prototype" | "length" | "name" | "arguments" | "caller"
  > & {
    readonly description: string;
  };
