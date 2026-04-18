import { useRef, useEffect, useCallback, useState } from 'react';

interface CameraCaptureProps {
  onCapture: (imageData: string) => void;
  onPermissionDenied: (error: string) => void;
  onStreaming: () => void;
  onPermissionRequested: () => void;
  isStreaming: boolean;
}

export function CameraCapture({
  onCapture,
  onPermissionDenied,
  onStreaming,
  onPermissionRequested,
  isStreaming,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Stable refs for callbacks to avoid re-triggering effects
  const cbRefs = useRef({ onCapture, onPermissionDenied, onStreaming, onPermissionRequested });
  cbRefs.current = { onCapture, onPermissionDenied, onStreaming, onPermissionRequested };

  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    cbRefs.current.onPermissionRequested();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      cbRefs.current.onStreaming();
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access in your browser settings.'
          : err instanceof DOMException && err.name === 'NotFoundError'
            ? 'No camera found on this device.'
            : 'Failed to access camera. Please try again.';
      cbRefs.current.onPermissionDenied(message);
    }
  }, []);

  // Start camera on mount
  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    cbRefs.current.onCapture(dataUrl);

    // Stop stream after capture
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleFlipCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setFacingMode((prev) => {
      const next = prev === 'user' ? 'environment' : 'user';
      startCamera(next);
      return next;
    });
  }, [startCamera]);

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
          <span className="face-guide-label">Position your face here</span>
        </div>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
      <div className="camera-controls">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleFlipCamera}
          title="Flip camera"
        >
          <FlipIcon />
        </button>
        <button
          type="button"
          className="btn btn-capture"
          onClick={handleCapture}
          disabled={!isStreaming}
        >
          <span className="capture-ring" />
        </button>
        <div className="btn-placeholder" />
      </div>
    </div>
  );
}

function FlipIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 3h5v5" />
      <path d="M4 20L21 3" />
      <path d="M21 16v5h-5" />
      <path d="M15 15l6 6" />
      <path d="M4 4l5 5" />
    </svg>
  );
}
