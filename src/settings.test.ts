import assert from "node:assert/strict";
import test from "node:test";

import { getCatalogModel } from "./catalog.js";
import {
  microphoneSettingForIndex,
  microphoneSummary,
  selectedMicrophone,
  settingsForModel,
  withTranscriptionLanguage,
} from "./settings.js";

function model(id: string) {
  const found = getCatalogModel(id);
  assert.ok(found, `expected catalog model ${id}`);
  return found;
}

test("persists duplicate microphone names by occurrence", () => {
  const setting = microphoneSettingForIndex(["USB microphone", "Built-in", "USB microphone"], 2);

  assert.deepEqual(setting, { type: "device", name: "USB microphone", occurrence: 1 });
  assert.deepEqual(selectedMicrophone(setting), { name: "USB microphone", occurrence: 1 });
  assert.equal(microphoneSummary(setting), "USB microphone (2)");
});

test("chooses a model-compatible default transcription language", () => {
  const whisper = settingsForModel(model("whisper-tiny"), "/models/whisper.gguf", undefined, "zh-TW");
  const parakeet = settingsForModel(model("parakeet-unified-en-0.6b"), "/models/parakeet.gguf", undefined, "en-US");

  assert.equal(whisper.preferredLanguage, "zh");
  assert.equal(whisper.transcriptionLanguage, "auto");
  assert.equal(parakeet.preferredLanguage, "en");
  assert.equal(parakeet.transcriptionLanguage, "en");
});

test("validates and normalizes a changed transcription language", () => {
  const settings = settingsForModel(
    model("nemotron-3.5-asr-streaming-0.6b"),
    "/models/nemotron.gguf",
    undefined,
    "en",
  );

  assert.equal(withTranscriptionLanguage(settings, "en").transcriptionLanguage, "en-US");
  assert.throws(() => withTranscriptionLanguage(settings, "sw"), /does not support sw/);
});
