"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Bot,
  Camera,
  Check,
  ClipboardCheck,
  FileText,
  ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Upload,
  Video,
  Wrench
} from "lucide-react";
import type { AnalysisResult, MotionState, StepVisualState, VerifyResult, VoiceState } from "../lib/types";

const PHOTO_ATTACHED_RESULT: VerifyResult = {
  status: "warning",
  score: 0.61,
  message: "Photo attached. Run AI check before moving on.",
  checklist: ["Photo is ready for inspection", "Step target loaded", "Waiting for verification"],
  nextFix: "Use a wide photo that includes the whole joint or shelf."
};

type AnalyzeResponse = {
  analysis?: AnalysisResult;
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
  const [notice, setNotice] = useState("Upload a manual or try the sample PDF.");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [visuals, setVisuals] = useState<Record<string, StepVisualState>>({});
  const [motions, setMotions] = useState<Record<string, MotionState>>({});
  const [voiceState, setVoiceState] = useState<VoiceState>("off");

  const currentStep = analysis?.steps[currentStepIndex];
  const currentVisual = currentStep ? visuals[currentStep.id] : undefined;
  const currentMotion = currentStep ? motions[currentStep.id] : undefined;

  const stepCount = analysis?.steps.length ?? 0;
  const completedCount = completedSteps.size;
  const currentStepScrews = currentStep?.screws ?? [];
  const currentStepParts = currentStep?.parts ?? [];
  const currentStepCautions = currentStep?.cautions ?? [];

  const partPhotoLabel = useMemo(() => {
    if (partPhotos.length === 0) return "No part photos";
    if (partPhotos.length === 1) return partPhotos[0]?.name ?? "1 part photo";
    return `${partPhotos.length} part photos`;
  }, [partPhotos]);

  const initializeVisualQueue = useCallback((nextAnalysis: AnalysisResult) => {
    setVisuals(Object.fromEntries(nextAnalysis.steps.map((step) => [step.id, { status: "idle" as const }])));
    setMotions({});
  }, []);

  const buildGuideFromFile = useCallback(
    async (file: File) => {
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
        const nextAnalysis = payload.analysis;
        setAnalysis(nextAnalysis);
        setCurrentStepIndex(0);
        setCompletedSteps(new Set());
        setVerifyResult(null);
        setProgressPhoto(null);
        setNotice("Guide built. Generating step visuals.");
        initializeVisualQueue(nextAnalysis);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Manual analysis failed.");
      } finally {
        setIsAnalyzing(false);
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

  const handleProgressPhoto = useCallback((file: File | null) => {
    setProgressPhoto(file);
    setVerifyResult(file ? PHOTO_ATTACHED_RESULT : null);
  }, []);

  const toggleCurrentStep = useCallback(() => {
    if (!currentStep) return;
    setCompletedSteps((previous) => {
      const next = new Set(previous);
      if (next.has(currentStep.id)) {
        next.delete(currentStep.id);
      } else {
        next.add(currentStep.id);
      }
      return next;
    });
  }, [currentStep]);

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
          <div className="panelHeader">
            <FileText size={18} />
            <div>
              <h2>Source manual</h2>
              <p>Upload the PDF that came with the product.</p>
            </div>
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
              {isAnalyzing ? <Loader2 size={16} /> : <Wrench size={16} />}
              Let&apos;s Build
            </button>
            <button className="secondaryButton" disabled={isAnalyzing} onClick={() => void handleSample()}>
              Sample
            </button>
          </div>
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
            <div className="guideState">
              <div className="projectSummary">
                <span>
                  Step {Math.min(currentStepIndex + 1, stepCount)} of {stepCount}
                </span>
                <h1>{analysis.projectName}</h1>
                <p>{analysis.summary}</p>
              </div>

              <div className="stepCard">
                <div className="stepMeta">
                  <span>{currentStep?.duration ?? "Duration pending"}</span>
                  <span>{currentStep?.risk ?? "low"} risk</span>
                  <span>{currentStepScrews.length} screw types</span>
                </div>
                <h2>{currentStep?.title ?? "Step details unavailable"}</h2>
                <p>{currentStep?.instruction ?? "The AI guide did not include instructions for this step."}</p>
                <p className="checkLine">
                  <ClipboardCheck size={16} />
                  {currentStep?.simpleCheck ?? "No check was provided for this step."}
                </p>
                {currentStepCautions.length > 0 ? (
                  <ul className="cautionList">
                    {currentStepCautions.map((caution) => (
                      <li key={caution}>{caution}</li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="stepDetails">
                <div>
                  <h3>Parts</h3>
                  <ul>
                    {currentStepParts.map((part) => (
                      <li key={part.id}>
                        {part.quantity}x {part.name}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Hardware</h3>
                  <ul>
                    {currentStepScrews.map((screw) => (
                      <li key={screw.id}>
                        {screw.quantity}x {screw.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="stepControls">
                <button disabled={currentStepIndex === 0} onClick={() => setCurrentStepIndex((index) => index - 1)}>
                  Previous
                </button>
                <button onClick={toggleCurrentStep}>
                  <Check size={16} />
                  {currentStep && completedSteps.has(currentStep.id) ? "Marked done" : "Mark done"}
                </button>
                <button
                  disabled={currentStepIndex >= stepCount - 1}
                  onClick={() => setCurrentStepIndex((index) => index + 1)}
                >
                  Next
                </button>
              </div>

              <div className="assetStatus">
                <span>Visual: {currentVisual?.status ?? "idle"}</span>
                <span>Motion: {currentMotion?.status ?? "idle"}</span>
                <span>
                  Complete: {completedCount}/{stepCount}
                </span>
              </div>
            </div>
          )}
        </section>

        <aside className="panel checksPanel" aria-label="AI checks">
          <div className="panelHeader">
            <Camera size={18} />
            <div>
              <h2>AI check</h2>
              <p>{analysis ? "Attach a progress photo for the current step." : "Checks become available after a guide exists."}</p>
            </div>
          </div>

          <label className="fileDrop">
            <Camera size={18} />
            <span>Progress photo</span>
            <strong>{progressPhoto?.name ?? "No progress photo"}</strong>
            <input
              accept="image/*"
              disabled={!analysis}
              type="file"
              onChange={(event) => handleProgressPhoto(event.target.files?.[0] ?? null)}
            />
          </label>

          <div className="checkActions">
            <button disabled={!analysis || !progressPhoto}>
              <ClipboardCheck size={16} />
              Run AI check
            </button>
            <button disabled={!analysis}>
              <Video size={16} />
              Motion preview
            </button>
            <button
              disabled={!analysis}
              onClick={() => setVoiceState((state) => (state === "off" ? "listening" : "off"))}
            >
              {voiceState === "off" ? <Mic size={16} /> : <MicOff size={16} />}
              Voice {voiceState}
            </button>
          </div>

          {verifyResult ? (
            <div className="verifyResult">
              <strong>{verifyResult.message}</strong>
              <p>Score {Math.round(verifyResult.score * 100)}%</p>
              <ul>
                {verifyResult.checklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p>{verifyResult.nextFix}</p>
            </div>
          ) : (
            <div className="emptyCheck">
              <ClipboardCheck size={28} />
              <p>Checks become available after a guide exists. Upload a manual first, then attach a progress photo.</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
