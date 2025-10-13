import noble from "@stoprocent/noble";
import type { Thermometer } from "../shared/AbstractPlugin.mts";
import { AbstractPlugin } from "../shared/AbstractPlugin.mts";

type Offset = [Offset: number, ByteLength: number];

const SCAN_TIMEOUT = 60_000;
const MSG_LENGTH = 20;

const BATTERY: Offset = [10, 2];
const TEMPERATURE: Offset = [12, 2];
const HUMIDITY: Offset = [14, 2];

const CONFIG = [] as const;

export class Thermobeacon extends AbstractPlugin<Thermometer, typeof CONFIG> {
  public static readonly description =
    "Thermobeacon WS08 temperature and humidity sensors";

  public readonly names = ["ThermoBeacon"];
  private timer: NodeJS.Timeout | undefined;

  constructor() {
    super(CONFIG);
  }

  async start() {
    await noble.waitForPoweredOnAsync();
    await noble.startScanningAsync([], true);
    noble.setMaxListeners(50);

    this.timer = setTimeout(() => this.stop(), SCAN_TIMEOUT);
  }

  async stop() {
    clearTimeout(this.timer);
    await noble.stopScanningAsync();
  }

  parseBuffer(name: string, buffer: Buffer) {
    if (buffer.length !== MSG_LENGTH) {
      throw new Error(
        `Invalid buffer length: expected ${MSG_LENGTH}, got ${buffer.length}`
      );
    }
    return {
      type: "thermometer",
      name: name,
      temperature: buffer.readIntLE(...TEMPERATURE) / 16,
      humidity: buffer.readIntLE(...HUMIDITY) / 16,
      battery_level: (buffer.readIntLE(...BATTERY) * 100) / 3400,
    } as const;
  }

  async run() {
    await this.start();
    const data: Thermometer[] = [];

    for await (const peripheral of noble.discoverAsync()) {
      const { manufacturerData, localName } = peripheral.advertisement;

      if (this.names.includes(localName)) {
        data.push(this.parseBuffer(localName, manufacturerData));

        break;
      }
    }

    await noble.stopScanningAsync();
    return data;
  }
}
