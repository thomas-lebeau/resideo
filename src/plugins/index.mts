import type { PluginConstructor } from "../shared/AbstractPlugin.mts";
import { FastSpeedTest } from "./fast-speed-test.mts";
import { PhilipsHue } from "./philips-hue.mts";
import { PlexMediaServer } from "./plex-media-server.mts";
import { Resideo } from "./resideo.mts";
import { Transmission } from "./transmission.mts";

export const plugins: PluginConstructor[] = [
  FastSpeedTest,
  PhilipsHue,
  PlexMediaServer,
  Resideo,
  Transmission,
];
