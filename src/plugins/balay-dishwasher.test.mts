import { describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.BALAY_CLIENT_ID = "client-id";

const { BalayDishwasher } = await import("./balay-dishwasher.mts");

type State = Record<string, unknown> | undefined;
type Internals = {
  state: State;
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

function createPlugin(state?: State) {
  const plugin = new BalayDishwasher() as unknown as Internals;
  plugin.state = state;
  return plugin;
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
});
