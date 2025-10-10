type OnOff = 0 | 1;

export type Thermometer = {
  type: "thermometer";
  name: string;
  temperature?: number;
  humidity?: number;
  battery_level?: number;
};

export type Thermostat = {
  type: "thermostat";
  name: string;
  state: OnOff;
  operation_mode: OnOff;
  target: number;
};

export type Light = {
  type: "light";
  name: string;
  state: OnOff;
  brightness: number;
};

export type Other = {
  type: string;
  name: string;
  state?: OnOff;
  mode?: OnOff;
  [key: string]: unknown;
};

export abstract class AbstractPlugin<
  T extends Thermometer | Thermostat | Light | Other = Other,
  U extends readonly string[] = string[]
> {
  protected readonly config: Record<U[number], string> = {} as Record<
    U[number],
    string
  >;

  constructor(keys: U) {
    for (const key of keys) {
      if (!process.env[key]) {
        throw new Error(`${key} is not set`);
      }

      this.config[key as U[number]] = process.env[key];
    }
  }

  abstract run(): Promise<T | Array<T> | undefined>;
}
