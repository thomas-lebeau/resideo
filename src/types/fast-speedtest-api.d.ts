// fast-speedtest-api ships no types. These cover the API of its
// src/Api.js (v0.3.2), the version in package-lock.json.
declare module "fast-speedtest-api" {
  /** Converts a speed in bytes per second to another unit. */
  type Unit = (bytesPerSecond: number) => number;

  type Options = {
    /** fast.com app token. */
    token: string;
    /** Log the current speed while testing. Defaults to `false`. */
    verbose?: boolean;
    /** Test duration in milliseconds. Defaults to `5000`. */
    timeout?: number;
    /** Use HTTPS. Defaults to `true`. */
    https?: boolean;
    /** Number of fast.com servers to download from. Defaults to `5`. */
    urlCount?: number;
    /** Number of samples averaged into the result. Defaults to `8`. */
    bufferSize?: number;
    /** Unit of the result. Defaults to `UNITS.Bps`. */
    unit?: Unit;
  };

  class FastSpeedtest {
    static readonly UNITS: Readonly<
      Record<
        "Bps" | "KBps" | "MBps" | "GBps" | "bps" | "Kbps" | "Mbps" | "Gbps",
        Unit
      >
    >;

    constructor(options: Options);

    /** Measures the download speed, in the configured unit. */
    getSpeed(): Promise<number>;
  }

  export = FastSpeedtest;
}
