import { describe, expect, it } from "vitest";
import { mockSeries } from "../api/mock.ts";
import type { SectionId, SectionResponse, Series } from "./queries.ts";
import { SECTIONS } from "./queries.ts";
import type { DashboardData } from "./tiles.ts";
import { buildCategories, buildChips, displayName } from "./tiles.ts";

type Values = Record<string, number | Record<string, number>>;

/** A section response with one point per series: `{ temperature: { Bedroom: 19 }, wan_state: 1 }`. */
function section(id: SectionId, values: Values): SectionResponse {
  const series: Series[] = Object.entries(values).flatMap(([queryId, v]) =>
    typeof v === "number"
      ? [{ queryId, group: {}, points: [[0, v]], last: v }]
      : Object.entries(v).map(([name, value]) => ({ queryId, group: { name }, points: [[0, value]], last: value })),
  );
  return { section: id, range: "1h", from: 0, to: 0, mock: false, series };
}

const tile = (data: DashboardData, key: string) =>
  buildCategories(data)
    .flatMap((c) => c.tiles ?? [])
    .find((t) => t.key === key);

describe("buildCategories", () => {
  it("returns null tiles for sections that haven't loaded", () => {
    const categories = buildCategories({});
    expect(categories.map((c) => c.id)).toEqual(["climate", "lights", "appliances", "network", "system"]);
    expect(categories.every((c) => c.tiles === null)).toBe(true);
  });

  it("builds a tile per room with temperature in the icon slot", () => {
    const data = { climate: section("climate", { temperature: { Bedroom: 18.46 }, humidity: { Bedroom: 41 } }) };
    expect(tile(data, "room:Bedroom")).toMatchObject({ iconText: "18°", title: "Bedroom", status: "18.5° · 41%", active: false });
  });

  it("prettifies Datadog-normalized tag values but keeps the raw tag for charts", () => {
    const data = { climate: section("climate", { temperature: { server_room: 22 } }) };
    const room = tile(data, "room:server_room");
    expect(room?.title).toBe("Server Room");
    expect(room?.charts[0]).toMatchObject({ queryId: "temperature", group: "server_room" });
    expect(displayName("hue_play_1")).toBe("Hue Play 1");
  });

  it("marks the thermostat active only while heating", () => {
    const heating = section("climate", { thermostat_target: 21, thermostat_state: 1, thermostat_heating: 1 });
    const idle = section("climate", { thermostat_target: 21, thermostat_state: 1, thermostat_heating: 0 });
    const off = section("climate", { thermostat_target: 21, thermostat_state: 0, thermostat_heating: 0 });
    expect(tile({ climate: heating }, "thermostat")).toMatchObject({ active: true, status: "Heating to 21.0°" });
    expect(tile({ climate: idle }, "thermostat")).toMatchObject({ active: false, status: "Heat · Idle" });
    expect(tile({ climate: off }, "thermostat")).toMatchObject({ active: false, status: "Off" });
  });

  it("lists lights that are on first, with their brightness", () => {
    const data = {
      devices: section("devices", { light_state: { Hallway: 0, Kitchen: 1, Desk: 0 }, light_brightness: { Kitchen: 80 } }),
    };
    const lights = buildCategories(data).find((c) => c.id === "lights")!.tiles!;
    expect(lights.map((t) => [t.title, t.active, t.status])).toEqual([
      ["Kitchen", true, "80%"],
      ["Desk", false, "Off"],
      ["Hallway", false, "Off"],
    ]);
  });

  it("flags an open dishwasher door, a down WAN and low batteries", () => {
    const data = {
      devices: section("devices", { dishwasher_state: 0, dishwasher_door: 1 }),
      network: section("network", { wan_state: 0 }),
      health: section("health", { battery: { Sensor: 12, Remote: 80 } }),
    };
    expect(tile(data, "dishwasher")).toMatchObject({ status: "Idle · Door Open", tone: "warning" });
    expect(tile(data, "wan")).toMatchObject({ status: "Down", tone: "critical" });
    expect(tile(data, "batteries")).toMatchObject({ status: "Lowest: Sensor", iconText: "12%", tone: "critical" });
  });

  it("sums errors over the range", () => {
    const quiet = section("health", { errors: 0 });
    const noisy = { ...quiet, series: [{ queryId: "errors", group: {}, points: [[0, 2], [1, null], [2, 1]], last: 1 }] } as SectionResponse;
    expect(tile({ health: quiet }, "errors")).toMatchObject({ status: "None in last hour" });
    expect(tile({ health: noisy }, "errors")).toMatchObject({ status: "3 in last hour", tone: "warning" });
  });

  it("renders every section's mock data without throwing", () => {
    const data = Object.fromEntries(
      (Object.keys(SECTIONS) as SectionId[]).map((id) => [
        id,
        { section: id, range: "1h", from: 0, to: 60_000, mock: true, series: mockSeries(SECTIONS[id].queries, [0, 60_000]) },
      ]),
    ) as DashboardData;
    const categories = buildCategories(data);
    expect(categories.every((c) => c.tiles && c.tiles.length > 0)).toBe(true);
    expect(buildChips(data, categories)).toHaveLength(4);
  });
});

describe("buildChips", () => {
  it("summarizes temperature range, lights on, internet speed and alerts", () => {
    const data = {
      climate: section("climate", { temperature: { A: 18.4, B: 21.2 } }),
      devices: section("devices", { light_state: { A: 1, B: 1, C: 0 }, dishwasher_door: 1, dishwasher_state: 0 }),
      network: section("network", { internet_speed: 305e6, wan_state: 1 }),
    };
    expect(buildChips(data)).toEqual([
      { id: "climate", icon: "thermometer", label: "Climate", value: "18–21°" },
      { id: "lights", icon: "bulb", label: "Lights", value: "2 On" },
      { id: "network", icon: "globe", label: "Internet", value: "305\u00a0Mbps" },
      { id: "appliances", icon: "alert", label: "Alerts", value: "1", tone: "warning" },
    ]);
  });

  it("shows no alerts when everything is fine", () => {
    const data = { network: section("network", { internet_speed: 1e8, wan_state: 1 }) };
    expect(buildChips(data).at(-1)).toMatchObject({ label: "Alerts", value: "None" });
    expect(buildChips(data).at(-1)).not.toHaveProperty("tone");
  });
});
