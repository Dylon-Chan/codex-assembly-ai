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
  assert.match(source, /single-step/i);
  assert.match(source, /current step only/i);
  assert.match(source, /Do not show previous steps, future steps, a parts catalog/i);
  assert.match(source, /parts section/i);
});

test("illustration prompt keeps product photos as diagram reference rather than render direction", () => {
  const source = read("lib/ai/illustrate.ts");
  assert.match(source, /REFERENCE PHOTO GUIDANCE/);
  assert.match(source, /Use the attached product photo as reference material, not as the final image style/);
  assert.match(source, /The final image must still be a simplified technical assembly diagram/);
  assert.match(source, /Manual diagram notes are guidance, not permission to add extra components/);
  assert.match(source, /Large, sparse, readable labels — use only the provided part IDs and hardware IDs/);
  assert.match(source, /formatComponentList/);
  assert.doesNotMatch(source, /REFERENCE PHOTO — HIGHEST PRIORITY/);
  assert.doesNotMatch(source, /high-detail product rendering/);
  assert.doesNotMatch(source, /matching the camera angle of the reference photo as closely as possible/);
});

test("motion video helper imports google genai and uses Veo generateVideos imageBytes", () => {
  const source = read("lib/ai/motion.ts");
  assert.match(source, /@google\/genai/);
  assert.match(source, /GenerateVideosOperation/);
  assert.match(source, /veo-3\.1-fast-generate-001/);
  assert.match(source, /VEO_MODEL/);
  assert.match(source, /GEMINI_API_KEY/);
  assert.match(source, /GOOGLE_API_KEY/);
  assert.match(source, /GOOGLE_APPLICATION_CREDENTIALS/);
  assert.match(source, /GOOGLE_CLOUD_PROJECT/);
  assert.match(source, /vertexai: true/);
  assert.match(source, /googleAuthOptions/);
  assert.match(source, /generateVideos/);
  assert.match(source, /imageBytes/);
  assert.match(source, /Cinematic technical assembly animation/i);
  assert.match(source, /ANIMATION SEQUENCE/);
  assert.match(source, /Hold reference frame for 1 second/i);
  assert.match(source, /Preserve all geometry, colors, labels, part count, and text/i);
  assert.match(source, /Animate only the parts described in the instruction/i);
});

test("motion polling rebuilds a typed Veo operation before SDK polling", () => {
  const source = read("lib/ai/motion.ts");
  assert.match(source, /new GenerateVideosOperation\(\)/);
  assert.match(source, /operationRequest\.name = operationId/);
  assert.match(source, /getVideosOperation\(\{ operation: operationRequest \}\)/);
});

test("motion content proxy allows Gemini media download redirects", () => {
  const source = read("lib/ai/motion.ts");
  const proxySource = source.slice(source.indexOf("export async function proxyMotionContent"));
  assert.doesNotMatch(proxySource, /redirect: "error"/);
  assert.match(proxySource, /redirect: "follow"/);
  assert.match(proxySource, /gs:/);
  assert.match(proxySource, /getRequestHeaders/);
  assert.match(source, /storage\.googleapis\.com/);
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

test("verification prompt uses full step criteria from the goal app", () => {
  const route = `${read("app/api/verify/route.ts")}\n${read("lib/ai/verify.ts")}`;
  assert.match(route, /safety-aware assembly inspector/);
  assert.match(route, /full criteria for the current assembly step/);
  assert.match(route, /Status rules/);
  assert.match(route, /Expected check/);
  assert.match(route, /Parts that should be present or placed/);
  assert.match(route, /Hardware that should be installed/);
  assert.match(route, /too dark, blurry, or the joint is off-camera/);

  const page = read("app/page.tsx");
  assert.match(page, /formData\.append\("instruction"/);
  assert.match(page, /formData\.append\("simpleCheck"/);
  assert.match(page, /formData\.append\("cautions"/);
  assert.match(page, /formData\.append\("parts"/);
  assert.match(page, /formData\.append\("screws"/);
});

test("realtime session route exists, defaults model, supports override, and never exposes server key", () => {
  const source = read("app/api/realtime/session/route.ts");
  assert.match(source, /gpt-realtime-2/);
  assert.match(source, /REALTIME_MODEL/);
  assert.doesNotMatch(source, /OPENAI_API_KEY.*json/i);
  assert.match(source, /client_secret/);
  assert.match(source, /\/v1\/realtime\/client_secrets/);
  assert.doesNotMatch(source, /\/v1\/realtime\/sessions/);
});

test("realtime voice route uses the goal app assistant prompt discipline", () => {
  const source = read("app/api/realtime/session/route.ts");
  assert.match(source, /personal assembly assistant built into AssembleAI/);
  assert.match(source, /NEVER speak or call any tool until the user addresses you/);
  assert.match(source, /Guide-grounded facts/);
  assert.match(source, /General assembly know-how/);
  assert.match(source, /To answer anything about the current step, always call get_current_step first/);
  assert.match(source, /Do not call mark_current_step_done unless/);
});
