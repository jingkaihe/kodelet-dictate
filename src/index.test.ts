import assert from "node:assert/strict";
import test from "node:test";

import { createTestHarness } from "kodelet";
import extension from "./index.js";

test("Ctrl+Alt+R submits the dictate command", async () => {
  const harness = await createTestHarness(extension);
  const initialized = harness.initialize();

  assert.equal(initialized.version, "0.1.4");
  assert.deepEqual(initialized.shortcuts, [
    { key: "ctrl+alt+r", description: "Start dictation" },
  ]);
  assert.deepEqual(await harness.executeShortcut({ key: "ctrl+alt+r" }), {
    action: "submit",
    message: "/dictate",
  });
});
