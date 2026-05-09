import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("illustration route/helper uses projectName, parts, screws and strict prompt terms", () => {
  const source = read("lib/ai/illustrate.ts");
  assert.match(source, /projectName/);
  assert.match(source, /parts/);
  assert.match(source, /screws/);
  assert.match(source, /manual-accurate/i);
  assert.match(source, /Do not invent hardware/);
  assert.match(source, /orthographic/i);
  assert.match(source, /Label only provided part IDs/);
  assert.match(source, /before-and-after/i);
});

test("motion video helper imports google genai and uses Veo generateVideos imageBytes", () => {
  const source = read("lib/ai/motion.ts");
  assert.match(source, /@google\/genai/);
  assert.match(source, /veo-3\.1-fast-generate-preview/);
  assert.match(source, /GEMINI_API_KEY/);
  assert.match(source, /GOOGLE_API_KEY/);
  assert.match(source, /generateVideos/);
  assert.match(source, /imageBytes/);
});

test("motion video routes create, poll, and proxy content", () => {
  assert.match(read("app/api/motion/create/route.ts"), /createMotionVideo/);
  assert.match(read("app/api/motion/poll/route.ts"), /pollMotionVideo/);
  assert.match(read("app/api/motion/content/route.ts"), /proxyMotionContent/);
});

test("verify route infers image MIME for extension-accepted uploads", () => {
  const source = read("app/api/verify/route.ts");
  assert.match(source, /imageMimeType/);
  assert.match(source, /\\.jpe\?g/);
  assert.match(source, /image\/jpeg/);
  assert.match(source, /data:\$\{imageMimeType\(file\)\};base64/);
});

test("realtime session route exists, defaults model, supports override, and never exposes server key", () => {
  const source = read("app/api/realtime/session/route.ts");
  assert.match(source, /gpt-realtime-2/);
  assert.match(source, /REALTIME_MODEL/);
  assert.doesNotMatch(source, /OPENAI_API_KEY.*json/i);
  assert.match(source, /client_secret/);
});
