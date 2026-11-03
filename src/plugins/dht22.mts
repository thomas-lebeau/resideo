import type { Thermometer } from "../shared/AbstractPlugin.mts";
import { AbstractPlugin } from "../shared/AbstractPlugin.mts";
import { lazyImport } from "../shared/lazyImport.mts";
import type * as Sensor from "node-dht-sensor";

const CONFIG = ["DHT22_SENSORS"] as const;

const loadSensor = lazyImport(() => import("node-dht-sensor"));

const SENSOR_TYPE = 22;

type SensorReader = Pick<typeof Sensor.promises, "read">;

export class DHT22 extends AbstractPlugin<Thermometer, typeof CONFIG> {
  public static readonly slug = "dht22";
  public static readonly description = "DHT22 temperature and humidity sensor";

  private readonly sensors: Record<string, string>;

  constructor() {
    super(CONFIG);

    this.sensors = JSON.parse(this.config.DHT22_SENSORS);
  }

  /**
   * Reads a sensor without blocking the event loop. The promises API rejects
   * when the sensor can't be read after retries, so invalid readings are
   * dropped instead of being reported with the last cached values.
   */
  async readSensor(sensor: SensorReader, gpioPin: number, name: string) {
    let data: Sensor.SensorData;

    try {
      data = await sensor.read(SENSOR_TYPE, gpioPin);
    } catch (error) {
      this.logger.warn(
        `failed to read sensor ${name} on GPIO ${gpioPin}: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }

    if (
      !Number.isFinite(data?.temperature) ||
      !Number.isFinite(data?.humidity)
    ) {
      this.logger.warn(
        `invalid reading for sensor ${name}: ${JSON.stringify(data)}`
      );
      return;
    }

    return {
      name,
      type: "thermometer",
      temperature: data.temperature,
      humidity: data.humidity,
    } satisfies Thermometer;
  }

  async run() {
    const sensor = await loadSensor();
    const readings: Thermometer[] = [];

    // Read one sensor at a time: the native reads are bit-banged GPIO and are
    // serialized by node-dht-sensor anyway, so parallel reads would only park
    // libuv threadpool workers on its mutex.
    for (const [pin, name] of Object.entries(this.sensors)) {
      const reading = await this.readSensor(sensor.promises, Number(pin), name);

      if (reading) {
        readings.push(reading);
      }
    }

    return readings;
  }
}
