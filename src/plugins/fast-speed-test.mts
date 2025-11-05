// @ts-expect-error - no types for fast-speedtest-api
import FastSpeedtest from "fast-speedtest-api";
import { AbstractPlugin } from "../shared/AbstractPlugin.mts";
import { hostname } from "node:os";

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
    const speed = (await this.speedtest.getSpeed()) as number;

    return {
      type: "speedtest",
      name: hostname(),
      speed,
    } satisfies SpeedTestData;
  }
}
