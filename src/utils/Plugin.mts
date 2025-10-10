import type { AbstractPlugin } from "../shared/index.mts";
import datadog from "./Datadog.mts";
import { Logger } from "./Loggers.mts";

type PluginClass = new () => AbstractPlugin;

export class Plugin {
  private readonly path: string;
  private readonly name: string;
  private readonly logger: Logger;
  private module: Promise<{ default: PluginClass } | null>;

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

      const data = await new Fn().run();

      if (data) {
        datadog.send(this.name, data);
      }
    } catch (error) {
      this.logger.error(
        new Error(`Failed to run ${this.name} plugin`, { cause: error })
      );
    }
  }
}
