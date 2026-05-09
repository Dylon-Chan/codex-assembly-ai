import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const openaiSource = () => readFileSync("lib/ai/openai.ts", "utf8");
const analyzeSource = () => readFileSync("lib/ai/analyze.ts", "utf8");

test("parseJsonOutput supports output_text and nested output content", () => {
  const source = openaiSource();
  assert.match(source, /output_text/);
  assert.match(source, /raw\.output/);
  assert.match(source, /content/);
  assert.match(source, /parseJsonOutput/);
});

test("parseJsonOutput only uses fallback when explicitly provided", () => {
  const source = openaiSource();
  assert.match(source, /fallback\?:/);
  assert.doesNotMatch(source, /sampleAnalysis/);
});

test("normalizeAnalysis handles partial model output fields", () => {
  const source = analyzeSource();
  assert.match(source, /quantity/);
  assert.match(source, /qty/);
  assert.match(source, /instructions/);
  assert.match(source, /actions/);
  assert.match(source, /cautions/);
  assert.match(source, /hardware/);
});
