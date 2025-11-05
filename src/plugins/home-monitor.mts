import { AbstractPlugin } from "../shared/AbstractPlugin.mts";

type HomeMonitorData = {
  type: "home-monitor";
  name: string;
  uptime: number; // in seconds
};

// hack to make this a singleton
let instance: HomeMonitor | undefined;

export class HomeMonitor extends AbstractPlugin<HomeMonitorData> {
  public static readonly description = "Self-monitoring of the home monitor";

  private start = Date.now();

  constructor() {
    if (instance) {
      return instance;
    }

    super([]);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    instance = this;
  }

  async run() {
    return {
      type: "home-monitor",
      name: "Home Monitor",
      uptime: Math.floor((Date.now() - this.start) / 1000),
    } satisfies HomeMonitorData;
  }
}
