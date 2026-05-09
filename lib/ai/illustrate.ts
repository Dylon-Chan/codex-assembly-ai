import type { AssemblyStep } from "../types";
import { IMAGES_URL, requireOpenAIKey } from "./openai";

type ImageGenerationItem = {
  url?: string;
  b64_json?: string;
};

type ImageGenerationResponse = {
  data?: ImageGenerationItem[];
  error?: unknown;
};

export function buildIllustrationPrompt(projectName: string, step: AssemblyStep): string {
  const parts = step.parts.map((part) => `${part.id}: ${part.name} x${part.quantity}`).join(", ") || "No parts listed";
  const screws = step.screws.map((screw) => `${screw.id}: ${screw.name} x${screw.quantity}`).join(", ") || "No hardware listed";
  const cautions = step.cautions.join(", ") || "No cautions listed";

  return [
    "Create a manual-accurate instructional assembly visual.",
    `Project: ${projectName}.`,
    `Step: ${step.title}.`,
    `Instruction: ${step.instruction}.`,
    `Provided parts: ${parts}.`,
    `Provided screws and hardware: ${screws}.`,
    `Cautions: ${cautions}.`,
    "Use an orthographic technical-manual view or clean isometric exploded view.",
    "Show before-and-after placement, ghosted starting position, movement path arrows, and final seated or fastened position.",
    "Emphasize exact join points, hole alignment, screw entry direction, rail orientation, bracket orientation, drawer interlock orientation, wall-anchor placement, and left/right markings.",
    "Do not invent hardware, parts, holes, labels, tools, panels, drawers, rails, brackets, fasteners, wall hardware, or safety mechanisms.",
    "Label only provided part IDs and hardware IDs.",
    "Use large sparse readable labels, graphite outlines, teal active highlights, amber fastener highlights, and a white background.",
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

  const raw = await response.json().catch(() => ({})) as ImageGenerationResponse;
  if (!response.ok) {
    throw new Error(typeof raw.error === "string" ? raw.error : JSON.stringify(raw.error ?? raw));
  }

  const item = Array.isArray(raw.data) ? raw.data[0] : undefined;
  if (item?.url) return { imageUrl: item.url };
  if (item?.b64_json) return { imageUrl: `data:image/png;base64,${item.b64_json}` };
  throw new Error("Image generation returned no URL or b64_json.");
}
