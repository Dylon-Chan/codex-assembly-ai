import type { VerifyResult, VerifyStatus } from "../types";
import { callResponses, parseJsonOutput } from "./openai";

type VerifyRecord = Record<string, unknown>;

export type VerifyStepCriteria = {
  stepTitle: string;
  instruction?: string;
  simpleCheck?: string;
  cautions?: string[];
  parts?: Array<{ id: string; name: string; quantity: number }>;
  screws?: Array<{ id: string; name: string; quantity: number }>;
};

function asRecord(value: unknown): VerifyRecord {
  return typeof value === "object" && value !== null ? value as VerifyRecord : {};
}

function normalizeStatus(value: unknown): VerifyStatus {
  return value === "pass" || value === "warning" || value === "fail" ? value : "warning";
}

function normalizeScore(value: unknown): number {
  const score = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0.5;
}

function normalizeChecklist(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export function normalizeVerifyResult(value: unknown): VerifyResult {
  const record = asRecord(value);
  return {
    status: normalizeStatus(record.status),
    score: normalizeScore(record.score),
    message: typeof record.message === "string" && record.message.trim()
      ? record.message.trim()
      : "AI check completed.",
    checklist: normalizeChecklist(record.checklist),
    nextFix: typeof record.nextFix === "string" && record.nextFix.trim()
      ? record.nextFix.trim()
      : "Retake a wide photo and verify the step alignment."
  };
}

function formatItems(items: VerifyStepCriteria["parts"]): string {
  return items && items.length > 0
    ? items.map((item) => `- ${item.id}: ${item.name} (qty ${item.quantity})`).join("\n")
    : "None listed";
}

export async function verifyProgressPhoto(criteria: VerifyStepCriteria, photoDataUrl?: string): Promise<VerifyResult> {
  const formattedParts = formatItems(criteria.parts);
  const formattedScrews = formatItems(criteria.screws);
  const formattedCautions = criteria.cautions?.length ? criteria.cautions.join("; ") : "None";

  const content: Record<string, unknown>[] = [
    {
      type: "input_text",
      text: [
        "You are a safety-aware assembly inspector. You are given a progress photo and the full criteria for the current assembly step.",
        "",
        "Your job is to determine whether the visible assembly state matches the expected outcome for this step.",
        "",
        "Status rules:",
        "- pass: all visible criteria are met and it is safe to continue.",
        "- warning: the photo is inconclusive, partially correct, or the key area is obscured; not dangerous but needs attention.",
        "- fail: a visible misalignment, missing part, wrong orientation, or safety issue is present.",
        "",
        "Score: 0.0-1.0 confidence that the step is physically complete and safe. A clear pass should score 0.85+. An inconclusive photo scores 0.5-0.7. A visible failure scores below 0.5.",
        "",
        "message: one sentence summarising what you see.",
        "checklist: 3-5 short items describing what you checked.",
        "nextFix: one specific, actionable sentence telling the user what to correct or do differently for the next photo.",
        "",
        "Return valid JSON only. No markdown, no code fences.",
        "",
        "Check whether this progress photo satisfies the current assembly step.",
        "",
        `Step title: ${criteria.stepTitle}`,
        `Instruction: ${criteria.instruction || ""}`,
        `Expected check: ${criteria.simpleCheck || ""}`,
        `Cautions: ${formattedCautions}`,
        "",
        "Parts that should be present or placed:",
        formattedParts,
        "",
        "Hardware that should be installed:",
        formattedScrews,
        "",
        "Be practical. If the key area is clearly visible and correct, pass it. If the photo is too dark, blurry, or the joint is off-camera, return warning with a specific nextFix."
      ].join("\n")
    }
  ];

  if (photoDataUrl) {
    content.push({ type: "input_image", image_url: photoDataUrl });
  }

  const rawResponse = await callResponses({
    body: {
      model: process.env.VERIFICATION_MODEL || "gpt-5.5",
      input: [{ role: "user", content }]
    }
  });

  return normalizeVerifyResult(parseJsonOutput<unknown>(rawResponse));
}
