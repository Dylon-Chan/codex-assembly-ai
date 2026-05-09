"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Camera,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  ImageIcon,
  Loader2,
  Lock,
  Mic,
  MicOff,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  Upload,
  Wrench,
  ZoomIn
} from "lucide-react";
import type { AnalysisResult, AssemblyStep, MotionState, StepVisualState, VerifyResult, VoiceState } from "../lib/types";

const PHOTO_ATTACHED_RESULT: VerifyResult = {
  status: "warning",
  score: 0.61,
  message: "Photo attached. Run AI check before moving on.",
  checklist: ["Photo is ready for inspection", "Step target loaded", "Waiting for verification"],
  nextFix: "Use a wide photo that includes the whole joint or shelf."
};

const EMPTY_NOTICE = "Upload a manual or try the sample PDF.";
const FRAME_LABELS = ["Before", "Move", "Align", "Lock"];

type AnalyzeResponse = {
  analysis?: AnalysisResult;
  error?: string;
};

type IllustrateResponse = {
  imageUrl?: string;
  error?: string;
};

type VerifyResponse = {
  result?: VerifyResult;
  error?: string;
};

type MotionResponse = MotionState & {
  error?: string;
};

type RealtimeSessionResponse = {
  model?: string;
  client_secret?: string | { value?: string };
  error?: string;
};

type RealtimeToolName =
  | "get_current_step"
  | "go_to_next_step"
  | "go_to_previous_step"
  | "repeat_current_step"
  | "mark_current_step_done"
  | "list_required_parts"
  | "check_current_camera_frame"
  | "stop_voice_agent";

type RealtimeToolResult = {
  ok: boolean;
  message: string;
  [key: string]: unknown;
};

const ACTIVE_MOTION_STATUSES = new Set<MotionState["status"]>(["creating", "queued", "in_progress"]);
const REALTIME_MODEL_FALLBACK = "gpt-realtime-2";
const REALTIME_TOOLS: Array<{
  type: "function";
  name: RealtimeToolName;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, never>;
    additionalProperties: false;
  };
}> = [
  {
    type: "function",
    name: "get_current_step",
    description: "Read the current assembly step, instruction, parts, hardware, and safety cautions.",
    parameters: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    type: "function",
    name: "go_to_next_step",
    description: "Advance the guide to the next assembly step when available.",
    parameters: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    type: "function",
    name: "go_to_previous_step",
    description: "Move the guide back to the previous assembly step when available.",
    parameters: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    type: "function",
    name: "repeat_current_step",
    description: "Repeat the current assembly instruction and simple check.",
    parameters: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    type: "function",
    name: "mark_current_step_done",
    description: "Mark the current step as complete after the user confirms it is done.",
    parameters: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    type: "function",
    name: "list_required_parts",
    description: "List the parts and hardware required for the current step.",
    parameters: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    type: "function",
    name: "check_current_camera_frame",
    description: "Capture the live camera frame and run the same AI verification used for uploaded progress photos.",
    parameters: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    type: "function",
    name: "stop_voice_agent",
    description: "End the realtime voice assistant session.",
    parameters: { type: "object", properties: {}, additionalProperties: false }
  }
];

function getRealtimeClientSecret(payload: RealtimeSessionResponse): string | null {
  if (typeof payload.client_secret === "string") return payload.client_secret;
  if (payload.client_secret && typeof payload.client_secret.value === "string") return payload.client_secret.value;
  return null;
}

function parseRealtimeArgs(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export default function Home() {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [productPhoto, setProductPhoto] = useState<File | null>(null);
  const [partPhotos, setPartPhotos] = useState<File[]>([]);
  const [progressPhoto, setProgressPhoto] = useState<File | null>(null);
  const [notice, setNotice] = useState(EMPTY_NOTICE);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [visuals, setVisuals] = useState<Record<string, StepVisualState>>({});
  const [motions, setMotions] = useState<Record<string, MotionState>>({});
  const [voiceState, setVoiceState] = useState<VoiceState>("off");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [agentTranscript, setAgentTranscript] = useState("");
  const [voiceAction, setVoiceAction] = useState("Voice mode unlocks after analysis");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraPending, setCameraPending] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [verifiedStepId, setVerifiedStepId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const analysisRef = useRef<AnalysisResult | null>(null);
  const currentStepIndexRef = useRef(0);
  const completedStepsRef = useRef<Set<string>>(new Set());
  const cameraEnabledRef = useRef(false);
  const runIdRef = useRef(0);
  const retryRunIdRef = useRef(0);
  const analysisRunIdRef = useRef(0);
  const verifyRunIdRef = useRef(0);
  const voiceRunIdRef = useRef(0);
  const cameraRunIdRef = useRef(0);
  const motionRunIdsRef = useRef<Record<string, number>>({});
  const motionPollInFlightRef = useRef<Set<string>>(new Set());
  const motionsRef = useRef<Record<string, MotionState>>({});
  const handledToolCallsRef = useRef<Set<string>>(new Set());

  const currentStep = analysis?.steps[currentStepIndex];
  const currentVisual = currentStep ? visuals[currentStep.id] : undefined;
  const currentMotion = currentStep ? motions[currentStep.id] : undefined;
  const currentMotionBusy = Boolean(currentMotion && ACTIVE_MOTION_STATUSES.has(currentMotion.status));
  const canCreateCurrentMotion = currentVisual?.status === "ready" && Boolean(currentVisual.imageUrl) && !currentMotionBusy;
  const currentStepDone = Boolean(currentStep && completedSteps.has(currentStep.id));
  const canContinue =
    Boolean(analysis && currentStepIndex < (analysis?.steps.length ?? 0) - 1) &&
    Boolean(
      currentStep &&
        verifiedStepId === currentStep.id &&
        verifyResult &&
        (verifyResult.status === "pass" || verifyResult.score >= 0.72)
    );
  const voiceActive = voiceState === "connecting" || voiceState === "listening" || voiceState === "speaking" || voiceState === "muted";

  const stepCount = analysis?.steps.length ?? 0;
  const completedCount = completedSteps.size;
  const currentStepDuration = currentStep?.duration ?? "Duration pending";
  const currentStepRisk = currentStep?.risk ?? "low";
  const currentStepScrews = currentStep?.screws ?? [];
  const currentStepParts = currentStep?.parts ?? [];
  const currentStepCautions = currentStep?.cautions ?? [];
  const activeMotionPollKey = useMemo(
    () =>
      Object.entries(motions)
        .filter(([, motion]) => Boolean(motion.operationId) && ACTIVE_MOTION_STATUSES.has(motion.status))
        .map(([stepId, motion]) => `${stepId}:${motion.operationId}:${motion.status}`)
        .sort()
        .join("|"),
    [motions]
  );

  const partPhotoLabel = useMemo(() => {
    if (partPhotos.length === 0) return "No part photos";
    if (partPhotos.length === 1) return partPhotos[0]?.name ?? "1 part photo";
    return `${partPhotos.length} part photos`;
  }, [partPhotos]);

  const setStepVisual = useCallback((stepId: string, visual: StepVisualState) => {
    setVisuals((previous) => ({ ...previous, [stepId]: visual }));
  }, []);

  const setStepMotion = useCallback((stepId: string, motion: MotionState) => {
    setMotions((previous) => ({ ...previous, [stepId]: motion }));
  }, []);

  useEffect(() => {
    motionsRef.current = motions;
  }, [motions]);

  useEffect(() => {
    analysisRef.current = analysis;
  }, [analysis]);

  useEffect(() => {
    currentStepIndexRef.current = currentStepIndex;
  }, [currentStepIndex]);

  useEffect(() => {
    completedStepsRef.current = completedSteps;
  }, [completedSteps]);

  useEffect(() => {
    cameraEnabledRef.current = cameraEnabled;
  }, [cameraEnabled]);

  useEffect(() => {
    if (!videoRef.current || !cameraStreamRef.current) return;
    videoRef.current.srcObject = cameraStreamRef.current;
    void videoRef.current.play().catch(() => undefined);
  }, [cameraEnabled, cameraPending]);

  const initializeVisualQueue = useCallback(
    (nextAnalysis: AnalysisResult) => {
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      setVisuals(Object.fromEntries(nextAnalysis.steps.map((step) => [step.id, { status: "idle" as const }])));
      motionRunIdsRef.current = {};
      setMotions({});
      setIsZoomed(false);

      void (async () => {
        for (const step of nextAnalysis.steps) {
          if (runIdRef.current !== runId) return;
          setStepVisual(step.id, { status: "loading" });

          try {
            const response = await fetch("/api/illustrate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectName: nextAnalysis.projectName, step })
            });
            const payload = (await response.json().catch(() => ({}))) as IllustrateResponse;
            if (runIdRef.current !== runId) return;
            if (!response.ok || !payload.imageUrl) {
              throw new Error(payload.error || "Illustration generation failed.");
            }
            setStepVisual(step.id, { status: "ready", imageUrl: payload.imageUrl });
          } catch (error) {
            if (runIdRef.current !== runId) return;
            setStepVisual(step.id, {
              status: "error",
              error: error instanceof Error ? error.message : "Illustration generation failed."
            });
          }
        }
      })();
    },
    [setStepVisual]
  );

  const generateStepVisual = useCallback(
    async (projectName: string, step: AssemblyStep) => {
      const retryRunId = retryRunIdRef.current + 1;
      retryRunIdRef.current = retryRunId;
      motionRunIdsRef.current[step.id] = (motionRunIdsRef.current[step.id] ?? 0) + 1;
      setMotions((previous) => {
        const next = { ...previous };
        delete next[step.id];
        return next;
      });
      setStepVisual(step.id, { status: "loading" });

      try {
        const response = await fetch("/api/illustrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectName, step })
        });
        const payload = (await response.json().catch(() => ({}))) as IllustrateResponse;
        if (retryRunIdRef.current !== retryRunId) return;
        if (!response.ok || !payload.imageUrl) {
          throw new Error(payload.error || "Illustration generation failed.");
        }
        setStepVisual(step.id, { status: "ready", imageUrl: payload.imageUrl });
      } catch (error) {
        if (retryRunIdRef.current !== retryRunId) return;
        setStepVisual(step.id, {
          status: "error",
          error: error instanceof Error ? error.message : "Illustration generation failed."
        });
      }
    },
    [setStepVisual]
  );

  const createMotionForStep = useCallback(
    async (step: AssemblyStep) => {
      if (!analysis) {
        setStepMotion(step.id, {
          status: "error",
          progress: 0,
          error: "Build a guide before creating motion."
        });
        return;
      }

      const visual = visuals[step.id];
      const currentMotionState = motionsRef.current[step.id];
      if (currentMotionState && ACTIVE_MOTION_STATUSES.has(currentMotionState.status)) {
        return;
      }
      if (visual?.status !== "ready" || !visual.imageUrl) {
        setStepMotion(step.id, {
          status: "error",
          progress: 0,
          error: "Generate the reference image before creating motion."
        });
        return;
      }

      const motionRunId = (motionRunIdsRef.current[step.id] ?? 0) + 1;
      motionRunIdsRef.current[step.id] = motionRunId;
      setStepMotion(step.id, { status: "creating", progress: 20 });

      try {
        const response = await fetch("/api/motion/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectName: analysis.projectName,
            step,
            referenceImageUrl: visual.imageUrl
          })
        });
        const payload = (await response.json().catch(() => ({}))) as MotionResponse;
        if (!response.ok || !payload.status) {
          throw new Error(payload.error || "Motion creation failed.");
        }
        if (motionRunIdsRef.current[step.id] !== motionRunId) return;
        setStepMotion(step.id, {
          status: payload.status,
          progress: payload.progress ?? (payload.status === "ready" ? 100 : 20),
          operationId: payload.operationId,
          videoUrl: payload.videoUrl,
          error: payload.error
        });
      } catch (error) {
        if (motionRunIdsRef.current[step.id] !== motionRunId) return;
        setStepMotion(step.id, {
          status: "error",
          progress: 0,
          error: error instanceof Error ? error.message : "Motion creation failed."
        });
      }
    },
    [analysis, setStepMotion, visuals]
  );

  useEffect(() => {
    if (!activeMotionPollKey) return undefined;

    let isCancelled = false;

    const pollMotion = async (stepId: string, operationId: string) => {
      const pollKey = `${stepId}:${operationId}`;
      if (motionPollInFlightRef.current.has(pollKey)) return;
      motionPollInFlightRef.current.add(pollKey);
      try {
        const response = await fetch("/api/motion/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operationId })
        });
        const payload = (await response.json().catch(() => ({}))) as MotionResponse;
        if (isCancelled) return;
        if (!response.ok || !payload.status) {
          throw new Error(payload.error || "Motion polling failed.");
        }
        setMotions((previous) => {
          const current = previous[stepId];
          if (!current || current.operationId !== operationId) return previous;
          if (current.status === "ready" || current.status === "error" || current.status === "unavailable") return previous;
          return {
            ...previous,
            [stepId]: {
              status: payload.status,
              progress: Math.max(current.progress, payload.progress ?? current.progress),
              operationId: payload.operationId ?? current.operationId,
              videoUrl: payload.videoUrl ?? current.videoUrl,
              error: payload.error
            }
          };
        });
      } catch (error) {
        if (isCancelled) return;
        setMotions((previous) => {
          const current = previous[stepId];
          if (!current || current.operationId !== operationId) return previous;
          return {
            ...previous,
            [stepId]: {
              ...current,
              status: "error",
              progress: 0,
              error: error instanceof Error ? error.message : "Motion polling failed."
            }
          };
        });
      } finally {
        motionPollInFlightRef.current.delete(pollKey);
      }
    };

    const pollAll = () => {
      const pollTargets = Object.entries(motionsRef.current).filter(
        ([, motion]) => Boolean(motion.operationId) && ACTIVE_MOTION_STATUSES.has(motion.status)
      );
      pollTargets.forEach(([stepId, motion]) => {
        if (motion.operationId) void pollMotion(stepId, motion.operationId);
      });
    };

    pollAll();
    const intervalId = window.setInterval(pollAll, 5000);
    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeMotionPollKey]);

  const buildGuideFromFile = useCallback(
    async (file: File) => {
      const analysisRunId = analysisRunIdRef.current + 1;
      analysisRunIdRef.current = analysisRunId;
      const formData = new FormData();
      formData.append("manual", file);
      if (productPhoto) formData.append("productPhoto", productPhoto);
      partPhotos.forEach((photo) => formData.append("partPhotos", photo));
      setIsAnalyzing(true);
      setNotice("Analyzing manual with AI.");
      try {
        const response = await fetch("/api/analyze", { method: "POST", body: formData });
        const payload = (await response.json()) as AnalyzeResponse;
        if (!response.ok) throw new Error(payload.error || "Manual analysis failed.");
        if (!payload.analysis) throw new Error("Manual analysis did not return a guide.");
        if (analysisRunIdRef.current !== analysisRunId) return;
        const nextAnalysis = payload.analysis;
        setAnalysis(nextAnalysis);
        setCurrentStepIndex(0);
        setCompletedSteps(new Set());
        setVerifyResult(null);
        setVerifiedStepId(null);
        setProgressPhoto(null);
        setNotice("Guide built. Generating step visuals.");
        initializeVisualQueue(nextAnalysis);
      } catch (error) {
        if (analysisRunIdRef.current !== analysisRunId) return;
        setNotice(error instanceof Error ? error.message : "Manual analysis failed.");
      } finally {
        if (analysisRunIdRef.current === analysisRunId) setIsAnalyzing(false);
      }
    },
    [initializeVisualQueue, partPhotos, productPhoto]
  );

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

  const resetWorkspace = useCallback(() => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    cameraRunIdRef.current += 1;
    if (videoRef.current) videoRef.current.srcObject = null;
    runIdRef.current += 1;
    retryRunIdRef.current += 1;
    analysisRunIdRef.current += 1;
    verifyRunIdRef.current += 1;
    voiceRunIdRef.current += 1;
    setAnalysis(null);
    setCurrentStepIndex(0);
    setCompletedSteps(new Set());
    setVerifyResult(null);
    setVerifiedStepId(null);
    setManualFile(null);
    setProductPhoto(null);
    setPartPhotos([]);
    setProgressPhoto(null);
    setNotice(EMPTY_NOTICE);
    setIsAnalyzing(false);
    setIsChecking(false);
    setIsZoomed(false);
    setVoiceState("off");
    setVoiceTranscript("");
    setAgentTranscript("");
    setVoiceAction("Voice mode unlocks after analysis");
    setCameraEnabled(false);
    setCameraPending(false);
    setCameraError("");
    motionRunIdsRef.current = {};
    motionPollInFlightRef.current.clear();
    setVisuals({});
    setMotions({});
  }, []);

  const handleProgressPhoto = useCallback((file: File | null) => {
    setProgressPhoto(file);
    setVerifyResult(file ? PHOTO_ATTACHED_RESULT : null);
    setVerifiedStepId(null);
    setNotice(file ? "Progress photo attached. Run AI check when ready." : "Progress photo cleared.");
  }, []);

  const stopCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    cameraRunIdRef.current += 1;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraEnabled(false);
    setCameraPending(false);
  }, []);

  const toggleCamera = useCallback(async () => {
    if (cameraPending) return;
    if (cameraEnabled) {
      stopCamera();
      setCameraError("");
      setVoiceAction("Camera stopped.");
      return;
    }

    if (!analysis) {
      setCameraError("Build a guide before starting the camera. You can upload a progress photo instead.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is unavailable in this browser. Upload a progress photo instead.");
      return;
    }

    const cameraRunId = cameraRunIdRef.current + 1;
    cameraRunIdRef.current = cameraRunId;
    try {
      setCameraPending(true);
      setCameraError("");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (cameraRunIdRef.current !== cameraRunId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      if (cameraRunIdRef.current !== cameraRunId) {
        stream.getTracks().forEach((track) => track.stop());
        if (videoRef.current?.srcObject === stream) videoRef.current.srcObject = null;
        return;
      }
      setCameraEnabled(true);
      setVoiceAction("Live camera ready for hands-free checks.");
    } catch (error) {
      if (cameraRunIdRef.current !== cameraRunId) return;
      cameraStreamRef.current = null;
      setCameraEnabled(false);
      setCameraError(
        error instanceof Error
          ? `${error.message}. Camera permission was denied or unavailable. Upload a progress photo instead.`
          : "Camera permission was denied or unavailable. Upload a progress photo instead."
      );
    } finally {
      if (cameraRunIdRef.current === cameraRunId) setCameraPending(false);
    }
  }, [analysis, cameraEnabled, cameraPending, stopCamera]);

  const captureCameraFrame = useCallback(async (): Promise<File | null> => {
    const video = videoRef.current;
    if (!video || !cameraEnabledRef.current) {
      setCameraError("Turn on the live camera or upload a progress photo.");
      return null;
    }

    const width = video.videoWidth || video.clientWidth;
    const height = video.videoHeight || video.clientHeight;
    if (!width || !height) {
      setCameraError("Camera preview is still warming up. Try again in a moment.");
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Camera capture is unavailable. Upload a progress photo instead.");
      return null;
    }
    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setCameraError("Camera capture failed. Upload a progress photo instead.");
      return null;
    }

    const capturedFile = new File([blob], "camera-frame.jpg", { type: "image/jpeg" });
    setProgressPhoto(capturedFile);
    setCameraError("");
    return capturedFile;
  }, []);

  const verifyStepPhoto = useCallback(async (step: AssemblyStep, photo: File | null) => {
    const checkedStepId = step.id;
    const verifyRunId = verifyRunIdRef.current + 1;
    verifyRunIdRef.current = verifyRunId;
    const formData = new FormData();
    formData.append("stepTitle", step.title);
    if (photo) formData.append("photo", photo);

    setIsChecking(true);
    setNotice("AI is checking this step.");
    try {
      const response = await fetch("/api/verify", { method: "POST", body: formData });
      const payload = (await response.json().catch(() => ({}))) as VerifyResponse;
      if (!response.ok || !payload.result) throw new Error(payload.error || "Progress verification failed.");
      if (verifyRunIdRef.current !== verifyRunId) return;
      const result = payload.result;
      setVerifyResult(result);
      setVerifiedStepId(checkedStepId);
      if (result.status === "pass" || result.score >= 0.72) {
        setCompletedSteps((previous) => new Set(previous).add(checkedStepId));
        setNotice("Step verified. Ready to continue.");
      } else {
        setNotice("AI found something to fix before continuing.");
      }
    } catch (error) {
      if (verifyRunIdRef.current !== verifyRunId) return;
      setVerifyResult({
        status: "fail",
        score: 0,
        message: "Needs review",
        checklist: ["Verification request did not complete"],
        nextFix: error instanceof Error ? error.message : "Retake the photo and try again."
      });
      setVerifiedStepId(checkedStepId);
      setNotice(error instanceof Error ? error.message : "Progress verification failed.");
    } finally {
      if (verifyRunIdRef.current === verifyRunId) setIsChecking(false);
    }
  }, []);

  const checkCurrentStep = useCallback(
    async (photoOverride?: File | null) => {
      if (!currentStep) return;
      await verifyStepPhoto(currentStep, photoOverride ?? progressPhoto);
    },
    [currentStep, progressPhoto, verifyStepPhoto]
  );

  const continueToNextStep = useCallback(() => {
    if (!analysis || currentStepIndex >= analysis.steps.length - 1 || !canContinue) return;
    setCurrentStepIndex((index) => index + 1);
    setProgressPhoto(null);
    setVerifyResult(null);
    setVerifiedStepId(null);
    setIsZoomed(false);
    setNotice("Next step loaded. Attach a progress photo when ready.");
  }, [analysis, canContinue, currentStepIndex]);

  const retryCurrentVisual = useCallback(() => {
    if (!analysis || !currentStep) return;
    void generateStepVisual(analysis.projectName, currentStep);
  }, [analysis, currentStep, generateStepVisual]);

  const selectStep = useCallback((index: number) => {
    setCurrentStepIndex(index);
    setProgressPhoto(null);
    setVerifyResult(null);
    setVerifiedStepId(null);
    setIsZoomed(false);
    setNotice("Step loaded.");
  }, []);

  const sendRealtimeEvent = useCallback((event: Record<string, unknown>) => {
    const channel = dataChannelRef.current;
    if (channel?.readyState === "open") {
      channel.send(JSON.stringify(event));
    }
  }, []);

  const stopVoiceAgent = useCallback(
    (options?: { keepCamera?: boolean }) => {
      dataChannelRef.current?.close();
      dataChannelRef.current = null;
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
      voiceRunIdRef.current += 1;
      handledToolCallsRef.current.clear();
      if (!options?.keepCamera) stopCamera();
      setVoiceState("off");
      setVoiceAction(options?.keepCamera ? "Voice session ended. Camera kept on." : "Voice session ended.");
    },
    [stopCamera]
  );

  const handleRealtimeToolCall = useCallback(
    async (name: RealtimeToolName, args: Record<string, unknown> = {}): Promise<RealtimeToolResult> => {
      void args;

      const activeAnalysis = analysisRef.current;
      const activeStepIndex = currentStepIndexRef.current;
      const activeStep = activeAnalysis?.steps[activeStepIndex];

      if (!activeAnalysis || !activeStep) {
        return { ok: false, message: "Upload a manual or try the sample PDF before using voice tools." };
      }

      if (name === "get_current_step") {
        return {
          ok: true,
          message: `Step ${activeStepIndex + 1} of ${activeAnalysis.steps.length}: ${activeStep.title}. ${activeStep.instruction}`,
          step: activeStep
        };
      }

      if (name === "go_to_next_step") {
        if (activeStepIndex >= activeAnalysis.steps.length - 1) {
          return { ok: false, message: "You are already on the final step." };
        }
        setCurrentStepIndex((index) => Math.min(index + 1, activeAnalysis.steps.length - 1));
        setProgressPhoto(null);
        setVerifyResult(null);
        setVerifiedStepId(null);
        setIsZoomed(false);
        setNotice("Next step loaded by voice.");
        return { ok: true, message: `Moved to step ${activeStepIndex + 2}.` };
      }

      if (name === "go_to_previous_step") {
        if (activeStepIndex <= 0) {
          return { ok: false, message: "You are already on the first step." };
        }
        setCurrentStepIndex((index) => Math.max(index - 1, 0));
        setProgressPhoto(null);
        setVerifyResult(null);
        setVerifiedStepId(null);
        setIsZoomed(false);
        setNotice("Previous step loaded by voice.");
        return { ok: true, message: `Moved back to step ${activeStepIndex}.` };
      }

      if (name === "repeat_current_step") {
        return {
          ok: true,
          message: `${activeStep.title}. ${activeStep.instruction} Check: ${activeStep.simpleCheck}`
        };
      }

      if (name === "mark_current_step_done") {
        setCompletedSteps((previous) => new Set(previous).add(activeStep.id));
        setVerifiedStepId(activeStep.id);
        setNotice("Step marked done by voice.");
        return { ok: true, message: `${activeStep.title} marked complete.` };
      }

      if (name === "list_required_parts") {
        const parts = activeStep.parts.map((part) => `${part.quantity}x ${part.name}`);
        const hardware = activeStep.screws.map((screw) => `${screw.quantity}x ${screw.name}`);
        const items = [...parts, ...hardware];
        return {
          ok: true,
          message: items.length > 0 ? items.join(", ") : "No parts or hardware are listed for this step.",
          parts: activeStep.parts,
          hardware: activeStep.screws
        };
      }

      if (name === "check_current_camera_frame") {
        if (!cameraEnabledRef.current) {
          return {
            ok: false,
            message: "Turn on camera permission for a live check, or upload a progress photo instead."
          };
        }
        const capturedFile = await captureCameraFrame();
        if (!capturedFile) {
          return { ok: false, message: "Camera frame could not be captured. Upload a progress photo instead." };
        }
        await verifyStepPhoto(activeStep, capturedFile);
        return { ok: true, message: `Captured camera frame and checked ${activeStep.title}.` };
      }

      if (name === "stop_voice_agent") {
        stopVoiceAgent({ keepCamera: true });
        return { ok: true, message: "Voice session stopped." };
      }

      return { ok: false, message: `Unsupported voice tool: ${name}` };
    },
    [captureCameraFrame, stopVoiceAgent, verifyStepPhoto]
  );

  const handleRealtimeEvent = useCallback(
    (event: Record<string, unknown>) => {
      const type = typeof event.type === "string" ? event.type : "";

      if (type.includes("input_audio") && typeof event.transcript === "string") {
        setVoiceTranscript(event.transcript);
      }
      if ((type.includes("audio_transcript") || type.includes("output_text")) && typeof event.delta === "string") {
        setVoiceState("speaking");
        setAgentTranscript((text) => `${text}${event.delta}`);
      }
      if ((type.includes("audio_transcript") || type.includes("output_text")) && typeof event.transcript === "string") {
        setVoiceState("speaking");
        setAgentTranscript(event.transcript);
      }
      if (type === "response.done") {
        setVoiceState((state) => (state === "muted" ? "muted" : "listening"));
      }

      const maybeItem = event.item && typeof event.item === "object" ? (event.item as Record<string, unknown>) : event;
      const toolName = typeof maybeItem.name === "string" ? maybeItem.name : "";
      const callId =
        typeof maybeItem.call_id === "string"
          ? maybeItem.call_id
          : typeof event.call_id === "string"
            ? event.call_id
            : "";
      const args = parseRealtimeArgs(maybeItem.arguments ?? event.arguments);

      if (
        (type === "response.function_call_arguments.done" || type === "response.output_item.done") &&
        REALTIME_TOOLS.some((tool) => tool.name === toolName)
      ) {
        const toolCallKey = callId || `${type}:${toolName}:${JSON.stringify(args)}`;
        if (handledToolCallsRef.current.has(toolCallKey)) return;
        handledToolCallsRef.current.add(toolCallKey);
        void (async () => {
          setVoiceAction(`Running ${toolName.replaceAll("_", " ")}.`);
          const result = await handleRealtimeToolCall(toolName as RealtimeToolName, args);
          setVoiceAction(result.message);
          if (callId) {
            sendRealtimeEvent({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify(result)
              }
            });
            sendRealtimeEvent({ type: "response.create" });
          }
        })();
      }
    },
    [handleRealtimeToolCall, sendRealtimeEvent]
  );

  const startVoiceAgent = useCallback(async () => {
    if (!analysis) {
      setVoiceState("off");
      setVoiceAction("Voice mode unlocks after analysis. Upload a manual or try the sample PDF.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceState("error");
      setVoiceAction("Microphone access is unavailable in this browser.");
      return;
    }

    setVoiceState("connecting");
    setVoiceAction("Connecting realtime voice.");
    setVoiceTranscript("");
    setAgentTranscript("");

    const voiceRunId = voiceRunIdRef.current + 1;
    voiceRunIdRef.current = voiceRunId;
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (voiceRunIdRef.current !== voiceRunId) {
        micStream.getTracks().forEach((track) => track.stop());
        return;
      }
      micStreamRef.current = micStream;

      const sessionResponse = await fetch("/api/realtime/session", { method: "POST" });
      if (voiceRunIdRef.current !== voiceRunId) return;
      const session = (await sessionResponse.json().catch(() => ({}))) as RealtimeSessionResponse;
      if (!sessionResponse.ok) throw new Error(session.error || "Realtime session failed.");
      const clientSecret = getRealtimeClientSecret(session);
      if (!clientSecret) throw new Error("Realtime session did not return a client secret.");
      if (voiceRunIdRef.current !== voiceRunId) return;

      const peerConnection = new RTCPeerConnection();
      if (voiceRunIdRef.current !== voiceRunId) {
        peerConnection.close();
        return;
      }
      peerConnectionRef.current = peerConnection;
      micStream.getTracks().forEach((track) => peerConnection.addTrack(track, micStream));
      peerConnection.ontrack = (event) => {
        if (voiceRunIdRef.current !== voiceRunId) return;
        const [remoteStream] = event.streams;
        if (remoteAudioRef.current && remoteStream) {
          remoteAudioRef.current.srcObject = remoteStream;
        }
      };
      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "failed" || peerConnection.connectionState === "disconnected") {
          if (voiceRunIdRef.current !== voiceRunId) return;
          stopVoiceAgent({ keepCamera: true });
          setVoiceState("error");
          setVoiceAction("Realtime voice connection dropped.");
        }
      };

      const dataChannel = peerConnection.createDataChannel("oai-events");
      if (voiceRunIdRef.current !== voiceRunId) {
        dataChannel.close();
        peerConnection.close();
        return;
      }
      dataChannelRef.current = dataChannel;
      dataChannel.onopen = () => {
        if (voiceRunIdRef.current !== voiceRunId) return;
        setVoiceState("listening");
        setVoiceAction("Listening. Ask for the next instruction, parts, or a camera check.");
        dataChannel.send(
          JSON.stringify({
            type: "session.update",
            session: {
              modalities: ["text", "audio"],
              input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
              tools: REALTIME_TOOLS,
              tool_choice: "auto"
            }
          })
        );
        dataChannel.send(
          JSON.stringify({
            type: "response.create",
            response: {
              instructions: "Greet the user briefly and offer hands-free help with the current assembly step."
            }
          })
        );
      };
      dataChannel.onmessage = (event) => {
        if (voiceRunIdRef.current !== voiceRunId) return;
        const payload = JSON.parse(String(event.data)) as Record<string, unknown>;
        handleRealtimeEvent(payload);
      };
      dataChannel.onerror = () => {
        if (voiceRunIdRef.current !== voiceRunId) return;
        stopVoiceAgent({ keepCamera: true });
        setVoiceState("error");
        setVoiceAction("Realtime voice data channel failed.");
      };

      const offer = await peerConnection.createOffer();
      if (voiceRunIdRef.current !== voiceRunId) return;
      await peerConnection.setLocalDescription(offer);
      if (voiceRunIdRef.current !== voiceRunId) return;
      const realtimeResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(session.model || REALTIME_MODEL_FALLBACK)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clientSecret}`,
            "Content-Type": "application/sdp"
          },
          body: offer.sdp
        }
      );
      if (voiceRunIdRef.current !== voiceRunId) return;
      if (!realtimeResponse.ok) throw new Error("OpenAI Realtime SDP exchange failed.");
      const answer = await realtimeResponse.text();
      if (voiceRunIdRef.current !== voiceRunId) return;
      await peerConnection.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (error) {
      if (voiceRunIdRef.current !== voiceRunId) return;
      stopVoiceAgent({ keepCamera: true });
      setVoiceState("error");
      setVoiceAction(error instanceof Error ? error.message : "Realtime voice failed.");
    }
  }, [analysis, handleRealtimeEvent, stopVoiceAgent]);

  const toggleMute = useCallback(() => {
    const stream = micStreamRef.current;
    if (!stream) return;
    const shouldMute = voiceState !== "muted";
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !shouldMute;
    });
    setVoiceState(shouldMute ? "muted" : "listening");
    setVoiceAction(shouldMute ? "Microphone muted." : "Microphone live.");
  }, [voiceState]);

  const checkCameraFrame = useCallback(async () => {
    const capturedFile = await captureCameraFrame();
    if (capturedFile) await checkCurrentStep(capturedFile);
  }, [captureCameraFrame, checkCurrentStep]);

  useEffect(() => {
    return () => {
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      peerConnectionRef.current?.close();
      dataChannelRef.current?.close();
    };
  }, []);

  return (
    <main className="appShell">
      <header className="topBar">
        <div className="brandBlock">
          <span className="brandMark">
            <Wrench size={18} />
          </span>
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
        <div className={`voiceCluster ${voiceState} ${analysis ? "" : "disabled"}`} aria-label="Voice controls">
          <div className="voiceStatus">
            <span className="voicePulse" />
            <Mic size={15} />
            <strong>{analysis ? `Voice ${voiceState}` : "Voice mode unlocks after analysis"}</strong>
          </div>
          <div className="voiceButtons">
            <button
              className="secondaryButton"
              disabled={!analysis || voiceState === "connecting"}
              onClick={() => (voiceActive ? stopVoiceAgent({ keepCamera: true }) : void startVoiceAgent())}
            >
              {voiceActive ? <MicOff size={15} /> : <Mic size={15} />}
              {voiceActive ? "Disable voice" : "Enable voice"}
            </button>
            {voiceActive ? (
              <>
                <button className="iconButton" title={voiceState === "muted" ? "Unmute microphone" : "Mute microphone"} onClick={toggleMute}>
                  {voiceState === "muted" ? <Mic size={15} /> : <MicOff size={15} />}
                </button>
                <button className="iconButton" title="End voice session and camera" onClick={() => stopVoiceAgent()}>
                  <Square size={14} />
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="statusCluster">
          <span className="statusChip">
            {analysis ? `AI extraction ${Math.round(analysis.confidence * 100)}%` : "Ready for manual"}
          </span>
          <span className="noticeText">{notice}</span>
        </div>
      </header>
      <audio ref={remoteAudioRef} autoPlay />
      <section className={`voiceStrip ${voiceState}`} aria-label="Voice transcript">
        <span>{voiceAction}</span>
        <p>
          <strong>User</strong>
          {voiceTranscript || "No speech yet"}
        </p>
        <p>
          <strong>Agent</strong>
          {agentTranscript || (analysis ? "Ready for voice guidance" : "Voice mode unlocks after analysis")}
        </p>
      </section>

      <section className="workspace">
        <aside className="panel inputPanel" aria-label="Manual inputs">
          <div className="panelHeader splitHeader">
            <div className="panelTitle">
              <FileText size={18} />
              <div>
                <h2>{analysis?.projectName ?? "Source manual"}</h2>
                <p>{analysis ? `${stepCount} guided steps` : "Upload the PDF that came with the product."}</p>
              </div>
            </div>
            {analysis ? (
              <button className="iconButton" title="Reset guide" onClick={resetWorkspace}>
                <RotateCcw size={16} />
              </button>
            ) : null}
          </div>

          <label className="fileDrop">
            <Upload size={18} />
            <span>Manual PDF</span>
            <strong>{manualFile?.name ?? "Choose a manual"}</strong>
            <input
              accept="application/pdf,.pdf"
              type="file"
              onChange={(event) => setManualFile(event.target.files?.[0] ?? null)}
            />
          </label>

          <label className="fileDrop">
            <ImageIcon size={18} />
            <span>Product photo optional</span>
            <strong>{productPhoto?.name ?? "No product photo"}</strong>
            <input
              accept="image/*"
              type="file"
              onChange={(event) => setProductPhoto(event.target.files?.[0] ?? null)}
            />
          </label>

          <label className="fileDrop">
            <ImageIcon size={18} />
            <span>Part photos optional</span>
            <strong>{partPhotoLabel}</strong>
            <input
              accept="image/*"
              multiple
              type="file"
              onChange={(event) => setPartPhotos(Array.from(event.target.files ?? []))}
            />
          </label>

          <div className="actionRow">
            <button className="primaryButton" disabled={!manualFile || isAnalyzing} onClick={handleBuild}>
              {isAnalyzing ? <Loader2 className="spinIcon" size={16} /> : <Wrench size={16} />}
              Let&apos;s Build
            </button>
            <button className="secondaryButton" disabled={isAnalyzing} onClick={() => void handleSample()}>
              Sample
            </button>
          </div>

          {analysis ? (
            <>
              <div className="summaryBox">
                <span>AI summary</span>
                <p>{analysis.summary}</p>
              </div>
              <div className="stepRail" aria-label="Assembly steps">
                {analysis.steps.map((step, index) => {
                  const isSelected = index === currentStepIndex;
                  const isDone = completedSteps.has(step.id);
                  const isFuture = index > currentStepIndex && !isDone;
                  return (
                    <button
                      className={`railStep ${isSelected ? "selected" : ""} ${isDone ? "done" : ""} ${
                        isFuture ? "locked" : ""
                      }`}
                      key={step.id}
                      onClick={() => selectStep(index)}
                    >
                      <span className="railMarker">{isDone ? <Check size={14} /> : isFuture ? <Lock size={13} /> : index + 1}</span>
                      <span className="railBody">
                        <strong>{step.title}</strong>
                        <small>
                          {step.duration} · {step.risk} risk
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </aside>

        <section className="panel guidePanel" aria-label="Assembly guide">
          {!analysis ? (
            <div className="emptyState">
              <Bot size={34} />
              <h1>Load a manual to build a visual guide</h1>
              <p>
                AssembleAI extracts parts, hardware, steps, and safety checks from the PDF, then turns them into a
                step-by-step workspace.
              </p>
            </div>
          ) : (
            <div className="assemblyWorkspace">
              <div className="workspaceHeader">
                <div>
                  <span>
                    Step {Math.min(currentStepIndex + 1, stepCount)} of {stepCount}
                  </span>
                  <span>{currentStepDuration}</span>
                  <h1>{currentStep?.title ?? "Step details unavailable"}</h1>
                </div>
                <div className="headerPills">
                  <span className={`riskPill ${currentStepRisk}`}>{currentStepRisk} risk</span>
                  <span className="visualPill">Generated visual: {currentVisual?.status ?? "idle"}</span>
                </div>
              </div>

              <div className="instructionBand">
                <Bot size={20} />
                <div>
                  <span>Plain-language instruction</span>
                  <p>{currentStep?.instruction ?? "The AI guide did not include instructions for this step."}</p>
                </div>
              </div>

              <div className="diagramShell">
                <div className="diagramToolbar">
                  <strong>Motion diagram</strong>
                  <div>
                    <button className="iconButton" title="Replay diagram">
                      <RefreshCw size={15} />
                    </button>
                    <button className="iconButton" title="Toggle visual zoom" onClick={() => setIsZoomed((zoomed) => !zoomed)}>
                      <ZoomIn size={15} />
                    </button>
                  </div>
                </div>
                <div className="frameStrip">
                  {FRAME_LABELS.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className={`visualFrame ${isZoomed ? "zoomed" : ""}`}>
                  {currentVisual?.status === "loading" ? (
                    <div className="visualState">
                      <Loader2 className="spinIcon" size={30} />
                      <strong>Generating reference image</strong>
                      <p>The visual queue is rendering this step in sequence.</p>
                    </div>
                  ) : currentVisual?.status === "ready" && currentVisual.imageUrl ? (
                    <button className="imageButton" onClick={() => setIsZoomed((zoomed) => !zoomed)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt={`Generated assembly visual for ${currentStep?.title ?? "current step"}`} src={currentVisual.imageUrl} />
                    </button>
                  ) : currentVisual?.status === "error" ? (
                    <div className="visualState error">
                      <AlertTriangle size={30} />
                      <strong>Reference image failed</strong>
                      <p>{currentVisual.error ?? "The generated illustration could not be created."}</p>
                      <button className="secondaryButton" onClick={retryCurrentVisual}>
                        Retry
                      </button>
                    </div>
                  ) : (
                    <div className="visualState">
                      <ImageIcon size={30} />
                      <strong>Queued visual</strong>
                      <p>This step is waiting for the generated illustration queue.</p>
                    </div>
                  )}
                </div>
                <div className="chipRow">
                  {currentStepParts.map((part) => (
                    <span key={part.id}>{part.quantity}x {part.name}</span>
                  ))}
                  {currentStepScrews.map((screw) => (
                    <span key={screw.id}>{screw.quantity}x {screw.name}</span>
                  ))}
                </div>
              </div>

              <div className={`motionPreview ${currentMotion?.status ?? "idle"}`}>
                <div>
                  <span>Veo Motion View</span>
                  <strong>
                    {currentMotion?.status === "ready"
                      ? "Motion ready"
                      : currentMotion && ACTIVE_MOTION_STATUSES.has(currentMotion.status)
                        ? "Creating motion"
                        : currentMotion?.status === "unavailable"
                          ? "Motion unavailable"
                          : currentMotion?.status === "error"
                            ? "Motion failed"
                            : "CSS technical preview"}
                  </strong>
                </div>
                <div className="motionStage">
                  {currentMotion?.status === "ready" && currentMotion.videoUrl ? (
                    <video autoPlay controls loop muted playsInline src={currentMotion.videoUrl} />
                  ) : currentMotion && ACTIVE_MOTION_STATUSES.has(currentMotion.status) ? (
                    <div className="motionProgressState">
                      <span>{currentMotion.status === "creating" ? "Starting Veo generation" : "Rendering motion video"}</span>
                      <div className="motionProgress" aria-label="Motion creation progress">
                        <span style={{ width: `${Math.max(0, Math.min(100, currentMotion.progress))}%` }} />
                      </div>
                      <small>{Math.max(0, Math.min(100, currentMotion.progress))}%</small>
                    </div>
                  ) : currentMotion?.status === "unavailable" || currentMotion?.status === "error" ? (
                    <p className="motionMessage">{currentMotion.error ?? "Motion video could not be created."}</p>
                  ) : (
                    <div className="motionTrack">
                      <span />
                      <span />
                      <span />
                    </div>
                  )}
                </div>
                <button
                  className="secondaryButton"
                  disabled={!currentStep || !canCreateCurrentMotion}
                  onClick={() => currentStep && void createMotionForStep(currentStep)}
                >
                  <Play size={15} />
                  Create motion
                </button>
              </div>

              <div className="partsGrid">
                <section className="subPanel">
                  <h2>Use these parts</h2>
                  <div className="partRows">
                    {currentStepParts.map((part) => (
                      <div className="partRow" key={part.id}>
                        <span>{part.id}</span>
                        <strong>{part.name}</strong>
                        <small>
                          {part.quantity}x · {part.dimensions} · {part.color}
                        </small>
                        <p>{part.note}</p>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="subPanel">
                  <h2>Hardware</h2>
                  <div className="partRows">
                    {currentStepScrews.map((screw) => (
                      <div className="screwRow" key={screw.id}>
                        <span>{screw.id}</span>
                        <strong>{screw.name}</strong>
                        <small>
                          {screw.quantity}x · {screw.dimensions}
                        </small>
                        <p>{screw.note}</p>
                      </div>
                    ))}
                    {currentStepScrews.length === 0 ? <p className="mutedText">No hardware listed for this step.</p> : null}
                  </div>
                  <p className="checkLine">
                    <ClipboardCheck size={16} />
                    {currentStep?.simpleCheck ?? "No check was provided for this step."}
                  </p>
                </section>
              </div>

              {currentStepCautions.length > 0 ? (
                <div className="cautionBand">
                  {currentStepCautions.map((caution) => (
                    <span key={caution}>
                      <AlertTriangle size={14} />
                      {caution}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>

        <aside className="panel checksPanel" aria-label="AI checks">
          <div className="panelHeader splitHeader">
            <div className="panelTitle">
              <Camera size={18} />
              <div>
                <h2>AI check</h2>
                <p>{analysis ? "Upload/camera check for this step." : "Checks become available after a guide exists."}</p>
              </div>
            </div>
            {verifyResult ? <span className={`scoreBadge ${verifyResult.status}`}>{Math.round(verifyResult.score * 100)}%</span> : null}
          </div>

          <div className="flowLabels" aria-label="Verification flow">
            <span>1 Photo/Camera</span>
            <ChevronRight size={14} />
            <span>2 Verify</span>
            <ChevronRight size={14} />
            <span>3 Continue</span>
          </div>

          <label className="fileDrop progressDrop">
            <Camera size={18} />
            <span>Progress photo</span>
            <strong>{progressPhoto?.name ?? "Upload current build photo"}</strong>
            <input
              accept="image/*"
              disabled={!analysis}
              type="file"
              onChange={(event) => handleProgressPhoto(event.target.files?.[0] ?? null)}
            />
          </label>

          <div className={`cameraBox ${cameraEnabled ? "enabled" : ""}`}>
            <div className="cameraHeader">
              <div>
                <strong>Live camera</strong>
                <span>{cameraEnabled ? "Preview active" : "Use when you want hands-free checks."}</span>
              </div>
              <button className="secondaryButton" disabled={!analysis || cameraPending} onClick={() => void toggleCamera()}>
                <Camera size={16} />
                {cameraPending ? "Starting camera" : cameraEnabled ? "Disable camera" : "Enable camera"}
              </button>
            </div>
            {cameraEnabled || cameraPending ? (
              <video ref={videoRef} autoPlay muted playsInline />
            ) : (
              <div className="cameraPlaceholder">
                <Camera size={24} />
                <span>Camera preview appears here.</span>
              </div>
            )}
            {cameraError ? <p className="cameraError">{cameraError}</p> : null}
          </div>

          <div className="checkActions">
            <button className="primaryButton" disabled={!analysis || !progressPhoto || isChecking} onClick={() => void checkCurrentStep()}>
              {isChecking ? <Loader2 className="spinIcon" size={16} /> : <ClipboardCheck size={16} />}
              Check this step
            </button>
            <button
              className="secondaryButton"
              disabled={!analysis || !cameraEnabled || isChecking}
              onClick={() => void checkCameraFrame()}
            >
              {isChecking ? <Loader2 className="spinIcon" size={16} /> : <Camera size={16} />}
              Check camera frame
            </button>
          </div>

          {verifyResult ? (
            <div className={`verifyResult ${verifyResult.status}`}>
              <span>{verifyResult.status === "pass" || verifyResult.score >= 0.72 ? "Ready to continue" : "Needs review"}</span>
              <strong>{verifyResult.message}</strong>
              <div>
                <h3>What the AI checked</h3>
                <ul>
                  {verifyResult.checklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <p className="guidanceBox">{verifyResult.nextFix}</p>
            </div>
          ) : (
            <div className="emptyCheck">
              <ClipboardCheck size={28} />
              <p>Checks become available after a guide exists. Upload a manual first, then attach a progress photo.</p>
            </div>
          )}

          <button className="continueButton" disabled={!canContinue} onClick={continueToNextStep}>
            Continue
            <ChevronRight size={16} />
          </button>

          <div className="assetStatus">
            <span>Visual: {currentVisual?.status ?? "idle"}</span>
            <span>Motion: {currentMotion?.status ?? "idle"}</span>
            <span>
              Complete: {completedCount}/{stepCount}
            </span>
            {currentStepDone ? <span>Current step verified</span> : null}
          </div>
        </aside>
      </section>
    </main>
  );
}
