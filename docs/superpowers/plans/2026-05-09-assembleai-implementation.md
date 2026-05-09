# AssembleAI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GitHub-ready Next.js + TypeScript AssembleAI app that starts empty, analyzes real/manual sample PDFs through the same API, generates step visuals and optional motion videos, verifies progress photos/camera frames, and supports optional realtime voice control.

**Architecture:** Use one Next.js App Router project with server routes for all key-bearing AI calls and a client workspace for the assembly UI. Keep AI helpers in `lib/ai/*`, shared contracts in `lib/types.ts`, sample-only normalization aids in `lib/sample-fixture.ts`, and source contract tests in `tests/*.test.mjs`.

**Tech Stack:** Next.js App Router, TypeScript, React, lucide-react, OpenAI Responses/Images/Realtime APIs via `fetch` and WebRTC, `@google/genai` for Veo, Node `node:test`, ESLint, CSS modules via `app/globals.css`.

---

## File Structure Map

- `package.json`: scripts and dependencies.
- `tsconfig.json`, `next.config.mjs`, `eslint.config.mjs`, `next-env.d.ts`: TypeScript, Next, and lint setup.
- `.gitignore`: GitHub-safe ignored files.
- `README.md`: setup, env vars, demo flow, privacy, API routes, checks.
- `app/layout.tsx`: app metadata and root layout.
- `app/page.tsx`: main client workspace and state machine.
- `app/globals.css`: dark technical platform styles and responsive layout.
- `app/api/analyze/route.ts`: multipart manual analysis endpoint.
- `app/api/verify/route.ts`: progress photo verification endpoint.
- `app/api/illustrate/route.ts`: per-step generated illustration endpoint.
- `app/api/motion/create/route.ts`: optional Veo create endpoint.
- `app/api/motion/poll/route.ts`: optional Veo poll endpoint.
- `app/api/motion/content/route.ts`: optional Veo media proxy endpoint.
- `app/api/realtime/session/route.ts`: ephemeral OpenAI Realtime session endpoint.
- `lib/types.ts`: shared result, step, visual, verification, voice, and motion types.
- `lib/sample-fixture.ts`: deterministic colors and optional-field defaults.
- `lib/ai/openai.ts`: OpenAI fetch helper, output parsing, JSON parsing.
- `lib/ai/analyze.ts`: analysis prompt, manual file conversion, normalization.
- `lib/ai/verify.ts`: verification prompt and photo conversion.
- `lib/ai/illustrate.ts`: image prompt and Images API helper.
- `lib/ai/motion.ts`: Veo prompt, reference image conversion, create/poll normalization.
- `public/samples/assembleai-sample-manual.pdf`: bundled sample PDF fixture.
- `tests/analyze-contract.test.mjs`: source and helper tests for analysis.
- `tests/page-contract.test.mjs`: source tests for first-run, sample, queue, optional guards, voice/camera handlers.
- `tests/media-contract.test.mjs`: source tests for illustration, motion, realtime routes.

---

### Task 1: Scaffold Project, Scripts, Ignore Rules, And README Skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `eslint.config.mjs`
- Create: `next-env.d.ts`
- Create: `.gitignore`
- Create: `README.md`
- Create: `app/layout.tsx`
- Create: `app/globals.css`

- [ ] **Step 1: Write the package and tooling files**

Create `package.json` with these exact scripts and dependency set:

```json
{
  "name": "assembleai",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "node --test",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@google/genai": "^1.0.0",
    "lucide-react": "^0.468.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "typescript": "^5.6.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true
};

export default nextConfig;
```

Create `eslint.config.mjs`:

```js
import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";

export default [
  js.configs.recommended,
  ...nextVitals,
  {
    ignores: [".next/**", "node_modules/**", "dist/**", "out/**"]
  }
];
```

Create `next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// This file is automatically maintained by Next.js.
```

- [ ] **Step 2: Add GitHub-safe ignore rules**

Create `.gitignore`:

```gitignore
node_modules
.next
out
dist
.env
.env.local
.env.*.local
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.DS_Store
```

- [ ] **Step 3: Add initial README content**

Create `README.md` with headings for product summary, stack, setup, env vars, empty state, sample PDF flow, voice/camera privacy, demo flow, API routes, and local checks. Use this exact env section:

```md
## Environment

- `OPENAI_API_KEY`: required for analysis, verification, and illustrations.
- `REALTIME_MODEL`: optional, defaults to `gpt-realtime-2`.
- `ANALYSIS_MODEL`: optional, defaults to `gpt-5.5`.
- `VERIFICATION_MODEL`: optional, defaults to `gpt-5.5`.
- `IMAGE_MODEL`: optional, defaults to `gpt-image-2`.
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`: optional for Veo motion video.
```

- [ ] **Step 4: Add minimal root layout and global CSS reset**

Create `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AssembleAI",
  description: "Visual build assistant for assembly manuals"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create the top of `app/globals.css`:

```css
:root {
  --bg: #05090f;
  --panel: rgba(9, 18, 28, 0.78);
  --panel-strong: rgba(12, 24, 36, 0.94);
  --line: rgba(126, 210, 230, 0.22);
  --line-strong: rgba(132, 229, 255, 0.44);
  --text: #ecf7fb;
  --muted: #8aa4b5;
  --cyan: #3dd8ff;
  --mint: #6ef5b2;
  --amber: #ffbf66;
  --danger: #ff6b86;
  --radius: 8px;
  --shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

button,
input {
  font: inherit;
}
```

- [ ] **Step 5: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and dependencies install successfully.

- [ ] **Step 6: Verify scaffold**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: both commands pass or only fail because `app/page.tsx` does not exist yet. If missing page causes a failure, continue to Task 2.

- [ ] **Step 7: Commit scaffold**

Run:

```bash
git add package.json package-lock.json tsconfig.json next.config.mjs eslint.config.mjs next-env.d.ts .gitignore README.md app/layout.tsx app/globals.css
git commit -m "chore: scaffold AssembleAI app"
```

---

### Task 2: Define Shared Types And AI Helper Foundations

**Files:**
- Create: `lib/types.ts`
- Create: `lib/sample-fixture.ts`
- Create: `lib/ai/openai.ts`
- Test: `tests/analyze-contract.test.mjs`

- [ ] **Step 1: Add failing parser and type contract tests**

Create `tests/analyze-contract.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const openaiSource = () => readFileSync("lib/ai/openai.ts", "utf8");
const analyzeSource = () => readFileSync("lib/ai/analyze.ts", "utf8");

test("parseJsonOutput supports output_text and nested output content", () => {
  const source = openaiSource();
  assert.match(source, /output_text/);
  assert.match(source, /raw\.output/);
  assert.match(source, /output_text/);
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
```

Run:

```bash
npm test
```

Expected: FAIL because `lib/ai/openai.ts` and `lib/ai/analyze.ts` do not exist.

- [ ] **Step 2: Create shared types**

Create `lib/types.ts`:

```ts
export type RiskLevel = "low" | "medium" | "high";

export type Part = {
  id: string;
  name: string;
  quantity: number;
  dimensions: string;
  color: string;
  note: string;
};

export type Hardware = {
  id: string;
  name: string;
  quantity: number;
  dimensions: string;
  note: string;
};

export type AssemblyStep = {
  id: string;
  title: string;
  duration: string;
  risk: RiskLevel;
  instruction: string;
  simpleCheck: string;
  parts: Part[];
  screws: Hardware[];
  cautions: string[];
};

export type AnalysisResult = {
  projectName: string;
  summary: string;
  confidence: number;
  parts: Part[];
  screws: Hardware[];
  steps: AssemblyStep[];
};

export type VerifyStatus = "pass" | "warning" | "fail";

export type VerifyResult = {
  status: VerifyStatus;
  score: number;
  message: string;
  checklist: string[];
  nextFix: string;
};

export type StepVisualState = {
  status: "idle" | "loading" | "ready" | "error";
  imageUrl?: string;
  error?: string;
};

export type MotionState = {
  status: "idle" | "queued" | "creating" | "in_progress" | "ready" | "unavailable" | "error";
  progress: number;
  operationId?: string;
  videoUrl?: string;
  error?: string;
};

export type VoiceState = "off" | "connecting" | "listening" | "speaking" | "muted" | "error";

export type ManualFile = {
  filename: string;
  mimeType: string;
  base64Data: string;
};
```

- [ ] **Step 3: Create deterministic fixture defaults**

Create `lib/sample-fixture.ts`:

```ts
export const FIXTURE_COLORS = [
  "#6dd6ff",
  "#9af0c8",
  "#ffcf70",
  "#c8b7ff",
  "#f08aa6",
  "#8bd2ff"
] as const;

export function fixtureColor(index: number): string {
  return FIXTURE_COLORS[index % FIXTURE_COLORS.length];
}

export function defaultDimension(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "See manual";
}
```

- [ ] **Step 4: Create OpenAI helper**

Create `lib/ai/openai.ts`:

```ts
export const RESPONSES_URL = "https://api.openai.com/v1/responses";
export const IMAGES_URL = "https://api.openai.com/v1/images/generations";

type FetchOptions = {
  body: unknown;
  apiKey?: string;
};

export function requireOpenAIKey(apiKey = process.env.OPENAI_API_KEY): string {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for this AI route.");
  }
  return apiKey;
}

export async function callResponses({ body, apiKey }: FetchOptions): Promise<unknown> {
  const key = requireOpenAIKey(apiKey);
  const response = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof raw === "object" && raw && "error" in raw
      ? JSON.stringify(raw.error)
      : `OpenAI request failed with ${response.status}`;
    throw new Error(message);
  }
  return raw;
}

export function extractResponseText(raw: unknown): string {
  if (typeof raw !== "object" || raw === null) return "";
  const record = raw as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;

  const output = Array.isArray(record.output) ? record.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (typeof item !== "object" || item === null) continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (typeof part !== "object" || part === null) continue;
      const partRecord = part as Record<string, unknown>;
      if (partRecord.type === "output_text" && typeof partRecord.text === "string") {
        chunks.push(partRecord.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

export function parseJsonOutput<T>(raw: unknown, fallback?: T): T {
  const text = extractResponseText(raw).trim();
  if (!text) {
    if (fallback !== undefined) return fallback;
    throw new Error("AI response did not include output text.");
  }

  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw new Error(`AI response was not valid JSON: ${(error as Error).message}`);
  }
}
```

- [ ] **Step 5: Run parser tests**

Run:

```bash
npm test
```

Expected: still FAIL because `lib/ai/analyze.ts` does not exist. Continue to Task 3.

- [ ] **Step 6: Commit helper foundation**

Run:

```bash
git add lib/types.ts lib/sample-fixture.ts lib/ai/openai.ts tests/analyze-contract.test.mjs
git commit -m "feat: add shared AI contracts"
```

---

### Task 3: Implement Analysis Helper And API Route

**Files:**
- Create: `lib/ai/analyze.ts`
- Create: `app/api/analyze/route.ts`
- Modify: `tests/analyze-contract.test.mjs`
- Create: `public/samples/assembleai-sample-manual.pdf`

- [ ] **Step 1: Extend failing analysis route tests**

Append to `tests/analyze-contract.test.mjs`:

```js
test("analyze route reads manual.arrayBuffer and creates manualFile base64Data", () => {
  const source = readFileSync("app/api/analyze/route.ts", "utf8");
  assert.match(source, /manual\.arrayBuffer\(\)/);
  assert.match(source, /manualFile/);
  assert.match(source, /base64Data/);
});

test("analyze helper sends uploaded PDF as input_file", () => {
  const source = analyzeSource();
  assert.match(source, /input_file/);
  assert.match(source, /data:\$\{manualFile\.mimeType\};base64,\$\{manualFile\.base64Data\}/);
});

test("analysis prompt avoids generic fallback for uploaded PDF", () => {
  const source = analyzeSource();
  assert.match(source, /do not return generic fallback data/i);
  assert.match(source, /specific to the exact product/i);
});
```

Run:

```bash
npm test
```

Expected: FAIL because route/helper do not exist.

- [ ] **Step 2: Implement analysis helper**

Create `lib/ai/analyze.ts`:

```ts
import { fixtureColor, defaultDimension } from "@/lib/sample-fixture";
import type { AnalysisResult, AssemblyStep, Hardware, ManualFile, Part, RiskLevel } from "@/lib/types";
import { callResponses, parseJsonOutput } from "./openai";

type RawRecord = Record<string, unknown>;

const ANALYSIS_SCHEMA = `{
  "projectName": "string",
  "summary": "string",
  "confidence": 0.0,
  "parts": [{"id":"string","name":"string","quantity":1,"dimensions":"string","color":"string","note":"string"}],
  "screws": [{"id":"string","name":"string","quantity":1,"dimensions":"string","note":"string"}],
  "steps": [{"id":"string","title":"string","duration":"string","risk":"low|medium|high","instruction":"string","simpleCheck":"string","parts":[],"screws":[],"cautions":[]}]
}`;

export function buildAnalysisPrompt(manualFile: ManualFile, partPhotoNames: string[]): unknown[] {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: `Return JSON only matching this AnalysisResult schema: ${ANALYSIS_SCHEMA}`
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            `Analyze the attached PDF manual named ${manualFile.filename}.`,
            "Return a guide specific to the exact product in the manual.",
            "Do not return generic fallback data.",
            "Include part photo names when relevant.",
            partPhotoNames.length > 0 ? `Part photo names: ${partPhotoNames.join(", ")}` : "No part photos were uploaded."
          ].join(" ")
        },
        {
          type: "input_file",
          filename: manualFile.filename,
          file_data: `data:${manualFile.mimeType};base64,${manualFile.base64Data}`
        }
      ]
    }
  ];
}

function asRecord(value: unknown): RawRecord {
  return typeof value === "object" && value !== null ? (value as RawRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textFrom(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length > 0) {
      const joined = value.filter((item) => typeof item === "string").join(" ").trim();
      if (joined) return joined;
    }
  }
  return "";
}

function numberFrom(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  }
  return 1;
}

function riskFrom(value: unknown, cautions: unknown[]): RiskLevel {
  if (value === "low" || value === "medium" || value === "high") return value;
  return cautions.length > 0 ? "high" : "medium";
}

function normalizePart(value: unknown, index: number): Part {
  const record = asRecord(value);
  return {
    id: textFrom(record.id, record.partId, `P${index + 1}`),
    name: textFrom(record.name, record.label, `Part ${index + 1}`),
    quantity: numberFrom(record.count, record.quantity, record.qty),
    dimensions: defaultDimension(record.dimensions),
    color: textFrom(record.color) || fixtureColor(index),
    note: textFrom(record.note, record.notes) || "Confirm orientation against the manual."
  };
}

function normalizeHardware(value: unknown, index: number): Hardware {
  const record = asRecord(value);
  return {
    id: textFrom(record.id, record.hardwareId, `H${index + 1}`),
    name: textFrom(record.name, record.label, `Hardware ${index + 1}`),
    quantity: numberFrom(record.count, record.quantity, record.qty),
    dimensions: defaultDimension(record.dimensions),
    note: textFrom(record.note, record.notes) || "Use only where specified."
  };
}

function normalizeStep(value: unknown, index: number, allParts: Part[], allHardware: Hardware[]): AssemblyStep {
  const record = asRecord(value);
  const cautions = asArray(record.cautions ?? record.warnings).filter((item): item is string => typeof item === "string");
  const parts = asArray(record.parts).length > 0 ? asArray(record.parts).map(normalizePart) : allParts.slice(0, 3);
  const screws = asArray(record.screws ?? record.hardware).length > 0
    ? asArray(record.screws ?? record.hardware).map(normalizeHardware)
    : allHardware.slice(0, 3);
  const instruction = textFrom(record.instruction, record.instructions, record.actions) || "Follow the manual diagram and align the listed parts before fastening.";
  return {
    id: textFrom(record.id, `S${index + 1}`),
    title: textFrom(record.title, record.name, `Step ${index + 1}`),
    duration: textFrom(record.duration, record.time) || "5 min",
    risk: riskFrom(record.risk, cautions),
    instruction,
    simpleCheck: textFrom(record.simpleCheck, cautions[0], record.warning) || "Parts are flush, square, and fasteners are seated.",
    parts,
    screws,
    cautions
  };
}

export function normalizeAnalysis(raw: unknown): AnalysisResult {
  const record = asRecord(raw);
  const parts = asArray(record.parts).map(normalizePart);
  const screws = asArray(record.screws ?? record.hardware).map(normalizeHardware);
  const steps = asArray(record.steps).map((step, index) => normalizeStep(step, index, parts, screws));

  return {
    projectName: textFrom(record.projectName, record.productName, record.name) || "Uploaded Assembly",
    summary: textFrom(record.summary, record.overview) || "AI extracted a visual assembly guide from the uploaded manual.",
    confidence: Math.max(0, Math.min(1, numberFrom(record.confidence, record.score, 0.82))),
    parts,
    screws,
    steps: steps.length > 0 ? steps : [
      normalizeStep({
        title: "Review manual",
        instruction: "The manual was processed, but the model returned no step list. Review the uploaded PDF and try again with a clearer manual.",
        cautions: ["No structured steps were detected."]
      }, 0, parts, screws)
    ]
  };
}

export async function analyzeManual(manualFile: ManualFile, partPhotoNames: string[]): Promise<AnalysisResult> {
  const raw = await callResponses({
    body: {
      model: process.env.ANALYSIS_MODEL || "gpt-5.5",
      input: buildAnalysisPrompt(manualFile, partPhotoNames)
    }
  });
  const parsed = parseJsonOutput<unknown>(raw);
  return normalizeAnalysis(parsed);
}
```

- [ ] **Step 3: Implement analyze route**

Create `app/api/analyze/route.ts`:

```ts
import { NextResponse } from "next/server";
import type { ManualFile } from "@/lib/types";
import { analyzeManual } from "@/lib/ai/analyze";

export const runtime = "nodejs";

function fileNames(files: FormDataEntryValue[]): string[] {
  return files.filter((entry): entry is File => entry instanceof File).map((file) => file.name);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const manual = formData.get("manual");

    if (!(manual instanceof File)) {
      return NextResponse.json({ error: "Upload a PDF manual before building a guide." }, { status: 400 });
    }

    const arrayBuffer = await manual.arrayBuffer();
    const manualFile: ManualFile = {
      filename: manual.name || "manual.pdf",
      mimeType: manual.type || "application/pdf",
      base64Data: Buffer.from(arrayBuffer).toString("base64")
    };

    const partPhotoNames = fileNames(formData.getAll("partPhotos"));
    const analysis = await analyzeManual(manualFile, partPhotoNames);
    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Manual analysis failed." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Add bundled sample PDF fixture**

Create `public/samples/assembleai-sample-manual.pdf` as a minimal valid text-based PDF fixture. Use a small generated PDF with content describing a compact wall shelf assembly, including side panels, shelves, back rail, brackets, screws, anchors, and 4 assembly steps. The file must be committed and fetched by the sample button.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: tests pass for analysis helper/source contracts; typecheck may fail until aliases are configured by Next and app files exist. Fix any import/path issue immediately.

- [ ] **Step 6: Commit analysis slice**

Run:

```bash
git add lib/ai/analyze.ts app/api/analyze/route.ts tests/analyze-contract.test.mjs public/samples/assembleai-sample-manual.pdf
git commit -m "feat: add PDF analysis pipeline"
```

---

### Task 4: Implement Verification, Illustration, Motion, And Realtime API Routes

**Files:**
- Create: `lib/ai/verify.ts`
- Create: `app/api/verify/route.ts`
- Create: `lib/ai/illustrate.ts`
- Create: `app/api/illustrate/route.ts`
- Create: `lib/ai/motion.ts`
- Create: `app/api/motion/create/route.ts`
- Create: `app/api/motion/poll/route.ts`
- Create: `app/api/motion/content/route.ts`
- Create: `app/api/realtime/session/route.ts`
- Create: `tests/media-contract.test.mjs`

- [ ] **Step 1: Add failing media and realtime contract tests**

Create `tests/media-contract.test.mjs`:

```js
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

test("realtime session route exists, defaults model, supports override, and never exposes server key", () => {
  const source = read("app/api/realtime/session/route.ts");
  assert.match(source, /gpt-realtime-2/);
  assert.match(source, /REALTIME_MODEL/);
  assert.doesNotMatch(source, /OPENAI_API_KEY.*json/i);
  assert.match(source, /client_secret/);
});
```

Run:

```bash
npm test
```

Expected: FAIL because media helpers/routes do not exist.

- [ ] **Step 2: Implement verification helper and route**

Create `lib/ai/verify.ts`:

```ts
import type { VerifyResult, VerifyStatus } from "@/lib/types";
import { callResponses, parseJsonOutput } from "./openai";

function normalizeStatus(value: unknown): VerifyStatus {
  return value === "pass" || value === "warning" || value === "fail" ? value : "warning";
}

function normalizeChecklist(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function normalizeVerifyResult(value: unknown): VerifyResult {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const score = typeof record.score === "number" ? record.score : 0.5;
  return {
    status: normalizeStatus(record.status),
    score: Math.max(0, Math.min(1, score)),
    message: typeof record.message === "string" ? record.message : "AI check completed.",
    checklist: normalizeChecklist(record.checklist),
    nextFix: typeof record.nextFix === "string" ? record.nextFix : "Retake a wide photo and verify the step alignment."
  };
}

export async function verifyProgressPhoto(stepTitle: string, photoDataUrl?: string): Promise<VerifyResult> {
  const content: Record<string, unknown>[] = [
    {
      type: "input_text",
      text: [
        `Check whether this progress photo satisfies the current assembly step: ${stepTitle}.`,
        "Return only JSON with status pass|warning|fail, score, message, checklist[], nextFix.",
        "Be safety-aware and mention specific visible alignment or fastening issues."
      ].join(" ")
    }
  ];
  if (photoDataUrl) {
    content.push({ type: "input_image", image_url: photoDataUrl });
  }

  const raw = await callResponses({
    body: {
      model: process.env.VERIFICATION_MODEL || "gpt-5.5",
      input: [{ role: "user", content }]
    }
  });
  return normalizeVerifyResult(parseJsonOutput<unknown>(raw));
}
```

Create `app/api/verify/route.ts`:

```ts
import { NextResponse } from "next/server";
import { verifyProgressPhoto } from "@/lib/ai/verify";

export const runtime = "nodejs";

async function fileToDataUrl(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  return `data:${file.type || "image/jpeg"};base64,${bytes.toString("base64")}`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const stepTitle = String(formData.get("stepTitle") || "");
    const photo = formData.get("photo");
    const frame = formData.get("frame");
    const image = photo instanceof File ? photo : frame instanceof File ? frame : null;

    if (!stepTitle.trim()) {
      return NextResponse.json({ error: "stepTitle is required." }, { status: 400 });
    }

    const result = await verifyProgressPhoto(stepTitle, image ? await fileToDataUrl(image) : undefined);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Progress verification failed." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Implement illustration helper and route**

Create `lib/ai/illustrate.ts`:

```ts
import type { AssemblyStep } from "@/lib/types";
import { IMAGES_URL, requireOpenAIKey } from "./openai";

export function buildIllustrationPrompt(projectName: string, step: AssemblyStep): string {
  const parts = step.parts.map((part) => `${part.id}: ${part.name} x${part.quantity}`).join(", ") || "No parts listed";
  const screws = step.screws.map((item) => `${item.id}: ${item.name} x${item.quantity}`).join(", ") || "No hardware listed";
  return [
    "Create a manual-accurate instructional assembly visual.",
    `Project: ${projectName}.`,
    `Step: ${step.title}.`,
    `Instruction: ${step.instruction}.`,
    `Provided parts: ${parts}.`,
    `Provided hardware: ${screws}.`,
    "Use an orthographic technical-manual view or clean isometric exploded view.",
    "Show before-and-after placement, ghosted starting position, movement path arrows, and final seated/fastened position.",
    "Emphasize exact join points, hole alignment, screw entry direction, rail orientation, bracket orientation, drawer interlock orientation, wall-anchor placement, and left/right markings.",
    "Do not invent hardware, parts, holes, labels, tools, panels, drawers, rails, brackets, fasteners, wall hardware, or safety mechanisms.",
    "Label only provided part IDs and hardware IDs.",
    "Use large sparse readable labels, graphite outlines, teal active highlights, amber fastener highlights, and white background.",
    "No decorative room scene, no lifestyle photo, no tiny unreadable text, no extra unlisted components."
  ].join(" ");
}

export async function generateStepIllustration(projectName: string, step: AssemblyStep): Promise<{ imageUrl: string }> {
  const key = requireOpenAIKey();
  const response = await fetch(IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.IMAGE_MODEL || "gpt-image-2",
      prompt: buildIllustrationPrompt(projectName, step),
      size: "1024x1024"
    })
  });
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(JSON.stringify(raw));
  const item = Array.isArray(raw.data) ? raw.data[0] : null;
  if (item?.url) return { imageUrl: item.url };
  if (item?.b64_json) return { imageUrl: `data:image/png;base64,${item.b64_json}` };
  throw new Error("Image generation returned no URL or b64_json.");
}
```

Create `app/api/illustrate/route.ts`:

```ts
import { NextResponse } from "next/server";
import { generateStepIllustration } from "@/lib/ai/illustrate";
import type { AssemblyStep } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { projectName?: string; step?: AssemblyStep };
    if (!body.projectName || !body.step) {
      return NextResponse.json({ error: "projectName and step are required." }, { status: 400 });
    }
    const result = await generateStepIllustration(body.projectName, body.step);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Step illustration failed." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Implement motion helper and routes**

Create `lib/ai/motion.ts`:

```ts
import { GoogleGenAI } from "@google/genai";
import type { AssemblyStep } from "@/lib/types";

export type MotionCreateResult =
  | { status: "unavailable"; error: string }
  | { status: "error"; error: string }
  | { status: "queued" | "in_progress" | "ready"; operationId?: string; videoUrl?: string; progress: number };

const VEO_MODEL = "veo-3.1-fast-generate-preview";

function geminiKey(): string | null {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
}

export function buildMotionPrompt(projectName: string, step: AssemblyStep): string {
  const parts = step.parts.map((part) => `${part.id}: ${part.name} x${part.quantity}`).join(", ");
  const hardware = step.screws.map((item) => `${item.id}: ${item.name} x${item.quantity}`).join(", ");
  return [
    "Apple Vision Pro-style technical assembly animation.",
    `Product: ${projectName}.`,
    `Step: ${step.title}.`,
    `Instruction: ${step.instruction}.`,
    `Parts: ${parts || "No parts listed"}.`,
    `Hardware: ${hardware || "No hardware listed"}.`,
    "Start from the reference image and preserve geometry, colors, labels, and part count.",
    "Animate only the mechanical action.",
    "Use smooth motion, translucent active parts, cyan alignment guides, glowing trails, and a subtle technical grid.",
    "Use a stable camera with a gentle parallax push-in.",
    "No hands, people, room scene, extra tools, extra parts, invented labels, or changed text.",
    "End on a clear final state."
  ].join(" ");
}

export async function referenceToInlineImage(referenceImageUrl: string): Promise<{ imageBytes: string; mimeType: string }> {
  if (referenceImageUrl.startsWith("data:")) {
    const [header, data] = referenceImageUrl.split(",", 2);
    const mimeType = header.match(/data:(.*?);base64/)?.[1] || "image/png";
    return { imageBytes: data, mimeType };
  }
  const response = await fetch(referenceImageUrl);
  if (!response.ok) throw new Error("Reference image could not be loaded.");
  const mimeType = response.headers.get("content-type") || "image/png";
  const imageBytes = Buffer.from(await response.arrayBuffer()).toString("base64");
  return { imageBytes, mimeType };
}

function normalizeOperation(raw: unknown): MotionCreateResult {
  const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const name = typeof record.name === "string" ? record.name : undefined;
  const response = typeof record.response === "object" && record.response !== null
    ? (record.response as Record<string, unknown>)
    : record;
  const generatedVideos = Array.isArray(response.generatedVideos)
    ? response.generatedVideos
    : Array.isArray((response.generateVideoResponse as Record<string, unknown> | undefined)?.generatedSamples)
      ? ((response.generateVideoResponse as Record<string, unknown>).generatedSamples as unknown[])
      : [];
  const first = generatedVideos[0] as Record<string, unknown> | undefined;
  const uri = typeof first?.video === "object" && first.video !== null
    ? (first.video as Record<string, unknown>).uri
    : first?.uri;
  if (typeof uri === "string") {
    return { status: "ready", videoUrl: `/api/motion/content?uri=${encodeURIComponent(uri)}`, progress: 100 };
  }
  return { status: "in_progress", operationId: name, progress: 45 };
}

export async function createMotionVideo(projectName: string, step: AssemblyStep, referenceImageUrl?: string): Promise<MotionCreateResult> {
  const key = geminiKey();
  if (!key) return { status: "unavailable", error: "GEMINI_API_KEY or GOOGLE_API_KEY is required for Veo motion." };
  if (!referenceImageUrl) return { status: "error", error: "A generated reference image is required before motion creation." };
  const { imageBytes, mimeType } = await referenceToInlineImage(referenceImageUrl);
  const ai = new GoogleGenAI({ apiKey: key });
  const operation = await ai.models.generateVideos({
    model: VEO_MODEL,
    prompt: buildMotionPrompt(projectName, step),
    image: { imageBytes, mimeType },
    config: {
      numberOfVideos: 1,
      aspectRatio: "16:9",
      durationSeconds: 8,
      resolution: "720p",
      personGeneration: "allow_adult"
    }
  });
  return normalizeOperation(operation);
}

export async function pollMotionVideo(operationId: string): Promise<MotionCreateResult> {
  const key = geminiKey();
  if (!key) return { status: "unavailable", error: "GEMINI_API_KEY or GOOGLE_API_KEY is required for Veo motion." };
  const ai = new GoogleGenAI({ apiKey: key });
  const operation = await ai.operations.getVideosOperation({ operation: { name: operationId } });
  return normalizeOperation(operation);
}

export async function proxyMotionContent(uri: string): Promise<Response> {
  const key = geminiKey();
  if (!key) return new Response("Missing Gemini API key", { status: 500 });
  const response = await fetch(uri, { headers: { "x-goog-api-key": key } });
  return new Response(response.body, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "video/mp4" }
  });
}
```

Use this shape for route returns:

```ts
export type MotionCreateResult =
  | { status: "unavailable"; error: string }
  | { status: "error"; error: string }
  | { status: "queued" | "in_progress" | "ready"; operationId?: string; videoUrl?: string; progress: number };
```

Create the three motion route files and call the helper functions named in the tests.

- [ ] **Step 5: Implement realtime session route**

Create `app/api/realtime/session/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireOpenAIKey } from "@/lib/ai/openai";

export const runtime = "nodejs";

export async function POST() {
  try {
    const key = requireOpenAIKey();
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.REALTIME_MODEL || "gpt-realtime-2",
        voice: "alloy",
        instructions: "You are AssembleAI, a concise hands-free assembly guide. Use tools for page actions. Never invent parts or steps."
      })
    });
    const raw = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(JSON.stringify(raw));
    return NextResponse.json({
      id: raw.id,
      model: raw.model,
      client_secret: raw.client_secret
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Realtime session failed." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: contract tests pass; typecheck passes or reports concrete API typings to fix in this task.

- [ ] **Step 7: Commit API media slice**

Run:

```bash
git add lib/ai/verify.ts app/api/verify/route.ts lib/ai/illustrate.ts app/api/illustrate/route.ts lib/ai/motion.ts app/api/motion app/api/realtime tests/media-contract.test.mjs
git commit -m "feat: add verification media and realtime routes"
```

---

### Task 5: Build Main Client Workspace State And Empty/Sample/User Analysis Flow

**Files:**
- Create: `app/page.tsx`
- Modify: `tests/page-contract.test.mjs`

- [ ] **Step 1: Add failing page contract tests**

Create `tests/page-contract.test.mjs`:

```js
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
});
```

Run:

```bash
npm test
```

Expected: FAIL because `app/page.tsx` does not exist.

- [ ] **Step 2: Implement app state and upload/sample handlers**

Create `app/page.tsx` as a client component with these exact state foundations:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Camera, Check, ClipboardCheck, FileText, ImageIcon, Loader2, Mic, MicOff, RotateCcw, Upload, Video, Volume2, Wrench, X, ZoomIn } from "lucide-react";
import type { AnalysisResult, AssemblyStep, MotionState, StepVisualState, VerifyResult, VoiceState } from "@/lib/types";

const PHOTO_ATTACHED_RESULT: VerifyResult = {
  status: "warning",
  score: 0.61,
  message: "Photo attached. Run AI check before moving on.",
  checklist: ["Photo is ready for inspection", "Step target loaded", "Waiting for verification"],
  nextFix: "Use a wide photo that includes the whole joint or shelf."
};

export default function Home() {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [productPhoto, setProductPhoto] = useState<File | null>(null);
  const [partPhotos, setPartPhotos] = useState<File[]>([]);
  const [progressPhoto, setProgressPhoto] = useState<File | null>(null);
  const [notice, setNotice] = useState("Upload a manual or try the sample PDF.");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [visuals, setVisuals] = useState<Record<string, StepVisualState>>({});
  const [motions, setMotions] = useState<Record<string, MotionState>>({});
  const [voiceState, setVoiceState] = useState<VoiceState>("off");
  const currentStep = analysis?.steps[currentStepIndex];
  // The upload, sample, visual, verification, camera, and voice handlers are added by the following steps.
}
```

Add `buildGuideFromFile(file: File)`, `handleBuild`, and `handleSample`:

```tsx
const buildGuideFromFile = useCallback(async (file: File) => {
  const formData = new FormData();
  formData.append("manual", file);
  if (productPhoto) formData.append("productPhoto", productPhoto);
  partPhotos.forEach((photo) => formData.append("partPhotos", photo));
  setIsAnalyzing(true);
  setNotice("Analyzing manual with AI.");
  try {
    const response = await fetch("/api/analyze", { method: "POST", body: formData });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Manual analysis failed.");
    const nextAnalysis = payload.analysis as AnalysisResult;
    setAnalysis(nextAnalysis);
    setCurrentStepIndex(0);
    setCompletedSteps(new Set());
    setVerifyResult(null);
    setProgressPhoto(null);
    setNotice("Guide built. Generating step visuals.");
    initializeVisualQueue(nextAnalysis);
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "Manual analysis failed.");
  } finally {
    setIsAnalyzing(false);
  }
}, [partPhotos, productPhoto]);

const handleBuild = useCallback(() => {
  if (!manualFile) return;
  void buildGuideFromFile(manualFile);
}, [buildGuideFromFile, manualFile]);

const handleSample = useCallback(async () => {
  setNotice("Loading bundled sample PDF.");
  try {
    const response = await fetch("/samples/assembleai-sample-manual.pdf");
    if (!response.ok) throw new Error("Sample PDF could not be loaded.");
    const blob = await response.blob();
    const file = new File([blob], "assembleai-sample-manual.pdf", { type: "application/pdf" });
    setManualFile(file);
    await buildGuideFromFile(file);
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "Sample flow failed.");
  }
}, [buildGuideFromFile]);
```

- [ ] **Step 3: Add initial JSX for top bar, empty left panel, center empty state, disabled right panel**

Ensure the rendered text includes:

```tsx
<main className="appShell">
  <header className="topBar">
    <div className="brandBlock">
      <span className="brandMark"><Wrench size={18} /></span>
      <div>
        <strong>AssembleAI</strong>
        <span>visual build assistant</span>
      </div>
    </div>
    <nav className="segmentNav" aria-label="Workspace views">
      <button className="active">Guide</button>
      <button>Parts</button>
      <button>Checks</button>
    </nav>
    <div className="statusCluster">
      <span className="statusChip">{analysis ? `AI extraction ${Math.round(analysis.confidence * 100)}%` : "Ready for manual"}</span>
      <span className="noticeText">{notice}</span>
    </div>
  </header>
  <section className="workspace">
    {/* left, center, right panels */}
  </section>
</main>
```

The left panel must include file labels, `Let's Build`, and `Sample`; center must include the exact empty-state title; right must say checks become available after a guide exists.

- [ ] **Step 4: Run page tests**

Run:

```bash
npm test
npm run typecheck
```

Expected: page contract tests pass. TypeScript may report missing `initializeVisualQueue`; add this stub before `buildGuideFromFile` and replace it in Task 6:

```tsx
const initializeVisualQueue = useCallback((nextAnalysis: AnalysisResult) => {
  setVisuals(Object.fromEntries(nextAnalysis.steps.map((step) => [step.id, { status: "idle" as const }])));
  setMotions({});
}, []);
```

- [ ] **Step 5: Commit initial workspace**

Run:

```bash
git add app/page.tsx tests/page-contract.test.mjs
git commit -m "feat: add empty workspace and analysis flow"
```

---

### Task 6: Implement Generated Visual Queue, Step Rail, Assembly Workspace, Parts, Hardware, And Verification UI

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/page-contract.test.mjs`

- [ ] **Step 1: Extend failing page tests for visual queue and verification**

Append to `tests/page-contract.test.mjs`:

```js
test("generated visual queue exists and replaces demo SVG after analysis", () => {
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
```

Run:

```bash
npm test
```

Expected: FAIL until page is expanded.

- [ ] **Step 2: Implement sequential generated illustration queue**

Add:

```tsx
const runIdRef = useRef(0);

const initializeVisualQueue = useCallback((nextAnalysis: AnalysisResult) => {
  const runId = runIdRef.current + 1;
  runIdRef.current = runId;
  setMotions({});
  setVisuals(Object.fromEntries(nextAnalysis.steps.map((step) => [step.id, { status: "idle" as const }])));

  void (async () => {
    for (const step of nextAnalysis.steps) {
      if (runIdRef.current !== runId) return;
      setVisuals((current) => ({ ...current, [step.id]: { status: "loading" } }));
      try {
        const response = await fetch("/api/illustrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectName: nextAnalysis.projectName, step })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Illustration failed.");
        if (runIdRef.current !== runId) return;
        setVisuals((current) => ({ ...current, [step.id]: { status: "ready", imageUrl: payload.imageUrl } }));
      } catch (error) {
        if (runIdRef.current !== runId) return;
        setVisuals((current) => ({
          ...current,
          [step.id]: { status: "error", error: error instanceof Error ? error.message : "Illustration failed." }
        }));
      }
    }
  })();
}, []);
```

- [ ] **Step 3: Implement step rail, center workspace, visual states, motion shell, parts/hardware panels**

In `app/page.tsx`, render post-analysis UI:

- left header with project name and step count.
- reset button that clears `analysis`, files, visuals, motions, verification, and notice.
- summary box.
- step rail buttons with check/lock visuals.
- center header with `Step X of N`, title, risk pill, visual status.
- instruction band with `Bot`.
- diagram shell with replay and zoom icon buttons.
- generated image states: idle/loading/ready/error.
- frame strip: `Before`, `Move`, `Align`, `Lock`.
- motion preview block with `Veo Motion View` and disabled `Create motion` until image ready.
- parts grid and hardware rows using `(currentStep?.screws ?? [])`.
- simple check callout using `currentStep?.simpleCheck`.

- [ ] **Step 4: Implement progress photo verification and continue**

Add handlers:

```tsx
const handleProgressPhoto = useCallback((file: File | null) => {
  setProgressPhoto(file);
  setVerifyResult(file ? PHOTO_ATTACHED_RESULT : null);
}, []);

const checkCurrentStep = useCallback(async (photoOverride?: File) => {
  if (!currentStep) return;
  const photo = photoOverride || progressPhoto;
  const formData = new FormData();
  formData.append("stepTitle", currentStep.title);
  if (photo) formData.append("photo", photo);
  setNotice("AI is checking this step.");
  const response = await fetch("/api/verify", { method: "POST", body: formData });
  const payload = await response.json();
  if (!response.ok) {
    setNotice(payload.error || "AI check failed.");
    return;
  }
  const result = payload.result as VerifyResult;
  setVerifyResult(result);
  if (result.status === "pass" || result.score >= 0.72) {
    setCompletedSteps((current) => new Set(current).add(currentStep.id));
    setNotice("Step verified. Ready to continue.");
  } else {
    setNotice("AI found something to fix before continuing.");
  }
}, [currentStep, progressPhoto]);

const continueToNextStep = useCallback(() => {
  if (!analysis || currentStepIndex >= analysis.steps.length - 1) return;
  setCurrentStepIndex((index) => index + 1);
  setProgressPhoto(null);
  setVerifyResult(null);
  setNotice("Next step loaded.");
}, [analysis, currentStepIndex]);
```

- [ ] **Step 5: Expand CSS**

Update `app/globals.css` with classes for `appShell`, `topBar`, `workspace`, panels, upload controls, step rail, center stage, generated visuals, motion preview, parts grid, right check panel, disabled states, spinner keyframes, motion preview keyframes, and responsive breakpoints at `1240px`, `860px`, and `540px`.

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: all tests pass and TypeScript passes.

- [ ] **Step 7: Commit full core UI**

Run:

```bash
git add app/page.tsx app/globals.css tests/page-contract.test.mjs
git commit -m "feat: add visual guide workspace"
```

---

### Task 7: Implement Motion Video Client Flow

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add motion handlers**

In `app/page.tsx`, add `createMotionForStep(step: AssemblyStep)`:

```tsx
const createMotionForStep = useCallback(async (step: AssemblyStep) => {
  const visual = visuals[step.id];
  if (visual?.status !== "ready" || !visual.imageUrl || !analysis) return;
  setMotions((current) => ({ ...current, [step.id]: { status: "creating", progress: 20 } }));
  try {
    const response = await fetch("/api/motion/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: analysis.projectName, step, referenceImageUrl: visual.imageUrl })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Motion creation failed.");
    setMotions((current) => ({ ...current, [step.id]: payload }));
  } catch (error) {
    setMotions((current) => ({
      ...current,
      [step.id]: { status: "error", progress: 0, error: error instanceof Error ? error.message : "Motion creation failed." }
    }));
  }
}, [analysis, visuals]);
```

Add polling `useEffect` for states with `operationId` and `queued`/`in_progress`, calling `/api/motion/poll`.

- [ ] **Step 2: Render video states**

In `GeneratedStepMotionVideo` JSX block:

- `idle`: CSS technical preview and disabled/enabled button based on generated reference image.
- `creating`, `queued`, `in_progress`: status text and progress bar.
- `ready`: `<video controls autoPlay muted loop playsInline src={motion.videoUrl} />`.
- `unavailable`/`error`: clear text.

- [ ] **Step 3: Run checks**

Run:

```bash
npm run typecheck
npm test
```

Expected: pass.

- [ ] **Step 4: Commit motion client**

Run:

```bash
git add app/page.tsx app/globals.css
git commit -m "feat: add step motion video flow"
```

---

### Task 8: Implement Live Camera And Realtime Voice Tool Handlers

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/page-contract.test.mjs`

- [ ] **Step 1: Extend failing tests for voice and camera**

Append to `tests/page-contract.test.mjs`:

```js
test("page includes voice toggle states and disabled empty voice mode", () => {
  const source = page();
  assert.match(source, /VoiceState/);
  assert.match(source, /voiceState/);
  assert.match(source, /connecting/);
  assert.match(source, /listening/);
  assert.match(source, /speaking/);
  assert.match(source, /muted/);
  assert.match(source, /Voice mode unlocks after analysis/);
});

test("page includes live camera enable disable flow", () => {
  const source = page();
  assert.match(source, /getUserMedia\(\{ video: true \}\)/);
  assert.match(source, /stopCamera/);
  assert.match(source, /videoRef/);
});

test("tool handlers exist for realtime navigation and camera check", () => {
  const source = page();
  for (const name of ["get_current_step", "go_to_next_step", "go_to_previous_step", "repeat_current_step", "mark_current_step_done", "list_required_parts", "check_current_camera_frame", "stop_voice_agent"]) {
    assert.match(source, new RegExp(name));
  }
});

test("camera frame capture calls same verification pipeline as uploaded progress photos", () => {
  const source = page();
  assert.match(source, /captureCameraFrame/);
  assert.match(source, /checkCurrentStep\(capturedFile\)/);
});

test("voice cleanup stops media tracks and closes realtime connection", () => {
  const source = page();
  assert.match(source, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(source, /peerConnectionRef\.current\?\.close\(\)/);
});
```

Run:

```bash
npm test
```

Expected: FAIL until page is expanded.

- [ ] **Step 2: Implement camera controls**

Add refs and state:

```tsx
const videoRef = useRef<HTMLVideoElement | null>(null);
const cameraStreamRef = useRef<MediaStream | null>(null);
const [cameraEnabled, setCameraEnabled] = useState(false);
const [cameraError, setCameraError] = useState("");
```

Add:

```tsx
const stopCamera = useCallback(() => {
  cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
  cameraStreamRef.current = null;
  setCameraEnabled(false);
}, []);

const toggleCamera = useCallback(async () => {
  if (cameraEnabled) {
    stopCamera();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    cameraStreamRef.current = stream;
    if (videoRef.current) videoRef.current.srcObject = stream;
    setCameraEnabled(true);
    setCameraError("");
  } catch {
    setCameraError("Camera permission was denied. Upload a progress photo instead.");
  }
}, [cameraEnabled, stopCamera]);

const captureCameraFrame = useCallback(async (): Promise<File | null> => {
  const video = videoRef.current;
  if (!video || !cameraEnabled) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  return blob ? new File([blob], "camera-frame.jpg", { type: "image/jpeg" }) : null;
}, [cameraEnabled]);
```

- [ ] **Step 3: Implement realtime lifecycle**

Add refs:

```tsx
const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
const micStreamRef = useRef<MediaStream | null>(null);
const dataChannelRef = useRef<RTCDataChannel | null>(null);
const [voiceTranscript, setVoiceTranscript] = useState("");
const [agentTranscript, setAgentTranscript] = useState("");
const [voiceAction, setVoiceAction] = useState("");
```

Implement `startVoiceAgent`, `stopVoiceAgent`, `toggleMute`, and data-channel event handling:

- POST `/api/realtime/session`.
- request mic with `getUserMedia({ audio: true })`.
- create `RTCPeerConnection`.
- add mic tracks.
- create data channel.
- exchange SDP with OpenAI Realtime endpoint using ephemeral token.
- register tools by sending session update with tool schemas.
- handle tool call events by calling `handleRealtimeToolCall`.
- cleanup closes data channel, peer connection, and mic tracks.

- [ ] **Step 4: Implement realtime tool handlers**

Add a single `handleRealtimeToolCall(name: string, args: Record<string, unknown>)` that supports exactly:

- `get_current_step`
- `go_to_next_step`
- `go_to_previous_step`
- `repeat_current_step`
- `mark_current_step_done`
- `list_required_parts`
- `check_current_camera_frame`
- `stop_voice_agent`

For `check_current_camera_frame`, if camera is off return a message asking permission or suggesting upload. If on, call:

```tsx
const capturedFile = await captureCameraFrame();
if (capturedFile) await checkCurrentStep(capturedFile);
```

- [ ] **Step 5: Render voice controls and camera preview**

Render:

- disabled voice button before analysis with text `Voice mode unlocks after analysis`.
- voice states off/connecting/listening/speaking/muted/error.
- mute/unmute and end session buttons when active.
- transcript/status strip with user speech, agent response, and current action.
- live camera toggle in AI check panel.
- `<video ref={videoRef} autoPlay muted playsInline />` preview only when camera is enabled.
- camera check button that captures a frame and calls `checkCurrentStep(capturedFile)`.

- [ ] **Step 6: Cleanup effect**

Add:

```tsx
useEffect(() => {
  return () => {
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    peerConnectionRef.current?.close();
  };
}, []);
```

- [ ] **Step 7: Run checks**

Run:

```bash
npm test
npm run typecheck
```

Expected: pass.

- [ ] **Step 8: Commit voice and camera**

Run:

```bash
git add app/page.tsx app/globals.css tests/page-contract.test.mjs
git commit -m "feat: add realtime voice and camera checks"
```

---

### Task 9: Finish Styling, README, And Static Quality Checks

**Files:**
- Modify: `app/globals.css`
- Modify: `README.md`
- Modify: `app/page.tsx`

- [ ] **Step 1: Complete responsive CSS**

Ensure `app/globals.css` contains:

- `appShell` min-height `100vh`.
- top bar grid with brand/nav/status/voice clusters.
- desktop workspace grid: `minmax(260px, 304px) minmax(560px, 1fr) minmax(300px, 356px)`.
- `@media (max-width: 1240px)` two-column workspace with right panel spanning full width.
- `@media (max-width: 860px)` one-column workspace.
- `@media (max-width: 540px)` compact padding and stacked setup actions.
- spinner keyframes.
- motion preview keyframes.
- voice pulse/listening animation.
- visually hidden file inputs inside labels.
- disabled button styling.
- image, video, and camera preview `max-width: 100%`, `object-fit: contain`, and stable dimensions.

- [ ] **Step 2: Complete README**

Update `README.md` with:

- app name and product summary.
- stack.
- setup:

```bash
npm install
npm run dev
```

- open `http://localhost:3000`.
- all env vars from the spec.
- empty first-run state explanation.
- sample PDF flow explanation.
- voice/camera privacy behavior.
- demo flow:
  1. Upload PDF or click Sample.
  2. Analyze guide.
  3. Review extracted steps.
  4. Inspect instruction, diagram, parts, hardware.
  5. Upload progress photo or enable camera.
  6. Check this step.
  7. Continue after successful check.
  8. Optionally enable voice and ask hands-free commands.
- API routes.
- local checks.

- [ ] **Step 3: Run static checks**

Run:

```bash
npm run lint
npm run typecheck
npm test
```

Expected: all pass.

- [ ] **Step 4: Commit polish**

Run:

```bash
git add app/globals.css app/page.tsx README.md
git commit -m "docs: finish AssembleAI GitHub readiness"
```

---

### Task 10: Build, Browser Verification, Fixes, And Final Commit

**Files:**
- Modify as needed based on failures.

- [ ] **Step 1: Run production build**

Run:

```bash
npm run build
```

Expected: build passes. Fix any Next.js server/client boundary, import, or lint issue before proceeding.

- [ ] **Step 2: Start dev server**

Run:

```bash
npm run dev
```

Expected: server starts on `http://localhost:3000`.

- [ ] **Step 3: Open app with Browser Use**

Use Browser Use to open `http://localhost:3000`.

Verify:

- empty first-run state.
- no project name, steps, parts, score, or guide preloaded.
- notice reads `Upload a manual or try the sample PDF.`
- left panel shows upload controls, disabled `Let's Build`, and `Sample`.
- center empty title reads `Load a manual to build a visual guide`.
- right AI check and voice are disabled/empty.

- [ ] **Step 4: Verify sample path**

In the browser:

- click `Sample`.
- confirm request goes to `/api/analyze`.
- confirm the app shows either a live guide or a clear AI/API error.
- confirm no hardcoded sample guide appears if the API fails.

- [ ] **Step 5: Verify upload path**

In the browser:

- select the bundled sample PDF through the manual upload control.
- click `Let's Build`.
- confirm it posts to `/api/analyze`.
- confirm guide state resets to step 1 when analysis succeeds.

- [ ] **Step 6: Verify guide interactions**

In the browser:

- click step rail items.
- inspect generated visual states.
- use retry if an illustration fails.
- inspect parts and hardware panels.
- upload a progress photo.
- confirm warning state score `0.61` appears.
- click `Check this step`.
- confirm `/api/verify` is called and result renders.
- use `Continue` after a pass or qualifying score.

- [ ] **Step 7: Verify camera and voice UI**

In the browser:

- toggle camera on and confirm preview or permission-denied upload alternative.
- capture a frame and confirm it calls the same verification pipeline.
- confirm voice controls are disabled before guide and enabled after guide.
- start voice mode if browser permissions allow.
- simulate tool calls by invoking the page handlers from UI or console-accessible test hooks if needed.
- confirm next/previous/repeat/mark done/list parts/camera check handlers update state.
- end voice session and confirm mic/camera tracks stop.

- [ ] **Step 8: Verify responsive layout**

In Browser Use:

- desktop viewport: confirm three columns and no overlapping text.
- mobile viewport below `860px`: confirm one column and no overlapping text.
- viewport below `540px`: confirm compact controls fit.

- [ ] **Step 9: Run final commands**

Run:

```bash
npm run typecheck
npm run build
npm test
```

Expected: all pass.

- [ ] **Step 10: Commit final fixes**

If any files changed during browser/build fixes, run:

```bash
git add app lib tests README.md package.json package-lock.json public .gitignore tsconfig.json next.config.mjs eslint.config.mjs next-env.d.ts
git commit -m "fix: verify AssembleAI app flows"
```

If no files changed, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: every approved subsystem maps to at least one task: scaffold/README, analysis/sample PDF, verification, illustration, motion, realtime, camera, styling, tests, and browser verification.
- Placeholder scan: the plan avoids incomplete marker terms. The only intentionally flexible item is browser-driven fix work in Task 10 because exact failures are unknowable before verification.
- Type consistency: shared type names are established in Task 2 and reused consistently across later tasks: `AnalysisResult`, `AssemblyStep`, `VerifyResult`, `StepVisualState`, `MotionState`, `VoiceState`, and `ManualFile`.
