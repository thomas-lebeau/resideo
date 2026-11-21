import { test } from "node:test";
import assert from "node:assert/strict";

import { getUpdateCommand } from "./update.mts";

test("getUpdateCommand runs the installer from the release tag", () => {
  assert.equal(
    getUpdateCommand("v3.2.3"),
    "curl -fsSL https://raw.githubusercontent.com/thomas-lebeau/resideo/v3.2.3/scripts/install.sh | sudo bash"
  );
});
