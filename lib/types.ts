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
  visualDescription?: string;
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
