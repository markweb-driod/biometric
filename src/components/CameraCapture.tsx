import { useRef, useEffect, useCallback, useState } from 'react';

const ACTIVE_LIVENESS_STEPS = [
  'Center the subject inside the frame',
  'Ask the subject to blink once',
  'Ask the subject to turn slightly left or right',
] as const;

const REQUIRED_LIVENESS_FRAMES = 3;

interface CameraCaptureProps {
  /** Pre-selected camera device ID from app-level setup. Empty string → default camera. */
  initialDeviceId: string;
  onCapture: (imageData: string, livenessFrames: string[]) => void;
  onPermissionDenied: (error: string) => void;
  onStreaming: () => void;
  onPermissionRequested: () => void;
  onLivenessUpdate?: (count: number, hasMotion: boolean) => void;
  isStreaming: boolean;
}

export function CameraCapture({
  initialDeviceId,
  onCapture,
  onPermissionDenied,
  onStreaming,
  onPermissionRequested,
  onLivenessUpdate,
  isStreaming,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const livenessBufferRef = useRef<string[]>([]);
  const livenessIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [livenessCount, setLivenessCount] = useState(0);
  const [hasMotionEvidence, setHasMotionEvidence] = useState(false);
  // Ref mirrors the state so the interval closure never goes stale and never
  // retriggers startCamera when motion is first detected.
  const hasMotionEvidenceRef = useRef(false);

  // Stable refs for callbacks to avoid re-triggering effects
  const cbRefs = useRef({ onCapture, onPermissionDenied, onStreaming, onPermissionRequested, onLivenessUpdate });
  cbRefs.current = { onCapture, onPermissionDenied, onStreaming, onPermissionRequested, onLivenessUpdate };

  // Capture a half-resolution frame from the live stream for liveness analysis.
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;
    const lc = document.createElement('canvas');
    lc.width = Math.round(video.videoWidth / 2);
    lc.height = Math.round(video.videoHeight / 2);
    const ctx = lc.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, lc.width, lc.height);
    return lc.toDataURL('image/jpeg', 0.7);
  }, []);

  const estimateFrameMotion = useCallback((previousFrame: string | null, nextFrame: string) => {
    if (!previousFrame || previousFrame === nextFrame) return false;

    try {
      const previousPayload = previousFrame.split(',')[1] ?? '';
      const nextPayload = nextFrame.split(',')[1] ?? '';
      if (!previousPayload || !nextPayload) return false;

      let differences = 0;
      const sampleSize = Math.min(previousPayload.length, nextPayload.length, 160);
      for (let i = 0; i < sampleSize; i += 8) {
        if (previousPayload.charCodeAt(i) !== nextPayload.charCodeAt(i)) {
          differences += 1;
        }
      }

      return differences >= 4;
    } catch {
      return false;
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (livenessIntervalRef.current !== null) {
      clearInterval(livenessIntervalRef.current);
      livenessIntervalRef.current = null;
    }
    livenessBufferRef.current = [];
    setLivenessCount(0);
    hasMotionEvidenceRef.current = false;
    setHasMotionEvidence(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    cbRefs.current.onPermissionRequested();
    try {
      const constraints: MediaStreamConstraints = {
        video: initialDeviceId
          ? { deviceId: { exact: initialDeviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
          : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      cbRefs.current.onStreaming();

      // Background frame collection for liveness (350 ms interval, rolling buffer of 3)
      livenessIntervalRef.current = setInterval(() => {
        const frame = captureFrame();
        if (frame !== null) {
          const previousFrame = livenessBufferRef.current[livenessBufferRef.current.length - 1] ?? null;
          livenessBufferRef.current = [...livenessBufferRef.current.slice(-(REQUIRED_LIVENESS_FRAMES - 1)), frame];
          const newCount = livenessBufferRef.current.length;
          setLivenessCount(newCount);
          let motionNow = hasMotionEvidenceRef.current;
          if (!hasMotionEvidenceRef.current && estimateFrameMotion(previousFrame, frame)) {
            hasMotionEvidenceRef.current = true;
            setHasMotionEvidence(true);
            motionNow = true;
          }
          cbRefs.current.onLivenessUpdate?.(newCount, motionNow);
        }
      }, 350);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access in your browser settings.'
          : err instanceof DOMException && err.name === 'NotFoundError'
            ? 'No camera found on this device.'
            : 'Failed to access camera. Please try again.';
      cbRefs.current.onPermissionDenied(message);
    }
  // hasMotionEvidence intentionally excluded — tracked via ref to avoid restarting
  // the camera stream every time the first motion frame is detected.
  }, [initialDeviceId, captureFrame, estimateFrameMotion]);

  useEffect(() => {
    startCamera();
    return () => {
      if (livenessIntervalRef.current !== null) {
        clearInterval(livenessIntervalRef.current);
        livenessIntervalRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [startCamera]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const livenessFrames = [...livenessBufferRef.current];

    if (livenessIntervalRef.current !== null) {
      clearInterval(livenessIntervalRef.current);
      livenessIntervalRef.current = null;
    }
    livenessBufferRef.current = [];

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    cbRefs.current.onCapture(dataUrl, livenessFrames);
  }, []);

  const livenessReady = livenessCount >= REQUIRED_LIVENESS_FRAMES && hasMotionEvidence;
  const livenessStepIndex = Math.min(
    ACTIVE_LIVENESS_STEPS.length - 1,
    hasMotionEvidence ? ACTIVE_LIVENESS_STEPS.length - 1 : livenessCount,
  );

  return (
    <div className="camera-capture">
      <div className="capture-stage-card">
        <div className="capture-stage-header">
          <div>
            <span className="capture-stage-eyebrow">Active Liveness</span>
            <h3>Confirm the subject is physically present before capture</h3>
          </div>
          <span className={`capture-stage-status${livenessReady ? ' capture-stage-status-ready' : ''}`}>
            {livenessReady ? 'Ready to capture' : 'Awaiting motion proof'}
          </span>
        </div>

        <div className="liveness-checklist" aria-label="Active liveness checklist">
          {ACTIVE_LIVENESS_STEPS.map((step, index) => {
            const isComplete = index < livenessStepIndex || (index === ACTIVE_LIVENESS_STEPS.length - 1 && livenessReady);
            const isCurrent = !isComplete && index === livenessStepIndex;

            return (
              <div
                key={step}
                className={`liveness-checkpoint${isComplete ? ' is-complete' : ''}${isCurrent ? ' is-current' : ''}`}
              >
                <span className="liveness-checkpoint-index">{isComplete ? '✓' : index + 1}</span>
                <span className="liveness-checkpoint-text">{step}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="camera-viewport">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera-video"
        />
        <div className="face-guide">
          <div className="face-oval" />
          <div className="face-corners">
            <span /><span /><span /><span />
          </div>
          {isStreaming && (
            <div className={`liveness-coaching${livenessReady ? ' liveness-ready' : ''}`}>
              <div className="liveness-dots">
                {Array.from({ length: REQUIRED_LIVENESS_FRAMES }).map((_, i) => (
                  <span
                    key={i}
                    className={`liveness-dot${
                      i < livenessCount
                        ? ' liveness-dot--active'
                        : !livenessReady
                          ? ' liveness-dot--collecting'
                          : ''
                    }`}
                  />
                ))}
              </div>
              <span className="liveness-text">{getLivenessCoachText(livenessCount, hasMotionEvidence)}</span>
            </div>
          )}
          <span className="face-guide-label">Position subject's face here</span>
        </div>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
      <div className="camera-controls">
        <button
          type="button"
          className="btn-capture"
          onClick={handleCapture}
          disabled={!isStreaming || !livenessReady}
          title={
            !isStreaming
              ? 'Waiting for camera stream'
              : !livenessReady
                ? 'Complete the active liveness steps before capture'
                : 'Capture photo'
          }
        >
          <span className="capture-ring" />
        </button>
        <p className="camera-controls-note">
          {livenessReady
            ? 'Motion verified. Capture the enrollment photo now.'
            : 'Capture unlocks after a blink and slight head movement are detected.'}
        </p>
      </div>
    </div>
  );
}

function getLivenessCoachText(count: number, hasMotionEvidence: boolean): string {
  if (count === 0) return 'Look at the camera. Stay still.';
  if (count === 1) return 'Good. Ask the subject to blink once.';
  if (!hasMotionEvidence) return 'Now ask the subject to turn slightly left or right.';
  return 'Ready — active liveness confirmed.';
}
