# AssembleAI Design Spec

Date: 2026-05-09
Status: Approved for implementation planning

## Product Goal

AssembleAI is a GitHub-ready Next.js and TypeScript web app that turns an uploaded product manual PDF into an interactive visual assembly guide. The app starts empty, accepts real user uploads, and provides a bundled sample PDF that travels through the same analysis API as a user upload. It includes live AI manual analysis, generated step illustrations, optional Veo motion views, progress-photo verification, and optional hands-free voice/camera control.

The app is a working product experience, not a mockup or marketing landing page.

## Non-Goals

- No preloaded sample analysis on app start.
- No client-side shortcut that directly injects sample guide data.
- No auth, database, billing, teams, or persistence.
- No continuous camera recording or automatic camera analysis.
- No requirement to use voice mode for normal operation.
- No API keys exposed to client code.

## Technical Stack

- Next.js App Router.
- TypeScript.
- React client components for the workspace.
- `lucide-react` icons.
- `app/globals.css` for styling.
- OpenAI Responses API via `fetch` for manual analysis and progress verification.
- OpenAI Images API via `fetch` for generated step illustrations.
- OpenAI Realtime API via browser WebRTC for optional hands-free mode.
- `@google/genai` for optional Veo motion videos.
- `node:test` for source contract tests.

## Repository Structure

The app will live in the repository root.

- `app/layout.tsx`: root metadata and shell.
- `app/page.tsx`: client workspace entry.
- `app/globals.css`: global dark technical platform styling.
- `app/api/analyze/route.ts`: PDF and photo analysis route.
- `app/api/verify/route.ts`: progress photo verification route.
- `app/api/illustrate/route.ts`: OpenAI image generation route.
- `app/api/motion/create/route.ts`: starts optional Veo motion generation.
- `app/api/motion/poll/route.ts`: polls optional Veo operation state.
- `app/api/motion/content/route.ts`: proxies generated video content.
- `app/api/realtime/session/route.ts`: creates an ephemeral Realtime session.
- `components/`: focused client UI components if page size requires extraction.
- `lib/types.ts`: shared data contracts.
- `lib/ai/openai.ts`: OpenAI request helpers and response parsing.
- `lib/ai/analyze.ts`: analysis prompt construction and normalization.
- `lib/ai/verify.ts`: verification prompt construction and normalization.
- `lib/ai/illustrate.ts`: illustration prompt construction and image API helper.
- `lib/ai/motion.ts`: Veo prompt, image conversion, polling normalization, and media helpers.
- `lib/sample-fixture.ts`: deterministic fixture colors and fallback values used only to normalize missing optional fields.
- `public/samples/assembleai-sample-manual.pdf`: bundled sample manual fixture.
- `tests/*.test.mjs`: contract tests for routes, helpers, and critical client behavior.
- `README.md`: setup, environment, usage, privacy, API routes, and checks.
- `.gitignore`: Node, build, env, and OS exclusions.

## Initial State

The first-run app state must be empty:

- `analysis` starts as `null`.
- `currentStepIndex` starts at `0`.
- `completedSteps` starts as `[]`.
- `verifyResult` starts as `null`.
- uploaded manual, product photo, part photos, and progress photo start empty.
- no project name, step rail, part list, verification score, generated visual, or analyzed guide appears before analysis.

The initial notice is `Upload a manual or try the sample PDF.`

Before analysis:

- the left panel shows upload controls for manual PDF, optional product photo, and optional part photos.
- `Let's Build` is disabled until a manual PDF is selected.
- `Sample` fetches `/samples/assembleai-sample-manual.pdf` and posts the resulting file to `/api/analyze`.
- the center stage shows a polished empty state titled `Load a manual to build a visual guide`.
- the right AI check panel and voice controls are disabled or empty until a guide exists.

## Core User Flow

### User Upload Flow

1. User selects a PDF manual and optional product or part photos.
2. User clicks `Let's Build`.
3. Client posts `FormData` to `/api/analyze`.
4. On success, the client stores the normalized analysis, resets step and verification state, and starts the generated illustration queue.
5. On failure, the client shows a clear error notice and does not inject sample data.

### Sample Flow

1. User clicks `Sample`.
2. Client fetches `/samples/assembleai-sample-manual.pdf`.
3. Client wraps the downloaded PDF as a `File`.
4. Client posts that file to `/api/analyze` using the same upload code path as real manuals.
5. Client never directly sets a hardcoded sample analysis.

### Progress Check Flow

1. User uploads a progress photo or explicitly captures a camera frame.
2. Selecting a progress photo creates a warning verification state with score `0.61`, message `Photo attached. Run AI check before moving on.`, checklist entries for readiness, and a wide-photo next fix.
3. User clicks `Check this step`.
4. Client posts the current step title and photo to `/api/verify`.
5. If the result is `pass` or score is at least `0.72`, the current step is marked complete.
6. Otherwise the notice becomes `AI found something to fix before continuing.`
7. `Continue` advances one step unless the current step is final, clears the progress photo, and resets verification for the new step.

## UI Design

The interface is a full-screen dark technical assembly platform with no marketing hero. It uses compact controls, translucent panels, cyan-gray borders, subtle cyan grid lines, and a soft radial glow near the top.

### Top Bar

- AssembleAI brand with wrench mark.
- Subtitle `visual build assistant`.
- Segmented nav buttons: `Guide`, `Parts`, `Checks`.
- Voice toggle/control cluster.
- Status chip:
  - `Ready for manual` before analysis.
  - `AI extraction {confidence}%` after analysis.
- Workflow notice that changes with state.

### Workspace Layout

Desktop:

- Left setup and step rail: `minmax(260px, 304px)`.
- Center assembly workspace: `minmax(560px, 1fr)`.
- Right AI verification and camera/voice support: `minmax(300px, 356px)`.

Responsive behavior:

- Below `1240px`: top bar becomes one column, workspace becomes two columns, and the right panel spans full width.
- Below `860px`: workspace becomes one column.
- Below `540px`: compact padding, stacked setup actions, and two-column frame/check flows.

### Left Panel

Before analysis:

- upload controls.
- disabled `Let's Build` until PDF is selected.
- `Sample` button.
- no step rail.

After analysis:

- project name and `{stepCount} guided steps`.
- reset/clear icon that returns to empty state.
- upload controls remain available for a new manual.
- AI summary box.
- step rail with number, check, or lock visuals.
- each step shows title, duration, and risk label.
- completed steps use mint check styling.
- selected step uses cyan highlighted background.
- future locked-looking steps remain selectable.

### Center Stage

Before analysis:

- empty state with title `Load a manual to build a visual guide`.
- text explaining that AssembleAI turns a PDF manual into steps, diagrams, part callouts, and progress checks.
- dark technical placeholder visual.

After analysis:

- header with `Step X of N`, step title, risk pill, and generated visual pill.
- instruction band with Bot icon, label `Plain-language instruction`, and current instruction.
- diagram shell with toolbar for `Motion diagram`, replay, and zoom.
- frame strip: `Before`, `Move`, `Align`, `Lock`.
- generated visual state machine:
  - `idle`: queued visual.
  - `loading`: spinner and step visual message.
  - `ready`: rendered generated image with zoom toggle.
  - `error`: failure message and retry button.
- chips below image for parts and hardware.
- `GeneratedStepMotionVideo` below the generated visual:
  - label `Veo Motion View`.
  - animated CSS technical preview before creation.
  - `Create motion` disabled until the generated reference image is ready.
  - queued, creating, and in-progress states show status and progress.
  - ready state renders a video with controls, autoplay, muted, loop, and `playsInline`.
  - unavailable and error states show clear text.
- parts and hardware panels.
- simple check callout with ClipboardCheck icon.

### Right Panel

Before analysis:

- `AI check` empty state.
- text explaining checks become available after a guide exists.
- photo, camera, and check buttons disabled.

After analysis:

- header `AI check`, subtitle `Upload a photo or use camera check`.
- score badge only when a verification result exists.
- verification flow: `1 Photo/Camera`, `2 Verify`, `3 Continue`.
- progress photo upload drop zone.
- optional live camera preview and toggle.
- `Check this step` button.
- result panel:
  - pass: `Ready to continue`.
  - warning or fail: `Needs review`.
- checklist titled `What the AI checked`.
- guidance box with `nextFix`.
- `Continue` advances to the next step, clears photo, and resets check state. It is disabled on the final step or when verification fails.

## Analysis API Design

`/api/analyze` accepts `FormData`.

Inputs:

- `manual`: required PDF file.
- `productPhoto`: optional image.
- `partPhotos`: optional images.

Behavior:

- Reads `manual.arrayBuffer()`.
- Creates a `manualFile` object with MIME type, filename, and `base64Data`.
- Sends the PDF as OpenAI Responses `input_file` using `data:{mime};base64,{base64Data}`.
- Includes part photo names in the user text when provided.
- Uses `process.env.ANALYSIS_MODEL || "gpt-5.5"`.
- If `OPENAI_API_KEY` is missing, throws and returns a clear missing-key error.
- If the uploaded manual produces no model output, throws.
- The prompt requires JSON only matching the `AnalysisResult` schema.
- The prompt explicitly says to analyze the attached PDF by name, return a guide specific to the exact product, and not return generic fallback data.

Response parsing:

- Prefer `raw.output_text`.
- Otherwise read nested `raw.output[].content[].text` where type is `output_text`.
- `parseJsonOutput` only uses fallback data when explicitly provided for tests or development helpers.

Normalization:

- count from `count`, `quantity`, or `qty`.
- note from `note` or `notes`.
- instruction from `instruction`, `instructions[]`, or `actions[]`.
- simple check from `simpleCheck`, first caution, or `warning`.
- screws from `screws` or `hardware`.
- missing colors use deterministic sample fixture colors.
- missing dimensions use `See manual`.
- missing risk is `high` if cautions exist, otherwise `medium`.
- UI must not crash on missing optional fields.

## Verification API Design

`/api/verify` accepts `FormData`.

Inputs:

- `stepTitle`: required string.
- progress photo file or captured camera frame.

Behavior:

- Uses `process.env.VERIFICATION_MODEL || "gpt-5.5"`.
- Sends text asking whether the photo satisfies the current step title.
- Includes `input_image` when a photo data URL exists.
- Requires JSON only with `status`, `score`, `message`, `checklist[]`, and `nextFix`.
- Returns clear errors if `OPENAI_API_KEY` is missing.

## Illustration API Design

`/api/illustrate` accepts current project, step, parts, and hardware.

Behavior:

- Uses `process.env.IMAGE_MODEL || "gpt-image-2"`.
- Calls `https://api.openai.com/v1/images/generations`.
- Requests size `1024x1024`.
- Supports URL and `b64_json` responses.
- Returns clear errors if `OPENAI_API_KEY` is missing.

The prompt includes:

- manual-accurate instructional assembly visual.
- project name, step title, instruction, provided parts, and provided hardware.
- orthographic technical-manual view or clean isometric exploded view.
- before-and-after placement.
- ghosted starting position.
- movement path arrows.
- final seated or fastened position.
- exact join points, hole alignment, screw entry direction, rail orientation, bracket orientation, drawer interlock orientation, wall-anchor placement, and left/right markings.
- instruction to not invent hardware, parts, holes, labels, tools, panels, drawers, rails, brackets, fasteners, wall hardware, or safety mechanisms.
- instruction to label only provided part IDs and hardware IDs.
- large sparse readable labels.
- graphite outlines, teal active highlights, amber fastener highlights, and white background.
- no decorative room scene, no lifestyle photo, no tiny unreadable text, and no extra unlisted components.

## Motion Video Design

Motion video is optional and depends on `GEMINI_API_KEY` or `GOOGLE_API_KEY`.

`/api/motion/create`:

- returns unavailable if no Gemini or Google key exists.
- returns failed if no reference image URL is provided.
- converts data URL or remote reference image to inline base64.
- imports `@google/genai`.
- uses `veo-3.1-fast-generate-preview`.
- calls `generateVideos` with:
  - `imageBytes`.
  - `mimeType`.
  - `numberOfVideos: 1`.
  - `aspectRatio: "16:9"`.
  - `durationSeconds: 8`.
  - `resolution: "720p"`.
  - `personGeneration: "allow_adult"`.

Prompt:

- `Apple Vision Pro-style technical assembly animation.`
- product, step, instruction, parts, and hardware.
- start from reference image and preserve geometry, colors, labels, and part count.
- animate only the mechanical action.
- smooth motion, translucent active parts, cyan alignment guides, glowing trails, and subtle technical grid.
- stable camera with gentle parallax push-in.
- no hands, people, room scene, extra tools, extra parts, invented labels, or changed text.
- end on clear final state.

`/api/motion/poll` normalizes provider operation results from both `generatedVideos` and `generateVideoResponse.generatedSamples`.

`/api/motion/content` proxies provider video URIs so the client can render video safely.

## Realtime Voice And Camera Design

Voice mode is optional and disabled until an analyzed guide exists.

States:

- `off`.
- `connecting`.
- `listening`.
- `speaking`.
- `muted`.
- `error`.

Controls:

- enable or disable voice agent.
- mute or unmute microphone.
- enable or disable live camera.
- end session.

Realtime setup:

- `/api/realtime/session` calls OpenAI with the server API key and returns an ephemeral session token.
- model defaults to `process.env.REALTIME_MODEL || "gpt-realtime-2"`.
- route never returns `OPENAI_API_KEY`.
- browser connects to OpenAI Realtime over WebRTC with the ephemeral token.
- microphone permission is requested only when enabling voice.

Client tool handlers:

1. `get_current_step`: returns project name, current step index, title, instruction, simple check, parts, hardware, and completion status.
2. `go_to_next_step`: advances if possible, clears photo/check state, and returns the new title/instruction. If final, reports assembly is complete.
3. `go_to_previous_step`: moves back if possible and returns the step title/instruction.
4. `repeat_current_step`: returns current instruction, parts, hardware, and simple check.
5. `mark_current_step_done`: marks current step complete. If the user asked what is next, advances and returns the next instruction unless final.
6. `list_required_parts`: returns current step parts and hardware.
7. `check_current_camera_frame`: requires live camera enabled, captures the current video frame, sends it through `/api/verify`, updates the AI check panel, marks complete if pass or score is at least `0.72`, and returns a spoken summary and next fix.
8. `stop_voice_agent`: disconnects realtime, stops microphone tracks, and stops camera tracks unless the user explicitly kept camera on.

Voice behavior:

- If no guide exists, says to upload a manual or try the sample PDF.
- `this step is done` marks done and advances unless final.
- `what's next` repeats or advances based on completion state.
- `repeat this` repeats the current step.
- `what parts do I need` lists parts and hardware.
- `check this` or `does this look right` calls camera-frame check.
- If camera is off and a visual check is requested, asks permission to enable camera or suggests photo upload.
- If mic or realtime connection fails, shows a clear error and leaves the app usable.
- Never invents parts or steps.
- Refers only to the current analyzed guide.
- Uses safety-aware language around tools, heavy parts, wall mounting, glass, electrical components, and unstable assemblies.

Live camera:

- starts only after user toggles camera on.
- uses `navigator.mediaDevices.getUserMedia({ video: true })`.
- does not continuously stream camera frames.
- captures frames only after explicit check actions or realtime tool calls.
- frame capture draws video to canvas, converts to image data, and calls the same verification helper as uploaded progress photos.
- permission denial explains the upload alternative.
- cleanup stops media tracks.

## Error Handling

- Missing `OPENAI_API_KEY` produces clear analysis, verification, and illustration errors.
- Missing Gemini or Google key produces a motion-video unavailable state.
- Analysis failures do not inject static fallback data.
- Sample PDF fetch failures show a clear notice.
- Image generation failures set the individual step visual state to error with retry.
- Stale illustration results are ignored through a run id/ref.
- Realtime connection failures set voice state to error and keep the rest of the app functional.
- Camera permission failures preserve the photo-upload path.
- Optional missing model fields are normalized so the UI does not crash.

## Testing Plan

Add `node:test` contract tests that assert:

- analyze route reads `manual.arrayBuffer`.
- analyze route creates `manualFile` with `base64Data`.
- analyze helper sends uploaded PDF as `input_file`.
- analysis prompt avoids generic fallback for uploaded PDFs.
- `parseJsonOutput` supports `output_text` and nested output content.
- `normalizeAnalysis` handles instructions, actions, cautions, hardware, quantity, and qty.
- page initial analysis state is null and empty.
- sample button fetches bundled sample PDF and posts to `/api/analyze`.
- sample flow does not directly set `sampleAnalysis` client-side.
- page guards optional screws, instruction, and simpleCheck.
- generated visual queue exists and replaces demo SVG after analysis.
- illustration helper uses project name, parts, and screws.
- illustration prompt contains manual-accurate, do-not-invent, orthographic, label-only, and before-and-after requirements.
- motion video helper imports `@google/genai`.
- motion video helper uses `veo-3.1-fast-generate-preview`.
- motion video helper reads `GEMINI_API_KEY` or `GOOGLE_API_KEY`.
- motion video helper uses `generateVideos` and `imageBytes`.
- motion video routes create, poll, and proxy content.
- realtime session route exists.
- realtime model defaults to `gpt-realtime-2` and supports `REALTIME_MODEL`.
- realtime route never exposes `OPENAI_API_KEY`.
- page includes voice toggle states.
- page includes live camera enable and disable flow.
- tool handlers exist for next, previous, repeat, mark done, list parts, and camera check.
- camera frame capture calls the same verification pipeline as uploaded progress photos.
- voice feature is disabled or empty when no guide exists.
- voice cleanup stops media tracks and closes realtime connection.

## Verification Plan

Final implementation verification will run:

- `npm run typecheck`.
- `npm run build`.
- `npm test`.
- start the dev server.
- open the app in Browser Use.

Browser verification will check:

- empty first-run state.
- user upload path.
- sample PDF path uses `/api/analyze`.
- step rail selection.
- generated visual states.
- progress photo attach and check.
- live camera enable, preview, and frame capture check when permission is available.
- voice toggle UI states.
- simulated realtime tool calls navigate steps and update checks.
- desktop three-column layout.
- mobile one-column layout with no overlapping text.

## GitHub Readiness

`package.json` scripts:

- `dev`: `next dev`.
- `build`: `next build`.
- `start`: `next start`.
- `test`: `node --test`.
- `lint`: `eslint .`.
- `typecheck`: `tsc --noEmit`.

README includes:

- app name and product summary.
- stack.
- setup with `npm install`, `npm run dev`, and `http://localhost:3000`.
- environment variables:
  - `OPENAI_API_KEY`.
  - `REALTIME_MODEL` optional, default `gpt-realtime-2`.
  - `ANALYSIS_MODEL` optional, default `gpt-5.5`.
  - `VERIFICATION_MODEL` optional, default `gpt-5.5`.
  - `IMAGE_MODEL` optional, default `gpt-image-2`.
  - `GEMINI_API_KEY` or `GOOGLE_API_KEY` optional for Veo.
- empty first-run state.
- sample PDF flow.
- voice and camera privacy behavior.
- demo flow.
- API routes.
- local checks.

`.gitignore` includes:

- `node_modules`.
- `.next`.
- `out`.
- `dist`.
- `.env`.
- `.env.local`.
- `.env.*.local`.
- npm, yarn, and pnpm debug logs.
- `.DS_Store`.

## Acceptance Criteria

- App starts empty with no sample data loaded.
- User can upload a PDF and build a guide.
- User can click Sample and analyze the bundled sample PDF through `/api/analyze`.
- Sample flow does not bypass the API with hardcoded client data.
- API failures show clear errors instead of silently substituting sample analysis.
- Optional realtime voice agent can control the page through tool calls.
- Optional camera frame checking uses the same verification pipeline as uploaded photos.
- TypeScript passes.
- Build passes.
- Tests pass.
- UI matches a dark technical visual assembly portal.
- Repo is ready to push to GitHub.
