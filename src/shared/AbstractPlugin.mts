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

/**
 * Thrown when a plugin is instantiated without its required environment variables.
 */
export class MissingConfigError extends Error {
  override name = "MissingConfigError";
}

/**
 * Plugin classes whose last `run()` hasn't settled yet. Keyed by class, not
 * instance, because a new instance is created on every tick.
 */
const runningPlugins = new Set<typeof AbstractPlugin>();

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
        throw new MissingConfigError(`${key} is not set`);
      }

      this.config[key as U[number]] = process.env[key];
    }

    this.run = this.runExclusively(this.run);
  }

  /**
   * Wraps the plugin's `run()` so that a call made while the previous one is
   * still in flight is skipped with a warning (and resolves `undefined`).
   * Ticks fire every minute regardless, so this keeps a slow plugin (hung
   * host, speed test...) from piling up concurrent runs, e.g. overlapping BLE
   * scans.
   */
  private runExclusively(run: this["run"]): this["run"] {
    const Plugin = this.constructor as typeof AbstractPlugin;

    return async () => {
      if (runningPlugins.has(Plugin)) {
        this.logger.warn(
          `⏳ Previous run of ${Plugin.slug} is still in progress, skipping`
        );
        return undefined;
      }

      runningPlugins.add(Plugin);

      try {
        this.logger.info(`🔄 Running plugin ${Plugin.slug}...`);

        return await run.call(this);
      } finally {
        runningPlugins.delete(Plugin);
      }
    };
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
   * Calls never overlap: while a run is in flight, further calls are skipped.
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
