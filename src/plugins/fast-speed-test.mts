// @ts-expect-error - no types for fast-speedtest-api
import FastSpeedtest from "fast-speedtest-api";

type SpeedTestResult = {
  down: number;
};

const CONFIG = {
  FAST_SPEEDTEST_TOKEN: process.env.FAST_SPEEDTEST_TOKEN,
};

export default async function fastSpeedTest(): Promise<SpeedTestResult> {
  if (!CONFIG.FAST_SPEEDTEST_TOKEN) {
    throw new Error("FAST_SPEEDTEST_TOKEN is not set");
  }

  const speedtest = new FastSpeedtest({
    token: process.env.FAST_SPEEDTEST_TOKEN,
  });

  const speed = (await speedtest.getSpeed()) as number;

  return {
    down: speed,
  };
}
