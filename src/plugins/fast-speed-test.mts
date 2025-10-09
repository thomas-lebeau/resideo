// @ts-expect-error - no types for fast-speedtest-api
import FastSpeedtest from "fast-speedtest-api";
import { AbstractPlugin } from "../shared/AbstractPlugin.mts";

type SpeedTestData = {
  down: number;
};

const CONFIG = ["FAST_SPEEDTEST_TOKEN"] as const;

export default class FastSpeedTestPlugin extends AbstractPlugin<
  SpeedTestData,
  typeof CONFIG
> {
  private readonly speedtest: FastSpeedtest;

  constructor() {
    super(CONFIG);

    this.speedtest = new FastSpeedtest({
      token: this.config.FAST_SPEEDTEST_TOKEN,
    });
  }

  async run(): Promise<SpeedTestData> {
    const speed = (await this.speedtest.getSpeed()) as number;

    return {
      down: speed,
    };
  }
}
