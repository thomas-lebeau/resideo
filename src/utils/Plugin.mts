import { AbstractPlugin } from "../shared/index.mts";
import datadog from "./Datadog.mts";
import { Logger } from "./Loggers.mts";

type PluginFn = () => Promise<Record<string, any> | void>;
type PluginClass = new () => AbstractPlugin<any, any>;

export class Plugin {
  private readonly path: string;
  private readonly name: string;
  private readonly logger: Logger;
  private module: Promise<{
    default: PluginFn | PluginClass;
  } | null>;

  constructor(path: string) {
    this.path = path;
    this.name = path.split("/").pop()?.split(".").shift() ?? "";
    this.logger = new Logger(this.name);

    this.module = this.load();

    return this;
  }

  private load() {
    try {
      return import(this.path);
    } catch (error) {
      this.logger.error(new Error(`Failed to load plugin`, { cause: error }));
      return Promise.resolve(null);
    }
  }

  async run() {
    this.logger.info(`🔄 Running plugin ${this.name}...`);

    try {
      const { default: Fn } = (await this.module) || {};

      if (!Fn) {
        throw new Error("No default export function found in plugin");
      }

      let data: Record<string, any> | void;
      if (isPluginClass(Fn)) {
        data = await new Fn().run();
      } else {
        data = await Fn();
      }

      if (data) {
        datadog.send(this.name, data);
      }
    } catch (error) {
      this.logger.error(new Error("Failed to run plugin", { cause: error }));
    }
  }
}

function isPluginClass(Fn: PluginFn | PluginClass): Fn is PluginClass {
  return typeof Fn === "function" && Fn.prototype.constructor === Fn;
}
