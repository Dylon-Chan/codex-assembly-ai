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

  return {
    id: stringValue(step.id, `step-${index + 1}`),
    title: stringValue(step.title ?? step.name, `Step ${index + 1}`),
    duration: stringValue(step.duration ?? step.time, "See manual"),
    risk: normalizeRisk(step.risk, cautions),
    instruction: stringValue(step.instruction ?? step.instructions ?? step.actions, "Follow the product-specific manual diagram for this step."),
    simpleCheck: stringValue(step.simpleCheck ?? step.check, cautions[0] ?? "Confirm parts are flush and fasteners are snug."),
    parts,
    screws,
    cautions
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
              "You are an assembly-manual analyst. Return JSON-only output that matches this schema exactly.",
              "Use the uploaded manual as the source of truth and produce exact product-specific parts, hardware, cautions, and step instructions.",
              "Do not invent generic instructions when the manual contains product details.",
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
              `Analyze the uploaded PDF manual named ${manualFile.filename}.`,
              partPhotoNames.length > 0
                ? `Optional part photo filenames for cross-reference: ${partPhotoNames.join(", ")}.`
                : "No part photo filenames were provided.",
              "Return only valid JSON for this exact product-specific assembly guide."
            ].join("\n")
          },
          {
            type: "input_file",
            filename: manualFile.filename,
            file_data: manualFile.base64Data
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
