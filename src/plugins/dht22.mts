import type { Thermometer } from "../shared/AbstractPlugin.mts";
import { AbstractPlugin } from "../shared/AbstractPlugin.mts";
import type * as Sensor from "node-dht-sensor";

const CONFIG = ["DHT22_SENSORS"] as const;

// node-dht-sensor is a native module shipped next to the binary. Load it lazily
// so a missing or incompatible build only disables this plugin instead of
// crashing the whole process at startup.
let sensorPromise: Promise<typeof Sensor> | undefined;
function loadSensor() {
  sensorPromise ??= import("node-dht-sensor").then((module) => module.default);
  return sensorPromise;
}

const SENSOR_TYPE = 22;

export class DHT22 extends AbstractPlugin<Thermometer, typeof CONFIG> {
  public static readonly description = "DHT22 temperature and humidity sensor";

  private readonly sensors: Record<string, string>;

  constructor() {
    super(CONFIG);

    this.sensors = JSON.parse(this.config.DHT22_SENSORS);
  }

  private readSensor(
    sensor: typeof Sensor,
    gpioPin: number,
    name: string
  ) {
    const data = sensor.read(SENSOR_TYPE, gpioPin);

    // Telemetry to understand why some readings show a temperature very different from the expected range
    if (!data || !data.temperature) {
      return;
    }

    if (data.temperature < 20) {
      this.logger.warn(
        `anomalous reading for sensor ${name}: ${JSON.stringify(data)}`
      );
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

    return Object.entries(this.sensors).map(([pin, name]) =>
      this.readSensor(sensor, Number(pin), name)
    );
  }
}
