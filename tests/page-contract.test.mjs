import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = () => readFileSync("app/page.tsx", "utf8");

test("page initial analysis state is null and first run is empty", () => {
  const source = page();
  assert.match(source, /useState<AnalysisResult \| null>\(null\)/);
  assert.match(source, /useState\(0\)/);
  assert.match(source, /useState<Set<string>>\(new Set\(\)\)/);
  assert.match(source, /useState<VerifyResult \| null>\(null\)/);
  assert.match(source, /Upload a manual or try the sample PDF\./);
  assert.match(source, /Load a manual to build a visual guide/);
});

test("sample button fetches bundled sample PDF and posts to analyze", () => {
  const source = page();
  assert.match(source, /\/samples\/assembleai-sample-manual\.pdf/);
  assert.match(source, /fetch\("\/api\/analyze"/);
  assert.match(source, /formData\.append\("manual"/);
  assert.match(source, /await buildGuideFromFile\(file\)/);
});

test("sample flow does not directly set sampleAnalysis client-side", () => {
  const source = page();
  assert.doesNotMatch(source, /sampleAnalysis/);
  assert.doesNotMatch(source, /setAnalysis\(\s*\{/);
});

test("page guards optional screws instruction and simpleCheck", () => {
  const source = page();
  assert.match(source, /currentStep\?\.instruction/);
  assert.match(source, /currentStep\?\.simpleCheck/);
  assert.match(source, /currentStep\?\.screws \?\?/);
  assert.match(source, /currentStep\?\.parts \?\?/);
  assert.match(source, /currentStep\?\.cautions \?\?/);
  assert.match(source, /currentStep\?\.duration \?\?/);
  assert.match(source, /currentStep\?\.risk \?\?/);
});

test("initial shell includes upload sample empty center and disabled checks", () => {
  const source = page();
  assert.match(source, /Manual PDF/);
  assert.match(source, /Product photo optional/);
  assert.match(source, /Part photos optional/);
  assert.match(source, /Let&apos;s Build/);
  assert.match(source, /Sample/);
  assert.match(source, /disabled=\{!manualFile \|\| isAnalyzing\}/);
  assert.match(source, /Checks become available after a guide exists/);
  assert.match(source, /disabled=\{!analysis\}/);
});

test("generated visual queue replaces demo SVG after analysis", () => {
  const source = page();
  assert.match(source, /initializeVisualQueue/);
  assert.match(source, /runIdRef/);
  assert.match(source, /\/api\/illustrate/);
  assert.match(source, /status: "loading"/);
  assert.match(source, /status: "ready"/);
  assert.doesNotMatch(source, /demoSvg/);
});

test("progress photo and check flow use verify pipeline", () => {
  const source = page();
  assert.match(source, /PHOTO_ATTACHED_RESULT/);
  assert.match(source, /\/api\/verify/);
  assert.match(source, /score >= 0\.72/);
  assert.match(source, /AI found something to fix before continuing\./);
});
