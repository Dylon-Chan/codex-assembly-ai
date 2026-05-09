import { defaultDimension, fixtureColor } from "../sample-fixture";
import type { AnalysisResult, AssemblyStep, Hardware, ManualFile, Part, RiskLevel } from "../types";
import { callResponses, parseJsonOutput } from "./openai";

type RecordValue = Record<string, unknown>;

const ANALYSIS_SCHEMA = {
  projectName: "string",
  summary: "string",
  confidence: "number from 0 to 1",
  parts: [
    {
      id: "string",
      name: "string",
      quantity: "number",
      dimensions: "string",
      color: "hex color",
      note: "string"
    }
  ],
  screws: [
    {
      id: "string",
      name: "string",
      quantity: "number",
      dimensions: "string",
      note: "string"
    }
  ],
  steps: [
    {
      id: "string",
      title: "string",
      duration: "string",
      risk: "low | medium | high",
      instruction: "string",
      simpleCheck: "string",
      visualDescription: "string — detailed description of what the manual diagram for this step shows: the intermediate assembly state, which parts are already joined, which parts are mid-motion, exact colors and shapes visible in the diagram, arrow directions, and any alignment marks or callouts shown",
      parts: "array of part objects used in this step",
      screws: "array of hardware objects used in this step",
      cautions: "array of product-specific cautions"
    }
  ]
} as const;

function asRecord(value: unknown): RecordValue {
  return typeof value === "object" && value !== null ? value as RecordValue : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function quantityValue(source: RecordValue, fallback = 1): number {
  return Math.max(1, Math.round(numberValue(source.quantity ?? source.count ?? source.qty, fallback)));
}

function normalizeRisk(value: unknown, cautions: string[]): RiskLevel {
  if (value === "low" || value === "medium" || value === "high") return value;
  return cautions.length > 0 ? "high" : "medium";
}

function normalizeCautions(value: unknown, warning: unknown): string[] {
  const cautions = asArray(value).map((item) => stringValue(item, "")).filter(Boolean);
  const simpleWarning = stringValue(warning, "");
  if (cautions.length === 0 && simpleWarning) return [simpleWarning];
  return cautions;
}

function normalizePart(value: unknown, index: number): Part {
  const part = asRecord(value);
  const name = stringValue(part.name ?? part.label ?? part.title, `Manual part ${index + 1}`);
  return {
    id: stringValue(part.id, `part-${index + 1}`),
    name,
    quantity: quantityValue(part),
    dimensions: defaultDimension(part.dimensions ?? part.dimension ?? part.size),
    color: stringValue(part.color, fixtureColor(index)),
    note: stringValue(part.note ?? part.notes, "Check orientation against the manual.")
  };
}

function normalizeHardware(value: unknown, index: number): Hardware {
  const hardware = asRecord(value);
  const name = stringValue(hardware.name ?? hardware.label ?? hardware.title, `Hardware ${index + 1}`);
  return {
    id: stringValue(hardware.id, `hardware-${index + 1}`),
    name,
    quantity: quantityValue(hardware),
    dimensions: defaultDimension(hardware.dimensions ?? hardware.dimension ?? hardware.size),
    note: stringValue(hardware.note ?? hardware.notes, "Match this hardware to the manual drawing.")
  };
}

function normalizeStep(value: unknown, index: number, allParts: Part[], allHardware: Hardware[]): AssemblyStep {
  const step = asRecord(value);
  const cautions = normalizeCautions(step.cautions, step.warning);
  const parts = asArray(step.parts).length > 0
    ? asArray(step.parts).map((part, partIndex) => normalizePart(part, partIndex))
    : allParts.slice(0, 2);
  const screws = asArray(step.screws ?? step.hardware).length > 0
    ? asArray(step.screws ?? step.hardware).map((hardware, hardwareIndex) => normalizeHardware(hardware, hardwareIndex))
    : allHardware.slice(0, 2);

  const visualDescription = stringValue(step.visualDescription ?? step.visual_description, "");

  return {
    id: stringValue(step.id, `step-${index + 1}`),
    title: stringValue(step.title ?? step.name, `Step ${index + 1}`),
    duration: stringValue(step.duration ?? step.time, "See manual"),
    risk: normalizeRisk(step.risk, cautions),
    instruction: stringValue(step.instruction ?? step.instructions ?? step.actions, "Follow the product-specific manual diagram for this step."),
    simpleCheck: stringValue(step.simpleCheck ?? step.check, cautions[0] ?? "Confirm parts are flush and fasteners are snug."),
    parts,
    screws,
    cautions,
    ...(visualDescription && visualDescription !== "No diagram in manual." ? { visualDescription } : {})
  };
}

export function buildAnalysisPrompt(manualFile: ManualFile, partPhotoNames: string[]) {
  return {
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: [
              "You are AssembleAI, an AI assistant that converts product assembly manuals into structured step-by-step guides.",
              "",
              "Extract exactly what the manual describes. Do not invent steps, parts, hardware, dimensions, or cautions that are not in the document.",
              "",
              "Field quality rules:",
              "- projectName: the exact product name from the manual cover or title page.",
              "- confidence: 0.0-1.0 reflecting how complete and unambiguous the manual is. Use 0.95+ only when all steps, parts, and hardware are clearly described with diagrams.",
              "- summary: one or two sentences describing what is being assembled and roughly how many steps it takes.",
              "- steps[].title: short phrase, 3-6 words, describing the mechanical action, for example Attach left side panel.",
              "- steps[].instruction: a single plain-language sentence a non-expert can follow without looking at any other field. Include the relevant part names and the exact mechanical action.",
              "- steps[].simpleCheck: one visual thing the user can confirm is correct before moving on. Must be different from the instruction.",
              "- steps[].duration: realistic wall-clock estimate in minutes, for example 3 min. Do not use ranges.",
              "- steps[].risk: low for no injury or damage risk, medium for minor pinch or scratch risk, or high for crush, tip-over, or electrical risk.",
              "- steps[].parts[].note: a short placement reminder, not a repeat of the instruction.",
              "- steps[].cautions: safety warnings verbatim or closely paraphrased from the manual. Empty array if none.",
              "- steps[].visualDescription: describe the manual diagram for this step in precise visual terms. Include: (a) the intermediate assembly state — which parts are already joined before this step begins and which are still loose, (b) colors and approximate shapes of every part shown in the diagram, (c) the direction and end-point of any motion arrows, (d) any alignment marks, callout circles, or dimension lines, (e) which sub-assembly or section of the product is shown and from what viewing angle. Write as if describing the image to a blind illustrator who must reproduce it exactly. If no diagram exists for this step, write 'No diagram in manual.'",
              "",
              "Return valid JSON only. No markdown, no code fences, no commentary. JSON-only output is required. Keep the result exact product-specific.",
              JSON.stringify(ANALYSIS_SCHEMA)
            ].join("\n")
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `Analyze the attached PDF manual: "${manualFile.filename}".`,
              "",
              "Return a guide specific to this exact product. Do not return generic or placeholder steps.",
              "",
              "Context available:",
              "- Product photo filename: none",
              partPhotoNames.length > 0
                ? `- Part photo filenames: ${partPhotoNames.join(", ")}`
                : "- Part photo filenames: none",
              "",
              "Use the photo filenames as hints when identifying parts if relevant. The photos themselves are not attached; use only the manual content for extraction."
            ].join("\n")
          },
          {
            type: "input_file",
            filename: manualFile.filename,
            file_data: `data:${manualFile.mimeType};base64,${manualFile.base64Data}`
          }
        ]
      }
    ]
  };
}

export function normalizeAnalysis(raw: unknown): AnalysisResult {
  const source = asRecord(raw);
  const parts = asArray(source.parts).map((part, index) => normalizePart(part, index));
  const screws = asArray(source.screws ?? source.hardware).map((hardware, index) => normalizeHardware(hardware, index));
  const steps = asArray(source.steps ?? source.instructions ?? source.actions)
    .map((step, index) => normalizeStep(step, index, parts, screws));

  return {
    projectName: stringValue(source.projectName ?? source.name ?? source.title, "Assembly project"),
    summary: stringValue(source.summary ?? source.description, "Product-specific assembly guide generated from the uploaded manual."),
    confidence: Math.min(1, Math.max(0, numberValue(source.confidence, 0.7))),
    parts,
    screws,
    steps
  };
}

export async function analyzeManual(manualFile: ManualFile, partPhotoNames: string[] = []): Promise<AnalysisResult> {
  const body = {
    model: process.env.ANALYSIS_MODEL || "gpt-5.5",
    ...buildAnalysisPrompt(manualFile, partPhotoNames)
  };
  const rawResponse = await callResponses({ body });
  const rawAnalysis = parseJsonOutput<unknown>(rawResponse);
  return normalizeAnalysis(rawAnalysis);
}
