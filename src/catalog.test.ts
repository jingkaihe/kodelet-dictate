import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_MODELS,
  canonicalLanguage,
  defaultTranscriptionLanguage,
  formatBinarySize,
  getCatalogModel,
  preferredLanguageOptions,
  rankCatalogModels,
  resolveModelLanguage,
} from "./catalog.js";

function model(id: string) {
  const found = getCatalogModel(id);
  assert.ok(found, `expected catalog model ${id}`);
  return found;
}

test("ranks language-compatible recommended models first", () => {
  assert.equal(rankCatalogModels(CATALOG_MODELS, "en")[0]?.id, "parakeet-unified-en-0.6b");
  assert.equal(rankCatalogModels(CATALOG_MODELS, "zh")[0]?.id, "nemotron-3.5-asr-streaming-0.6b");
});

test("prefers a downloaded model among language-compatible models", () => {
  const ranked = rankCatalogModels(
    CATALOG_MODELS,
    "en",
    (candidate) => candidate.id === "moonshine-base",
  );

  assert.equal(ranked[0]?.id, "moonshine-base");
});

test("puts the current preferred language first without duplicating it", () => {
  const options = preferredLanguageOptions("en-US");

  assert.equal(options[0], "en");
  assert.equal(options.filter((language) => language === "en").length, 1);
  assert.ok(options.includes("zh"));
});

test("resolves automatic and regional language choices", () => {
  const nemotron = model("nemotron-3.5-asr-streaming-0.6b");
  const parakeet = model("parakeet-unified-en-0.6b");

  assert.equal(resolveModelLanguage(nemotron, "auto"), "auto");
  assert.equal(resolveModelLanguage(nemotron, "en"), "en-US");
  assert.equal(resolveModelLanguage(parakeet, "auto"), undefined);
  assert.equal(defaultTranscriptionLanguage(parakeet, "zh"), "en");
});

test("normalizes language codes without preserving display ellipses", () => {
  assert.equal(canonicalLanguage("…en"), "en");
  assert.equal(canonicalLanguage("...en-US"), "en");
});

test("formats model download sizes", () => {
  assert.equal(formatBinarySize(1024 ** 3), "1.0 GiB");
  assert.equal(formatBinarySize(218_447_552), "208 MiB");
});
