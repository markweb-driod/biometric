import { useRef, useEffect, useCallback, useState } from 'react';
import { LivenessSocket } from '../services/livenessSocket';
import { analyzeImageQuality } from '../services/imageQuality';
import type { QualityIssue } from '../services/imageQuality';

const REQUIRED_LIVENESS_FRAMES = 3;
const LIVENESS_WARMUP_MS = 1000;
const MIN_MOTION_CONFIRMATION_UPDATES = 2;
const LIVENESS_WINDOW_MS = 8_000;

interface CameraCaptureProps {
  /** Pre-selected camera device ID from app-level setup. Empty string → default camera. */
  initialDeviceId: string;
  onCapture: (imageData: string, livenessFrames: string[]) => void;
  onPermissionDenied: (error: string) => void;
  onStreaming: () => void;
  onPermissionRequested: () => void;
  onLivenessUpdate?: (count: number, hasMotion: boolean, faceInFrame: boolean, livenessReady: boolean) => void;
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
  const [livenessArmed, setLivenessArmed] = useState(false);
  const livenessArmedRef = useRef(false);
  const livenessWarmupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMotionEvidenceRef = useRef(false);
  const motionPositiveStreakRef = useRef(0);
  const [backendLivenessPassed, setBackendLivenessPassed] = useState(false);
  const backendLivenessPassedRef = useRef(false);
  const [faceInFrame, setFaceInFrame] = useState(false);
  const faceInFrameRef = useRef(false);
  const [liveQualityErrors, setLiveQualityErrors] = useState<QualityIssue[]>([]);
  const qualityCheckInFlightRef = useRef(false);
  const lastQualityCheckAtRef = useRef(0);
  // Capture-window: once liveness passes the operator has LIVENESS_WINDOW_MS to click
  // capture before the approval is rescinded, closing the bait-and-switch window.
  const [livenessSecondsLeft, setLivenessSecondsLeft] = useState<number | null>(null);
  const expiryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const livenessWindowActiveRef = useRef(false);
  const socketRef = useRef<LivenessSocket | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  // Stable refs for callbacks to avoid re-triggering effects
  const cbRefs = useRef({ onCapture, onPermissionDenied, onStreaming, onPermissionRequested, onLivenessUpdate });
  cbRefs.current = { onCapture, onPermissionDenied, onStreaming, onPermissionRequested, onLivenessUpdate };

  // Capture a half-resolution frame from the live stream for liveness analysis.
  const captureFrame = useCallback((): { data: string; isBlank: boolean } | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;
    const lc = document.createElement('canvas');
    lc.width = Math.round(video.videoWidth / 2);
    lc.height = Math.round(video.videoHeight / 2);
    const ctx = lc.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, lc.width, lc.height);

    // Basic "blank/dark" detection to prevent unverified captures
    const imageData = ctx.getImageData(0, 0, lc.width, lc.height).data;
    let brightness = 0;
    for (let i = 0; i < imageData.length; i += 4) {
      brightness += (imageData[i] + imageData[i+1] + imageData[i+2]) / 3;
    }
    const avgBrightness = brightness / (imageData.length / 4);
    const isBlank = avgBrightness < 20 || avgBrightness > 235; // Too dark or too bright

    return { data: lc.toDataURL('image/jpeg', 0.7), isBlank };
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
    motionPositiveStreakRef.current = 0;
    livenessArmedRef.current = false;
    setLivenessArmed(false);
    backendLivenessPassedRef.current = false;
    setBackendLivenessPassed(false);
    faceInFrameRef.current = false;
    setFaceInFrame(false);
    setLiveQualityErrors([]);
    qualityCheckInFlightRef.current = false;
    lastQualityCheckAtRef.current = 0;
    setLivenessSecondsLeft(null);
    livenessWindowActiveRef.current = false;
    if (expiryIntervalRef.current !== null) {
      clearInterval(expiryIntervalRef.current);
      expiryIntervalRef.current = null;
    }
    if (livenessWarmupTimeoutRef.current !== null) {
      clearTimeout(livenessWarmupTimeoutRef.current);
      livenessWarmupTimeoutRef.current = null;
    }
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
      livenessWarmupTimeoutRef.current = setTimeout(() => {
        livenessArmedRef.current = true;
        setLivenessArmed(true);
      }, LIVENESS_WARMUP_MS);

      // Background frame collection for liveness (350 ms interval, rolling buffer of 3)
      livenessIntervalRef.current = setInterval(() => {
        const frameResult = captureFrame();
        if (frameResult !== null && !frameResult.isBlank) {
          const frame = frameResult.data;

          // Always send to socket — backend needs frames to detect face presence
          if (socketRef.current) {
            socketRef.current.sendFrame(frame);
          }

          // Only buffer frames and run quality checks when face is confirmed present
          if (!faceInFrameRef.current) {
            // Face not in frame — clear stale buffer, skip quality, do not accumulate
            livenessBufferRef.current = [];
            return;
          }

          // Pre-capture quality gate: run lightweight checks periodically and block
          // capture until there are no blocking issues.
          const now = Date.now();
          if (!qualityCheckInFlightRef.current && now - lastQualityCheckAtRef.current >= 700) {
            qualityCheckInFlightRef.current = true;
            lastQualityCheckAtRef.current = now;
            analyzeImageQuality(frame)
              .then((result) => {
                setLiveQualityErrors(result.issues.filter((issue) => issue.severity === 'error'));
              })
              .finally(() => {
                qualityCheckInFlightRef.current = false;
              });
          }

          livenessBufferRef.current = [...livenessBufferRef.current.slice(-(REQUIRED_LIVENESS_FRAMES - 1)), frame];

          if (!livenessArmedRef.current) {
            cbRefs.current.onLivenessUpdate?.(0, false, false, false);
            return;
          }
        }
      }, 200);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access in your browser settings.'
          : err instanceof DOMException && err.name === 'NotFoundError'
            ? 'No camera found on this device.'
            : 'Failed to access camera. Please try again.';
      cbRefs.current.onPermissionDenied(message);
    }
  }, [initialDeviceId, captureFrame]);

  useEffect(() => {
    const socketUrl = import.meta.env.VITE_LIVENESS_SOCKET_URL ||
      `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/liveness`;

    const socketEvents = {
      onConnect: () => setIsSocketConnected(true),
      onDisconnect: () => setIsSocketConnected(false),
      onError: (err: string) => console.error('Liveness socket error:', err),
      onStatus: (status: { liveness_passed: boolean; count: number; has_motion: boolean; face_in_frame?: boolean }) => {
        const isFacePresent = status.face_in_frame ?? false;  // safe default: false
        faceInFrameRef.current = isFacePresent;
        setFaceInFrame(isFacePresent);

        if (!isFacePresent) {
          // Face left — full reset of liveness state
          setBackendLivenessPassed(false);
          backendLivenessPassedRef.current = false;
          setHasMotionEvidence(false);
          hasMotionEvidenceRef.current = false;
          motionPositiveStreakRef.current = 0;
          setLivenessCount(0);
          // Cancel any active liveness window
          if (expiryIntervalRef.current) {
            clearInterval(expiryIntervalRef.current);
            expiryIntervalRef.current = null;
          }
          livenessWindowActiveRef.current = false;
          setLivenessSecondsLeft(null);
          cbRefs.current.onLivenessUpdate?.(0, false, false, false);
          return;
        }

        const effectiveCount = livenessArmedRef.current ? status.count : 0;
        setLivenessCount(effectiveCount);

        if (status.has_motion) {
          motionPositiveStreakRef.current += 1;
        } else {
          motionPositiveStreakRef.current = 0;
        }

        const motionConfirmed = motionPositiveStreakRef.current >= MIN_MOTION_CONFIRMATION_UPDATES;
        setHasMotionEvidence(motionConfirmed);
        hasMotionEvidenceRef.current = motionConfirmed;

        const backendReadyThisTick =
          livenessArmedRef.current &&
          isFacePresent &&
          effectiveCount >= REQUIRED_LIVENESS_FRAMES &&
          motionConfirmed &&
          status.liveness_passed;

        if (backendReadyThisTick) {
          setBackendLivenessPassed(true);
          backendLivenessPassedRef.current = true;
          // Start window countdown if not already started (use ref to avoid stale closure)
          if (!livenessWindowActiveRef.current) {
            livenessWindowActiveRef.current = true;
            const expiresAt = Date.now() + LIVENESS_WINDOW_MS;
            setLivenessSecondsLeft(Math.ceil(LIVENESS_WINDOW_MS / 1000));
            if (expiryIntervalRef.current) clearInterval(expiryIntervalRef.current);
            expiryIntervalRef.current = setInterval(() => {
              const remaining = expiresAt - Date.now();
              if (remaining <= 0) {
                if (expiryIntervalRef.current) clearInterval(expiryIntervalRef.current);
                expiryIntervalRef.current = null;
                livenessWindowActiveRef.current = false;
                setBackendLivenessPassed(false);
                backendLivenessPassedRef.current = false;
                setHasMotionEvidence(false);
                hasMotionEvidenceRef.current = false;
                setLivenessSecondsLeft(null);
                setLivenessCount(0);
                livenessBufferRef.current = [];
                cbRefs.current.onLivenessUpdate?.(0, false, faceInFrameRef.current, false);
              } else {
                setLivenessSecondsLeft(Math.ceil(remaining / 1000));
              }
            }, 500);
          }
        }

        // Propagate authoritative liveness state to parent
        const isLivenessReady =
          livenessArmedRef.current &&
          backendLivenessPassedRef.current &&
          isFacePresent &&
          motionConfirmed &&
          effectiveCount >= REQUIRED_LIVENESS_FRAMES;
        cbRefs.current.onLivenessUpdate?.(effectiveCount, motionConfirmed, isFacePresent, isLivenessReady);
      }
    };

    // The user has requested to use real liveness checks. 
    // We will use the real LivenessSocket by default now.
    socketRef.current = new LivenessSocket(socketUrl, socketEvents);
    
    socketRef.current.connect();

    startCamera();
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (livenessIntervalRef.current !== null) {
        clearInterval(livenessIntervalRef.current);
        livenessIntervalRef.current = null;
      }
      if (livenessWarmupTimeoutRef.current !== null) {
        clearTimeout(livenessWarmupTimeoutRef.current);
        livenessWarmupTimeoutRef.current = null;
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

    // Cancel the expiry countdown — capture is happening now
    if (expiryIntervalRef.current !== null) {
      clearInterval(expiryIntervalRef.current);
      expiryIntervalRef.current = null;
    }
    livenessWindowActiveRef.current = false;
    setLivenessSecondsLeft(null);

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

  const livenessReady =
    livenessArmed &&
    backendLivenessPassed &&
    faceInFrame &&
    hasMotionEvidence &&
    livenessCount >= REQUIRED_LIVENESS_FRAMES;
  // Only block on quality errors that have actually been detected — never block
  // just because the quality check hasn't run yet.
  const qualityReady = liveQualityErrors.length === 0;
  const captureReady = livenessReady && qualityReady;
  const primaryQualityError = liveQualityErrors[0];
  return (
    <div className="camera-capture">


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
              <span className="liveness-text">{getLivenessCoachText(livenessCount, hasMotionEvidence, livenessArmed, faceInFrame)}</span>
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
          disabled={!isStreaming || !captureReady}
          title={
            !isStreaming
              ? 'Waiting for camera stream'
              : !livenessReady
                ? 'Complete the active liveness steps before capture'
                : !qualityReady
                  ? 'Fix image quality issues before capture'
                : 'Capture photo'
          }
        >
          <span className="capture-ring" />
        </button>
        <p className={`camera-controls-note${(!faceInFrame || liveQualityErrors.length > 0) ? ' is-alert' : ''}`}>
          {liveQualityErrors.length > 0
            ? (primaryQualityError?.suggestion ?? 'Fix the highlighted quality issue before capture.')
            : livenessReady
            ? `Motion verified. Capture now — window closes in ${livenessSecondsLeft}s.`
            : !faceInFrame
              ? 'Face left the guide. Move the subject back into the frame.'
            : !isSocketConnected
              ? 'Connecting to live liveness service...'
            : livenessArmed
              ? 'Live liveness is tracking blink and slight head movement in real time.'
              : 'Stabilizing stream. Active liveness starts automatically in a moment.'}
        </p>
      </div>
    </div>
  );
}

function getLivenessCoachText(count: number, hasMotionEvidence: boolean, livenessArmed: boolean, faceInFrame: boolean): string {
  if (!livenessArmed) return 'Calibrating camera feed...';
  if (!faceInFrame) return 'Face not in frame. Center the face in the guide.';
  if (count === 0) return 'Look at the camera. Stay still.';
  if (count === 1) return 'Good. Ask the subject to blink once.';
  if (!hasMotionEvidence) return 'Now ask the subject to turn slightly left or right.';
  return 'Ready — active liveness confirmed.';
}
