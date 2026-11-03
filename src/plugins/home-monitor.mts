import { AbstractPlugin } from "../shared/AbstractPlugin.mts";

type HomeMonitorData = {
  type: "home-monitor";
  name: string;
  uptime: number; // in seconds
};

export class HomeMonitor extends AbstractPlugin<HomeMonitorData> {
  public static readonly description = "Self-monitoring of the home monitor";

  private start = Date.now();

  constructor() {
    super([]);
  }

  async run() {
    return {
      type: "home-monitor",
      name: "Home Monitor",
      uptime: Math.floor((Date.now() - this.start) / 1000),
    } satisfies HomeMonitorData;
  }
}
