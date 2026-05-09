# AssembleAI

## Product Summary

AssembleAI turns a product manual PDF into an interactive visual assembly guide with step analysis, generated illustrations, progress checks, and optional hands-free controls.

## Stack

- Next.js App Router
- React
- TypeScript
- OpenAI APIs
- Google Gen AI for optional Veo motion video
- Node test runner
- ESLint

## Setup

Install dependencies with `npm install`, then run `npm run dev` for local development.

## Environment

- `OPENAI_API_KEY`: required for analysis, verification, and illustrations.
- `REALTIME_MODEL`: optional, defaults to `gpt-realtime-2`.
- `ANALYSIS_MODEL`: optional, defaults to `gpt-5.5`.
- `VERIFICATION_MODEL`: optional, defaults to `gpt-5.5`.
- `IMAGE_MODEL`: optional, defaults to `gpt-image-2`.
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`: optional for Veo motion video.

## Empty State

The app starts without a loaded manual and prompts the user to upload a PDF or use the bundled sample flow.

## Sample PDF Flow

The bundled sample PDF uses the same analysis path as uploaded manuals so demos exercise the real app flow.

## Voice/Camera Privacy

Voice and camera features are opt-in. Camera frames are used for progress verification only when the user explicitly enables the feature.

## Demo Flow

The demo path loads a sample manual, analyzes assembly steps, displays generated visuals, and supports progress verification.

## API Routes

API route documentation will be added as analysis, illustration, verification, motion, and realtime endpoints are implemented.

## Local Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
