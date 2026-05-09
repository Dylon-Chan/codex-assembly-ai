import type { AssemblyStep } from "../types";
import { IMAGES_URL, requireOpenAIKey } from "./openai";

export const IMAGES_EDIT_URL = "https://api.openai.com/v1/images/edits";
const EDIT_MODEL = "gpt-image-1";

type ImageGenerationItem = {
  url?: string;
  b64_json?: string;
};

type ImageGenerationResponse = {
  data?: ImageGenerationItem[];
  error?: unknown;
};

function formatComponentList<T extends { id: string; name: string; quantity: number }>(items: T[], emptyLabel: string): string {
  return items.length
    ? items.map((item) => `- ${item.id}: ${item.name} (qty ${item.quantity})`).join("\n")
    : `- ${emptyLabel}`;
}

export function buildIllustrationPrompt(projectName: string, step: AssemblyStep, hasReferencePhoto: boolean): string {
  const parts = formatComponentList(step.parts, "None listed");
  const screws = formatComponentList(step.screws, "None listed");
  const cautions = step.cautions.join(", ") || "No cautions listed";
  const manualDiagramSection = step.visualDescription
    ? [
        "MANUAL DIAGRAM NOTES",
        "Use this extracted description to understand the intermediate assembly state, motion direction, and visible alignment cues.",
        step.visualDescription,
        "Manual diagram notes are guidance, not permission to add extra components, extra labels, extra hardware, or a separate manual-page layout.",
        ""
      ].join("\n")
    : "";

  const referenceSection = hasReferencePhoto
    ? [
        "REFERENCE PHOTO GUIDANCE",
        "Use the attached product photo as reference material, not as the final image style.",
        "- Borrow real colors, broad proportions, part silhouettes, and visible surface cues from the photo.",
        "- The final image must still be a simplified technical assembly diagram on a white background.",
        "- Do not create a lifestyle image, product beauty render, camera-matched photo recreation, or decorative scene.",
        "- If the photo conflicts with the step components listed below, prefer the listed step components.",
        ""
      ].join("\n")
    : "";

  const visualStyle = [
    "VISUAL STYLE",
    "- Orthographic technical-manual view or clean isometric exploded view cropped tightly to this step",
    "- White background",
    "- Graphite outlines, teal active-part highlights, amber fastener highlights",
    "- Ghosted origin showing starting position",
    "- Movement path arrows from start to final seated position",
    "- Final state showing part fully placed, holes aligned, fasteners seated",
    "- Before-and-after placement visible in a single frame",
    "- Large, sparse, readable labels — use only the provided part IDs and hardware IDs. Label only provided part IDs and hardware IDs"
  ].join("\n");

  return [
    "ROLE",
    "You are a professional product illustrator creating a manual-accurate single-step assembly diagram for an official instruction manual. Accuracy to the real product is the top priority.",
    "",
    "The image should align with the step and instruction. It should be a single step and should not be a multi-step image.",
    referenceSection,
    manualDiagramSection,
    "SUBJECT",
    `Product: ${projectName}`,
    `Current step only: ${step.title}`,
    `Instruction: ${step.instruction}`,
    `Cautions: ${cautions}`,
    "",
    "COMPONENTS FOR THIS STEP",
    "Parts:",
    parts,
    "",
    "Hardware:",
    screws,
    "",
    visualStyle,
    "",
    "HARD CONSTRAINTS",
    "- Show only this single step. No previous steps, no future steps, no multi-panel sheet, no full manual page.",
    "- Do not show previous steps, future steps, a parts catalog, or anything outside the current step only.",
    "- Animate or imply motion with arrows and ghosting only — do not split into separate panels.",
    "- Do not invent parts, holes, fasteners, brackets, tools, or labels not listed above.",
    "- Do not invent hardware. Hardware must come only from the hardware/parts section above.",
    "- No human hands, no room background, no lifestyle context, no decorative elements.",
    "- No text smaller than would be clearly readable at 512 px wide."
  ].filter(Boolean).join("\n");
}

export async function generateStepIllustration(
  projectName: string,
  step: AssemblyStep,
  productPhotoBase64?: string
): Promise<{ imageUrl: string }> {
  const key = requireOpenAIKey();
  const prompt = buildIllustrationPrompt(projectName, step, Boolean(productPhotoBase64));

  if (productPhotoBase64) {
    return generateWithReferencePhoto(key, prompt, productPhotoBase64);
  }

  const response = await fetch(IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.IMAGE_MODEL || "gpt-image-2",
      prompt,
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

async function generateWithReferencePhoto(
  key: string,
  prompt: string,
  productPhotoBase64: string
): Promise<{ imageUrl: string }> {
  const [header, data = ""] = productPhotoBase64.split(",", 2);
  const mimeType = header.match(/^data:([^;]+);base64$/)?.[1] || "image/jpeg";
  const imageBuffer = Buffer.from(data, "base64");

  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const formData = new FormData();
  formData.append("model", EDIT_MODEL);
  formData.append("prompt", prompt);
  formData.append("size", "1024x1024");
  formData.append(
    "image[]",
    new Blob([imageBuffer], { type: mimeType }),
    `product-reference.${ext}`
  );

  const response = await fetch(IMAGES_EDIT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: formData
  });

  const raw = await response.json().catch(() => ({})) as ImageGenerationResponse;
  if (!response.ok) {
    throw new Error(typeof raw.error === "string" ? raw.error : JSON.stringify(raw.error ?? raw));
  }

  const item = Array.isArray(raw.data) ? raw.data[0] : undefined;
  if (item?.url) return { imageUrl: item.url };
  if (item?.b64_json) return { imageUrl: `data:image/png;base64,${item.b64_json}` };
  throw new Error("Image edit returned no URL or b64_json.");
}
