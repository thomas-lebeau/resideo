import noble from "@stoprocent/noble";
import type { Thermometer } from "../shared/AbstractPlugin.mts";
import { AbstractPlugin } from "../shared/AbstractPlugin.mts";

type Offset = [Offset: number, ByteLength: number];
type SubArray = [Start: number, End: number];

type ThermoBeacon = Thermometer & {
  mac_address: string;
  rssi: number;
};

const SCAN_TIMEOUT = 5_000;

// Only 20-byte packets contain real-time sensor data
// 22-byte packets appear to be device info/config packets (static data)
const SENSOR_MSG_LENGTH = 20;

const MAC_ADDRESS: SubArray = [4, 10]; // 6 bytes
const BATTERY: Offset = [10, 2];
const TEMPERATURE: Offset = [12, 2];
const HUMIDITY: Offset = [14, 2];

// Service UUID for Thermobeacon sensors
const SERVICE_UUID = "fff0" as const;

// Name of the thermometer for each MAC address
// TODO: make that configurable (yaml file?)
const THERMOMETERS: Record<string, string> = {
  "8e:bb:00:00:05:77": "Living Room",
};

const CONFIG = [] as const;

export class Thermobeacon extends AbstractPlugin<ThermoBeacon, typeof CONFIG> {
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

  parseMacAddress(buffer: Buffer) {
    const macBytes = buffer.subarray(...MAC_ADDRESS);
    const macAddress = Array.from(macBytes)
      .reverse() // Little-endian order
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(":");
    return macAddress;
  }

  parseSensorReadings(buffer: Buffer) {
    if (buffer.length !== SENSOR_MSG_LENGTH) {
      this.logger.debug(
        `Skipping non-sensor packet (length: ${buffer.length})`
      );
      return;
    }

    const macAddress = this.parseMacAddress(buffer);
    const thermometerName = THERMOMETERS[macAddress];

    if (!thermometerName) {
      this.logger.debug(
        `Skipping unknown thermometer (mac address: ${macAddress})`
      );
      return;
    }

    return {
      temperature: buffer.readIntLE(...TEMPERATURE) / 16,
      humidity: buffer.readIntLE(...HUMIDITY) / 16,
      battery_level: (buffer.readIntLE(...BATTERY) * 100) / 3400,
    } as const;
  }

  async run() {
    await this.start();
    const data: ThermoBeacon[] = [];

    for await (const peripheral of noble.discoverAsync()) {
      const { address, rssi } = peripheral;
      const { manufacturerData, serviceUuids } = peripheral.advertisement;

      if (serviceUuids.includes(SERVICE_UUID)) {
        const readings = this.parseSensorReadings(manufacturerData);
        const macAddress = address || this.parseMacAddress(manufacturerData);

        data.push({
          type: "thermometer",
          name: THERMOMETERS[macAddress],
          mac_address: macAddress,
          rssi,
          ...readings,
        });

        break;
      }
    }

    await noble.stopScanningAsync();
    return data;
  }
}
