import type { Thermometer } from "../shared/AbstractPlugin.mts";
import { AbstractPlugin } from "../shared/AbstractPlugin.mts";

import sensor from "node-dht-sensor";

const CONFIG = ["DHT22_SENSORS"] as const;

const SENSOR_TYPE = 22;

export class DHT22 extends AbstractPlugin<Thermometer, typeof CONFIG> {
  public static readonly description = "DHT22 temperature and humidity sensor";

  private readonly sensors: Record<string, string>;

  constructor() {
    super(CONFIG);

    this.sensors = JSON.parse(this.config.DHT22_SENSORS);
  }

  private readSensor(gpioPin: number, name: string) {
    const data = sensor.read(SENSOR_TYPE, gpioPin);

    return {
      name,
      type: "thermometer",
      temperature: data.temperature,
      humidity: data.humidity,
    } satisfies Thermometer;
  }

  async run(): Promise<Thermometer[]> {
    return Object.entries(this.sensors).map(([pin, name]) =>
      this.readSensor(Number(pin), name)
    );
  }
}
