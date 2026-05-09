import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const openaiSource = () => readFileSync("lib/ai/openai.ts", "utf8");
const analyzeSource = () => readFileSync("lib/ai/analyze.ts", "utf8");
const analyzeRouteSource = () => readFileSync("app/api/analyze/route.ts", "utf8");

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

test("analyze route reads manual arrayBuffer and creates base64 manualFile", () => {
  const source = analyzeRouteSource();
  assert.match(source, /formData\(\)/);
  assert.match(source, /manual\.arrayBuffer\(\)/);
  assert.match(source, /Buffer\.from\(arrayBuffer\)\.toString\("base64"\)/);
  assert.match(source, /manualFile/);
  assert.match(source, /filename/);
  assert.match(source, /mimeType/);
  assert.match(source, /base64Data/);
});

test("analysis helper sends uploaded PDF as Responses input_file data URL", () => {
  const source = analyzeSource();
  assert.match(source, /type:\s*"input_file"/);
  assert.match(source, /file_data/);
  assert.match(source, /data:\$\{manualFile\.mimeType\};base64,\$\{manualFile\.base64Data\}/);
});

test("analysis prompt asks for exact product specific output without generic fallback", () => {
  const source = analyzeSource();
  assert.match(source, /exact product-specific/i);
  assert.match(source, /manual/i);
  assert.match(source, /JSON-only/i);
  assert.doesNotMatch(source, /sampleAnalysis/);
  assert.doesNotMatch(source, /static sample/i);
  assert.doesNotMatch(source, /generic fallback/i);
});
