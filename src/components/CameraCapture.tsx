import { useRef, useEffect, useCallback, useState } from 'react';
import { DeviceSelector } from './DeviceSelector';

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
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  // Stable refs for callbacks to avoid re-triggering effects
  const cbRefs = useRef({ onCapture, onPermissionDenied, onStreaming, onPermissionRequested });
  cbRefs.current = { onCapture, onPermissionDenied, onStreaming, onPermissionRequested };

  const startCamera = useCallback(async (deviceId?: string) => {
    // Stop existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    cbRefs.current.onPermissionRequested();
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
          : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      // Auto-select the device that was actually opened
      const track = stream.getVideoTracks()[0];
      if (track) {
        const settings = track.getSettings();
        if (settings.deviceId && !deviceId) {
          setSelectedDeviceId(settings.deviceId);
        }
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
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeviceChange = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
    startCamera(deviceId);
  }, [startCamera]);

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

  return (
    <div className="camera-capture">
      <DeviceSelector
        kind="videoinput"
        selectedDeviceId={selectedDeviceId}
        onSelect={handleDeviceChange}
      />
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
          <span className="face-guide-label">Position your face here</span>
        </div>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
      <div className="camera-controls">
        <button
          type="button"
          className="btn-capture"
          onClick={handleCapture}
          disabled={!isStreaming}
        >
          <span className="capture-ring" />
        </button>
      </div>
    </div>
  );
}
