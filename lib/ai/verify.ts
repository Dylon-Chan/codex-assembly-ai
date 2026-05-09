import type { VerifyResult, VerifyStatus } from "../types";
import { callResponses, parseJsonOutput } from "./openai";

type VerifyRecord = Record<string, unknown>;

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

export async function verifyProgressPhoto(stepTitle: string, photoDataUrl?: string): Promise<VerifyResult> {
  const content: Record<string, unknown>[] = [
    {
      type: "input_text",
      text: [
        `Check whether this progress photo satisfies the current assembly step: ${stepTitle}.`,
        "Return only valid JSON with status pass|warning|fail, score, message, checklist, nextFix.",
        "Use checklist as an array of visible checks. Keep score from 0 to 1.",
        "Be safety-aware and mention specific visible alignment, fastening, orientation, or missing-photo issues."
      ].join(" ")
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
