import { describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.BALAY_CLIENT_ID = "client-id";

const { BalayDishwasher } = await import("./balay-dishwasher.mts");

type State = Record<string, unknown> | undefined;
type Internals = {
  state: State;
  haId: string | undefined;
  eventSource: { close(): void } | undefined;
  lastEventAt: number;
  store: unknown;
  logger: { warn(message: string, payload?: unknown): void };
  run(): Promise<Record<string, unknown> | undefined>;
  initializeState(): Promise<void>;
  startEventStream(): void;
  refreshAccessToken(refreshToken: string): Promise<{ access_token: string }>;
  getValidAccessToken(): Promise<string>;
  handleEventData(data: string): void;
  processEvent(event: { items: Array<{ key: string; value: unknown }> }): void;
  processStatus(response: {
    status: Array<{ key: string; value: string }>;
  }): Record<string, unknown>;
  processState(state: NonNullable<State>): Record<string, unknown>;
};

const DOOR_STATE = "BSH.Common.Status.DoorState";
const OPERATION_STATE = "BSH.Common.Status.OperationState";
const DOOR_OPEN = "BSH.Common.EnumType.DoorState.Open";
const DOOR_CLOSED = "BSH.Common.EnumType.DoorState.Closed";
const RUN = "BSH.Common.EnumType.OperationState.Run";
const READY = "BSH.Common.EnumType.OperationState.Ready";

const OVERRIDABLE = [
  "initializeState",
  "startEventStream",
  "refreshAccessToken",
  "store",
  "logger",
] as const;

const READY_STATE = {
  name: "Dishwasher",
  door_state: DOOR_CLOSED,
  operation_state: READY,
  active_program: undefined,
};

// The plugin is a singleton: reset everything tests may have touched.
const ORIGINAL = Object.fromEntries(
  OVERRIDABLE.map((key) => [
    key,
    (new BalayDishwasher() as unknown as Internals)[key],
  ])
);

function createPlugin(state?: State) {
  const plugin = new BalayDishwasher() as unknown as Internals;
  Object.assign(plugin, ORIGINAL);
  plugin.state = state;
  plugin.haId = undefined;
  plugin.eventSource = undefined;
  plugin.lastEventAt = 0;
  plugin.logger = { warn: () => {} };
  return plugin;
}

function fakeStore(token: Record<string, unknown> | undefined) {
  return {
    cleared: false,
    get: () => token,
    set: () => {},
    clear() {
      this.cleared = true;
    },
  };
}

describe("BalayDishwasher", () => {
  test("processStatus extracts door and operation state", () => {
    const plugin = createPlugin();

    assert.deepEqual(
      plugin.processStatus({
        status: [
          { key: OPERATION_STATE, value: RUN },
          { key: DOOR_STATE, value: DOOR_CLOSED },
        ],
      }),
      { door_state: DOOR_CLOSED, operation_state: RUN }
    );
  });

  test("processEvent applies status and notification items", () => {
    const plugin = createPlugin({
      name: "Dishwasher",
      door_state: DOOR_CLOSED,
      operation_state: READY,
      active_program: undefined,
    });

    plugin.processEvent({
      items: [
        { key: OPERATION_STATE, value: RUN },
        { key: DOOR_STATE, value: DOOR_OPEN },
        { key: "BSH.Common.Setting.PowerState", value: "BSH.Common.EnumType.PowerState.On" },
        { key: "Dishcare.Dishwasher.Option.HalfLoad", value: true },
        { key: "BSH.Common.Root.ActiveProgram", value: "Dishcare.Dishwasher.Program.Eco50" },
        { key: "BSH.Common.Event.Unknown", value: "ignored" },
      ],
    });

    assert.deepEqual(plugin.state, {
      name: "Dishwasher",
      door_state: DOOR_OPEN,
      operation_state: RUN,
      power_state: "BSH.Common.EnumType.PowerState.On",
      half_load: true,
      active_program: "Dishcare.Dishwasher.Program.Eco50",
    });
  });

  test("processEvent is a no-op before the state is initialized", () => {
    const plugin = createPlugin();

    plugin.processEvent({ items: [{ key: OPERATION_STATE, value: RUN }] });

    assert.equal(plugin.state, undefined);
  });

  test("processState reports a running program", () => {
    const plugin = createPlugin();

    assert.deepEqual(
      plugin.processState({
        name: "Dishwasher",
        door_state: DOOR_CLOSED,
        operation_state: RUN,
        active_program: "Dishcare.Dishwasher.Program.AutoHalfLoad",
      }),
      {
        type: "dishwasher",
        name: "Dishwasher",
        state: 1,
        door_state: 0,
        half_load: false,
        active_program: "auto-half-load",
      }
    );
  });

  test("processState omits program details when idle", () => {
    const plugin = createPlugin();

    assert.deepEqual(
      plugin.processState({
        name: "Dishwasher",
        door_state: DOOR_OPEN,
        operation_state: READY,
        active_program: undefined,
      }),
      { type: "dishwasher", name: "Dishwasher", state: 0, door_state: 1 }
    );
  });

  test("processStatus throws a descriptive error when a status is missing", () => {
    const plugin = createPlugin();

    assert.throws(
      () =>
        plugin.processStatus({
          status: [{ key: OPERATION_STATE, value: RUN }],
        }),
      { message: `Missing ${DOOR_STATE} in appliance status` }
    );
  });

  test("handleEventData ignores malformed event data", () => {
    const plugin = createPlugin({ ...READY_STATE });
    const warnings: string[] = [];
    plugin.logger = { warn: (message) => warnings.push(message) };

    assert.doesNotThrow(() => plugin.handleEventData("not json"));
    assert.doesNotThrow(() => plugin.handleEventData("{}"));
    assert.deepEqual(warnings, ["Ignoring malformed event data"]);
    assert.deepEqual(plugin.state, READY_STATE);

    plugin.handleEventData(
      JSON.stringify({ items: [{ key: OPERATION_STATE, value: RUN }] })
    );
    assert.equal(plugin.state?.operation_state, RUN);
  });

  test("run re-initializes the state when the event stream is stale", async () => {
    const plugin = createPlugin({ ...READY_STATE, operation_state: RUN });
    let closed = false;
    let initialized = 0;
    plugin.haId = "ha-id";
    plugin.eventSource = { close: () => (closed = true) };
    plugin.lastEventAt = Date.now() - 11 * 60 * 1000;
    plugin.initializeState = async () => {
      initialized++;
      plugin.state = { ...READY_STATE };
    };
    plugin.startEventStream = () => {
      plugin.eventSource = { close: () => {} };
      plugin.lastEventAt = Date.now();
    };

    assert.equal((await plugin.run())?.state, 0);
    assert.equal(closed, true);
    assert.equal(initialized, 1);

    // A fresh stream keeps using the cached state
    await plugin.run();
    assert.equal(initialized, 1);
  });

  test("run re-initializes the state after the event stream was reset", async () => {
    const plugin = createPlugin({ ...READY_STATE });
    let initialized = 0;
    plugin.haId = "ha-id";
    plugin.eventSource = undefined;
    plugin.lastEventAt = Date.now();
    plugin.initializeState = async () => {
      initialized++;
      plugin.state = { ...READY_STATE };
    };
    plugin.startEventStream = () => {
      plugin.eventSource = { close: () => {} };
    };

    await plugin.run();
    assert.equal(initialized, 1);
  });

  test("getValidAccessToken refreshes tokens that expire within a minute", async () => {
    const plugin = createPlugin();
    const refreshed: string[] = [];
    plugin.refreshAccessToken = async (refreshToken) => {
      refreshed.push(refreshToken);
      return { access_token: "new-token" };
    };

    plugin.store = fakeStore({
      access_token: "valid-token",
      refresh_token: "refresh",
      expires_at: Date.now() + 5 * 60 * 1000,
    });
    assert.equal(await plugin.getValidAccessToken(), "valid-token");

    plugin.store = fakeStore({
      access_token: "expiring-token",
      refresh_token: "refresh",
      expires_at: Date.now() + 30 * 1000,
    });
    assert.equal(await plugin.getValidAccessToken(), "new-token");
    assert.deepEqual(refreshed, ["refresh"]);
  });

  test("getValidAccessToken throws a fresh authentication error each time", async () => {
    const plugin = createPlugin();
    plugin.store = fakeStore(undefined);

    const errors: unknown[] = [];
    for (let i = 0; i < 2; i++) {
      await plugin.getValidAccessToken().catch((error) => errors.push(error));
    }

    assert.equal(errors.length, 2);
    assert.notEqual(errors[0], errors[1]);
    assert.match(
      (errors[0] as Error).message,
      /`raspberry-home-monitor --setup --plugin balay-dishwasher`/
    );
  });

  test("getValidAccessToken clears the store when the refresh fails", async () => {
    const plugin = createPlugin();
    const store = fakeStore({
      access_token: "expired-token",
      refresh_token: "refresh",
      expires_at: Date.now() - 1000,
    });
    plugin.store = store;
    plugin.refreshAccessToken = async () => {
      throw new Error("refresh failed");
    };

    await assert.rejects(plugin.getValidAccessToken(), {
      name: "AuthenticationError",
    });
    assert.equal(store.cleared, true);
  });
});
