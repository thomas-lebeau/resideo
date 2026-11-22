import type * as Noble from "@abandonware/noble";
import type { Thermometer } from "../shared/AbstractPlugin.mts";
import { AbstractPlugin } from "../shared/AbstractPlugin.mts";
import { lazyImport } from "../shared/lazyImport.mts";

type Offset = [Offset: number, ByteLength: number];
type SubArray = [Start: number, End: number];

type ThermoBeacon = Thermometer & {
  mac_address: string;
  rssi: number;
};

const TIMEOUT = 5_000;

// Only 20-byte packets contain real-time sensor data
// 22-byte packets appear to be device info/config packets (static data)
const SENSOR_MSG_LENGTH = 20;

const MAC_ADDRESS: SubArray = [4, 10]; // 6 bytes
const BATTERY: Offset = [10, 2];
const TEMPERATURE: Offset = [12, 2];
const HUMIDITY: Offset = [14, 2];

// Service UUID for Thermobeacon sensors
const SERVICE_UUID = "fff0" as const;

const CONFIG = ["THERMOBEACON_DEVICES"] as const;

const loadNoble = lazyImport(() => import("@abandonware/noble"));

type NobleModule = typeof Noble;
type DiscoverListener = (peripheral: Noble.Peripheral) => void;

export class Thermobeacon extends AbstractPlugin<ThermoBeacon, typeof CONFIG> {
  public static readonly slug = "thermobeacon";
  public static readonly description =
    "Thermobeacon WS08 temperature and humidity sensors";

  public readonly names = ["ThermoBeacon"];
  private timer: NodeJS.Timeout | undefined;
  private onDiscover: DiscoverListener | undefined;
  private readonly devices: Record<string, string>;
  private readonly loadNoble: () => Promise<NobleModule>;

  /**
   * @param load - loads the noble module, overridable in tests
   */
  constructor(load: () => Promise<NobleModule> = loadNoble) {
    super(CONFIG);

    this.devices = JSON.parse(this.config.THERMOBEACON_DEVICES);
    this.loadNoble = load;
  }

  async start() {
    const noble = await this.loadNoble();

    // Wait for Bluetooth adapter to be powered on
    if (noble._state !== "poweredOn") {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          noble.removeListener("stateChange", onStateChange);
        };

        const onStateChange = (state: string) => {
          if (state === "poweredOn") {
            cleanup();
            resolve();
          }
        };

        const timer = setTimeout(() => {
          cleanup();
          reject(
            new Error(
              `Bluetooth adapter did not power on within ${TIMEOUT}ms (state: ${noble._state})`
            )
          );
        }, TIMEOUT);

        noble.on("stateChange", onStateChange);
      });
    }

    await noble.startScanningAsync([], true);
  }

  async stop() {
    clearTimeout(this.timer);
    const noble = await this.loadNoble();

    if (this.onDiscover) {
      noble.removeListener("discover", this.onDiscover);
      this.onDiscover = undefined;
    }

    // Hack to force noble to stop scanning
    await noble.startScanningAsync([], true);
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
    const thermometerName = this.devices[macAddress];

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
    const noble = await this.loadNoble();
    const deviceCount = Object.keys(this.devices).length;
    // Scanning allows duplicates, so keep only the latest reading per sensor
    const readings = new Map<string, ThermoBeacon>();

    return new Promise<ThermoBeacon[]>((resolve, reject) => {
      let settled = false;

      const stopAndResolve = () => {
        if (settled) {
          return;
        }
        settled = true;

        this.stop().then(() => resolve(Array.from(readings.values())), reject);
      };

      this.onDiscover = (peripheral) => {
        const { address, rssi } = peripheral;
        const { manufacturerData, serviceUuids } = peripheral.advertisement;

        if (!serviceUuids.includes(SERVICE_UUID)) {
          return;
        }

        const sensorReadings = this.parseSensorReadings(manufacturerData);

        if (!sensorReadings) {
          // continue scanning
          return;
        }

        const macAddress = address || this.parseMacAddress(manufacturerData);

        readings.set(macAddress, {
          type: "thermometer",
          name: this.devices[macAddress],
          mac_address: macAddress,
          rssi,
          ...sensorReadings,
        });

        if (readings.size >= deviceCount) {
          stopAndResolve();
        }
      };

      noble.on("discover", this.onDiscover);
      this.timer = setTimeout(stopAndResolve, TIMEOUT);
    });
  }
}
