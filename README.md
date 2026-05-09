# AssembleAI

AssembleAI turns a product manual PDF into an interactive visual assembly guide. It extracts parts, hardware, safety notes, and step-by-step instructions, then helps the builder inspect generated diagrams and verify progress photos or camera frames before moving on.

## Stack

- Next.js App Router
- React
- TypeScript
- OpenAI APIs for manual analysis, illustration, progress verification, and realtime voice
- Google Gen AI for optional Veo motion video
- Node test runner
- ESLint

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

- `OPENAI_API_KEY`: required for analysis, generated visuals, progress verification, and realtime voice sessions.
- `REALTIME_MODEL`: optional, defaults to `gpt-realtime-2`.
- `ANALYSIS_MODEL`: optional, defaults to `gpt-5.5`.
- `VERIFICATION_MODEL`: optional, defaults to `gpt-5.5`.
- `IMAGE_MODEL`: optional, defaults to `gpt-image-2`.
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`: optional, enables Veo motion video generation.

## First Run

The first screen intentionally starts empty. Upload a manual PDF or choose the sample flow to create the guide, populate the step rail, and unlock progress checks, generated visuals, motion previews, camera checks, and voice controls.

## Sample PDF Flow

The bundled sample uses the same analysis, visual generation, and verification path as an uploaded manual. Use it when you want a quick demo without finding a real PDF: select `Sample`, wait for the analysis, review the generated guide, then continue through the same verification flow used by uploaded manuals.

## Voice And Camera Privacy

Voice and camera controls are opt-in. The app requests microphone or camera permission only after you enable the relevant control. Camera frames are used for progress verification only when you upload a progress photo, press `Check camera frame`, or ask the voice assistant to check the current camera frame. The live camera stream is stopped when you disable camera, reset the guide, or leave the page.

## Demo Flow

1. Upload a manual PDF or choose the sample.
2. Analyze the manual to create the assembly guide.
3. Review the extracted steps in the left rail.
4. Inspect the current instruction, generated diagram, required parts, and hardware.
5. Upload a progress photo or enable the live camera.
6. Check the step with AI verification.
7. Continue to the next step after the check passes.
8. Optionally use voice commands for next step, previous step, repeat, parts, camera check, or stop voice.

## API Routes

- `POST /api/analyze`: analyzes a manual PDF and optional reference photos into structured assembly steps.
- `POST /api/illustrate`: generates a reference image for an assembly step.
- `POST /api/verify`: checks an uploaded progress photo or camera frame against the current step.
- `POST /api/motion/create`: starts optional Veo motion video generation for a generated step image.
- `POST /api/motion/poll`: checks motion generation progress.
- `GET /api/motion/content`: serves generated motion video content.
- `POST /api/realtime/session`: creates a realtime voice session.

## Local Checks

```bash
npm run typecheck
npm run build
npm test
```
