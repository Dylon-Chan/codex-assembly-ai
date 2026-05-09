"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
  const [verifiedStepId, setVerifiedStepId] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const retryRunIdRef = useRef(0);
  const analysisRunIdRef = useRef(0);
  const verifyRunIdRef = useRef(0);

  const currentStep = analysis?.steps[currentStepIndex];
  const currentVisual = currentStep ? visuals[currentStep.id] : undefined;
  const currentMotion = currentStep ? motions[currentStep.id] : undefined;
  const currentStepDone = Boolean(currentStep && completedSteps.has(currentStep.id));
  const canContinue =
    Boolean(analysis && currentStepIndex < (analysis?.steps.length ?? 0) - 1) &&
    Boolean(
      currentStep &&
        verifiedStepId === currentStep.id &&
        verifyResult &&
        (verifyResult.status === "pass" || verifyResult.score >= 0.72)
    );

  const stepCount = analysis?.steps.length ?? 0;
  const completedCount = completedSteps.size;
  const currentStepDuration = currentStep?.duration ?? "Duration pending";
  const currentStepRisk = currentStep?.risk ?? "low";
  const currentStepScrews = currentStep?.screws ?? [];
  const currentStepParts = currentStep?.parts ?? [];
  const currentStepCautions = currentStep?.cautions ?? [];

  const partPhotoLabel = useMemo(() => {
    if (partPhotos.length === 0) return "No part photos";
    if (partPhotos.length === 1) return partPhotos[0]?.name ?? "1 part photo";
    return `${partPhotos.length} part photos`;
  }, [partPhotos]);

  const setStepVisual = useCallback((stepId: string, visual: StepVisualState) => {
    setVisuals((previous) => ({ ...previous, [stepId]: visual }));
  }, []);

  const initializeVisualQueue = useCallback(
    (nextAnalysis: AnalysisResult) => {
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      setVisuals(Object.fromEntries(nextAnalysis.steps.map((step) => [step.id, { status: "idle" as const }])));
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
    runIdRef.current += 1;
    retryRunIdRef.current += 1;
    analysisRunIdRef.current += 1;
    verifyRunIdRef.current += 1;
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
    setVisuals({});
    setMotions({});
  }, []);

  const handleProgressPhoto = useCallback((file: File | null) => {
    setProgressPhoto(file);
    setVerifyResult(file ? PHOTO_ATTACHED_RESULT : null);
    setVerifiedStepId(null);
    setNotice(file ? "Progress photo attached. Run AI check when ready." : "Progress photo cleared.");
  }, []);

  const checkCurrentStep = useCallback(
    async (photoOverride?: File | null) => {
      if (!currentStep) return;
      const checkedStepId = currentStep.id;
      const verifyRunId = verifyRunIdRef.current + 1;
      verifyRunIdRef.current = verifyRunId;
      const photo = photoOverride ?? progressPhoto;
      const formData = new FormData();
      formData.append("stepTitle", currentStep.title);
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
    },
    [currentStep, progressPhoto]
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
        <div className="statusCluster">
          <span className="statusChip">
            {analysis ? `AI extraction ${Math.round(analysis.confidence * 100)}%` : "Ready for manual"}
          </span>
          <span className="noticeText">{notice}</span>
        </div>
      </header>

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

              <div className="motionPreview">
                <div>
                  <span>Veo Motion View</span>
                  <strong>{currentMotion?.status === "ready" ? "Motion ready" : "CSS technical preview"}</strong>
                </div>
                <div className="motionTrack">
                  <span />
                  <span />
                  <span />
                </div>
                <button className="secondaryButton" disabled={currentVisual?.status !== "ready"}>
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

          <div className="checkActions">
            <button className="primaryButton" disabled={!analysis || !progressPhoto || isChecking} onClick={() => void checkCurrentStep()}>
              {isChecking ? <Loader2 className="spinIcon" size={16} /> : <ClipboardCheck size={16} />}
              Check this step
            </button>
            <button
              className="secondaryButton"
              disabled={!analysis}
              onClick={() => setVoiceState((state) => (state === "off" ? "listening" : "off"))}
            >
              {voiceState === "off" ? <Mic size={16} /> : <MicOff size={16} />}
              Voice {voiceState}
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
