import type { PluginConstructor } from "../shared/AbstractPlugin.mts";
import { BalayDishwasher } from "./balay-dishwasher.mts";
import { FastSpeedTest } from "./fast-speed-test.mts";
import { PhilipsHue } from "./philips-hue.mts";
import { PlexMediaServer } from "./plex-media-server.mts";
import { Resideo } from "./resideo.mts";
import { Thermobeacon } from "./thermobeacon.mts";
import { HuaweiRouter } from "./huawei-router.mts";
import { Transmission } from "./transmission.mts";

export const plugins: PluginConstructor[] = [
  BalayDishwasher as unknown as PluginConstructor, // yeah, I know!
  FastSpeedTest,
  PhilipsHue,
  PlexMediaServer,
  Resideo,
  Thermobeacon,
  HuaweiRouter,
  Transmission,
];
