import FastSpeedtest from "fast-speedtest-api";
import { AbstractPlugin } from "../shared/AbstractPlugin.mts";

type SpeedTestData = {
  type: "speedtest";
  name: string;
  speed: number;
};

const CONFIG = ["FAST_SPEEDTEST_TOKEN"] as const;

export class FastSpeedTest extends AbstractPlugin<
  SpeedTestData,
  typeof CONFIG
> {
  static readonly description = "Internet speed using Fast Speedtest API";
  static readonly interval = 10;

  private readonly speedtest: FastSpeedtest;

  constructor() {
    super(CONFIG);

    this.speedtest = new FastSpeedtest({
      token: this.config.FAST_SPEEDTEST_TOKEN,
      unit: FastSpeedtest.UNITS.bps,
    });
  }

  async run() {
    const speed = await this.speedtest.getSpeed();

    return {
      type: "speedtest",
      name: "Internet",
      speed,
    } satisfies SpeedTestData;
  }
}
