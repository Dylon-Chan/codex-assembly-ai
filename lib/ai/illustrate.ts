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

export function buildIllustrationPrompt(projectName: string, step: AssemblyStep, hasReferencePhoto: boolean): string {
  const parts = step.parts.map((part) => `${part.id}: ${part.name} x${part.quantity}`).join(", ") || "No parts listed";
  const screws = step.screws.map((screw) => `${screw.id}: ${screw.name} x${screw.quantity}`).join(", ") || "No hardware listed";
  const cautions = step.cautions.join(", ") || "No cautions listed";
  const manualDiagramSection = step.visualDescription
    ? [
        "MANUAL DIAGRAM FOR THIS STEP",
        "The original instruction manual contains a diagram for this step. Use the description below as the definitive reference for the intermediate assembly state — which parts are already joined, which parts are mid-motion, and how the half-assembled product looks at this exact point in the build.",
        step.visualDescription,
        "Reproduce this intermediate state faithfully. The user must be able to compare your illustration against the manual and see that they match.",
        ""
      ].join("\n")
    : "";

  const referenceSection = hasReferencePhoto
    ? [
        "REFERENCE PHOTO — HIGHEST PRIORITY",
        "The attached photo shows the actual physical product. You must use it as the primary visual source for every part you draw.",
        "Reproduction requirements (non-negotiable):",
        "- COLOR: Reproduce every part's exact color from the photo. Do not substitute, simplify, or average colors. If a part is burnt-orange with dark-grey joints, draw it that way.",
        "- SHAPE & SILHOUETTE: Match the precise silhouette of each sub-assembly. Boxy parts must stay boxy; curved panels must stay curved. Do not round or simplify geometry.",
        "- SURFACE DETAIL: Reproduce panel lines, vents, ridge details, peg holes, hinge knuckles, and any molded texture visible in the photo at the relevant scale.",
        "- PROPORTIONS: Keep the relative size of every part exactly as seen. A wide torso stays wide; stubby limbs stay stubby.",
        "- PART COUNT: Draw exactly the number of discrete parts visible in the photo for this sub-assembly — no more, no fewer.",
        "- ORIENTATION: Match the overall orientation and perspective angle to the photo so the user can immediately recognize the real object.",
        "Generic robot, vehicle, or toy silhouettes are FORBIDDEN. If your draft does not look unmistakably like the product in the reference photo, revise it.",
        ""
      ].join("\n")
    : "";

  const visualStyle = hasReferencePhoto
    ? [
        "VISUAL STYLE",
        "- Isometric or 3/4 view that best shows the mechanical action for this step, matching the camera angle of the reference photo as closely as possible",
        "- Crisp white background",
        "- Render parts with their true colors from the reference photo; add only a thin dark outline (1–2 px equivalent) to separate adjacent surfaces",
        "- Highlight the moving part(s) with a translucent teal/cyan overlay and a dashed motion-path arrow showing direction and end position",
        "- Ghost the starting position of moving parts with 40% opacity so before-and-after is visible in one frame",
        "- Amber glow on any fastener entry points",
        "- Large, sparse, high-contrast labels using the provided part IDs only; position labels outside the silhouette with a short leader line",
        "- Overall illustration quality: high-detail product rendering suitable for a professional instruction manual"
      ].join("\n")
    : [
        "VISUAL STYLE",
        "- Orthographic technical-manual view or clean isometric exploded view cropped tightly to this step",
        "- White background",
        "- Graphite outlines, teal active-part highlights, amber fastener highlights",
        "- Ghosted origin showing starting position",
        "- Movement path arrows from start to final seated position",
        "- Final state showing part fully placed, holes aligned, fasteners seated",
        "- Before-and-after placement visible in a single frame",
        "- Large, sparse, readable labels; Label only provided part IDs and hardware IDs"
      ].join("\n");

  return [
    "ROLE",
    "You are a professional product illustrator creating a manual-accurate single-step assembly diagram for an official instruction manual. Accuracy to the real product is the top priority.",
    "",
    referenceSection,
    manualDiagramSection,
    "SUBJECT",
    `Product: ${projectName}`,
    `Current step only: ${step.title}`,
    `Instruction: ${step.instruction}`,
    `Cautions: ${cautions}`,
    "",
    "COMPONENTS FOR THIS STEP",
    `Parts: ${parts}`,
    `Hardware: ${screws}`,
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
    "- No text smaller than would be clearly readable at 512 px wide.",
    hasReferencePhoto ? "- CRITICAL: The output must be immediately recognizable as the same product shown in the reference photo. If it is not, it is wrong." : ""
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
