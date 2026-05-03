import { useReducer, useCallback, useRef, useState } from 'react';
import {
  enrollmentReducer,
  initialEnrollmentState,
} from '../state/enrollmentReducer';
import { enrollFace, isEnrollmentApiError } from '../services/enrollmentApi';
import { CameraCapture } from './CameraCapture';
import { FacePreview, QualityPanel } from './FacePreview';
import type { QualityPhase } from './FacePreview';
import { StatusBanner } from './StatusBanner';
import { StepIndicator } from './StepIndicator';
import { DeviceSelector } from './DeviceSelector';

const STEPS = [
  { key: 'face-capture', label: 'Face Capture' },
  { key: 'fingerprint', label: 'Fingerprint' },
  { key: 'review', label: 'Review' },
  { key: 'complete', label: 'Complete' },
];

interface EnrollmentFlowProps {
  userId: string;
  onCancel: () => void;
}

export function EnrollmentFlow({ userId, onCancel }: EnrollmentFlowProps) {
  const [state, dispatch] = useReducer(
    enrollmentReducer,
    userId,
    initialEnrollmentState
  );

  // Incrementing key forces CameraCapture remount on recapture
  const cameraKeyRef = useRef(0);
  // Guard against double-submit from rapid clicks
  const submittingRef = useRef(false);
  // Background frames collected by CameraCapture for liveness check
  const livenessFramesRef = useRef<string[]>([]);
  // Camera device selection — must be confirmed before CameraCapture mounts
  const [cameraSetup, setCameraSetup] = useState<{ deviceId: string; ready: boolean }>({
    deviceId: '',
    ready: false,
  });
  // Liveness tracking — mirrored from CameraCapture for the side panel
  const [hasMotionEvidence, setHasMotionEvidence] = useState(false);
  const [faceInFrame, setFaceInFrame] = useState(false);
  const [livenessReady, setLivenessReady] = useState(false);
  // Quality state — mirrored from FacePreview for the right panel
  const [qualityState, setQualityState] = useState<QualityPhase>({ phase: 'checking' });

  const handleCapture = useCallback((imageData: string, livenessFrames: string[]) => {
    livenessFramesRef.current = livenessFrames;
    dispatch({ type: 'FACE_CAPTURED', imageData });
  }, []);

  const handleRecapture = useCallback(() => {
    cameraKeyRef.current += 1;
    livenessFramesRef.current = [];
    setCameraSetup((prev) => ({ ...prev, ready: false }));
    dispatch({ type: 'FACE_RECAPTURE' });
  }, []);

  const doSubmit = useCallback(async (imageData: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    dispatch({ type: 'FACE_SUBMITTING' });
    try {
      await enrollFace({ userId, image: imageData, livenessFrames: livenessFramesRef.current });
      dispatch({ type: 'FACE_SUBMIT_SUCCESS' });
    } catch (err) {
      const fallbackMessage = err instanceof Error ? err.message : 'Face enrollment could not be completed. Please try again or recapture the photo.';
      const apiError = isEnrollmentApiError(err) ? err : null;
      dispatch({
        type: 'FACE_SUBMIT_ERROR',
        error: apiError?.message ?? fallbackMessage,
        backendCode: apiError?.code,
        retryable: apiError?.retryable,
        shouldRecapture: apiError?.shouldRecapture,
      });
    } finally {
      submittingRef.current = false;
    }
  }, [userId]);

  // Reset the submit guard whenever the capture state goes back to 'error'
  // so that a retry is never silently blocked by a stale ref.
  const prevStatusRef = useRef<string>('');
  if (state.faceCapture.status !== prevStatusRef.current) {
    prevStatusRef.current = state.faceCapture.status;
    if (state.faceCapture.status === 'error') {
      submittingRef.current = false;
    }
  }

  const handleSubmit = useCallback(() => {
    if (state.faceCapture.status !== 'captured') return;
    doSubmit(state.faceCapture.imageData);
  }, [state.faceCapture, doSubmit]);

  const handleRetrySubmit = useCallback(() => {
    if (state.faceCapture.status !== 'error') return;
    doSubmit(state.faceCapture.imageData);
  }, [state.faceCapture, doSubmit]);

  const handleFingerprint = useCallback(() => {
    dispatch({ type: 'FINGERPRINT_DONE' });
  }, []);

  const errorHint =
    state.faceCapture.status === 'error'
      ? getCaptureErrorHint(state.faceCapture.backendCode)
      : undefined;

  return (
    <div className="enrollment-flow">
      <StepIndicator steps={STEPS} currentStep={state.step} />

      {/* ── Face Capture Step ── */}
      {state.step === 'face-capture' && (
        <div className="capture-layout">
          {/* Left: Camera Area */}
          <div className="capture-layout-camera">
            {state.faceCapture.status === 'permission-denied' && (
              <div className="capture-camera-placeholder capture-camera-error">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
                <p>{state.faceCapture.error}</p>
                <button type="button" className="btn btn-primary" onClick={handleRecapture}>Retry Camera</button>
              </div>
            )}

            {state.faceCapture.status === 'idle' && !cameraSetup.ready && (
              <div className="capture-camera-placeholder">
                <div className="capture-placeholder-icon">
                  <CameraSetupIcon />
                </div>
                <p className="capture-placeholder-title">Camera Offline</p>
                <p className="capture-placeholder-hint">Select a device and start the camera to begin.</p>
              </div>
            )}

            {((state.faceCapture.status === 'idle' && cameraSetup.ready) ||
              state.faceCapture.status === 'requesting-permission' ||
              state.faceCapture.status === 'streaming') && (
              <CameraCapture
                key={cameraKeyRef.current}
                initialDeviceId={cameraSetup.deviceId}
                onCapture={handleCapture}
                onPermissionDenied={(error) =>
                  dispatch({ type: 'CAMERA_PERMISSION_DENIED', error })
                }
                onStreaming={() => dispatch({ type: 'CAMERA_STREAMING' })}
                onPermissionRequested={() =>
                  dispatch({ type: 'CAMERA_PERMISSION_REQUESTED' })
                }
                onLivenessUpdate={(_count, hasMotion, face, ready) => {
                  setHasMotionEvidence(hasMotion);
                  setFaceInFrame(face);
                  setLivenessReady(ready);
                }}
                isStreaming={state.faceCapture.status === 'streaming'}
              />
            )}

            {(state.faceCapture.status === 'captured' ||
              state.faceCapture.status === 'submitting') && (
              <FacePreview
                imageData={state.faceCapture.imageData}
                onRecapture={handleRecapture}
                onSubmit={handleSubmit}
                isSubmitting={state.faceCapture.status === 'submitting'}
                hideQualityInline
                onQualityChange={setQualityState}
              />
            )}

            {state.faceCapture.status === 'error' && (
              <FacePreview
                imageData={state.faceCapture.imageData}
                onRecapture={handleRecapture}
                onSubmit={handleRetrySubmit}
                isSubmitting={false}
                submitLabel="Retry Submission"
                disableSubmit={state.faceCapture.shouldRecapture}
                helperMessage={
                  state.faceCapture.shouldRecapture
                    ? 'This capture must be retaken before retrying submission.'
                    : errorHint
                }
                hideQualityInline
                onQualityChange={setQualityState}
              />
            )}

            {state.faceCapture.status === 'success' && (
              <div className="capture-camera-placeholder capture-camera-success">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
                <p className="capture-placeholder-title">Face Enrolled Successfully</p>
              </div>
            )}
          </div>

          {/* Right: Controls & Info Panel */}
          <div className="capture-layout-panel">
            <div className="capture-panel-header">
              <h2>Face Capture</h2>
              <p>Enrolling <strong>{userId}</strong></p>
            </div>

            {state.faceCapture.status === 'error' && (
              <StatusBanner type="error" message={state.faceCapture.error} />
            )}

            {/* Device selector — before camera starts */}
            {state.faceCapture.status === 'idle' && !cameraSetup.ready && (
              <div className="capture-panel-section">
                <span className="capture-panel-label">Camera Device</span>
                <DeviceSelector
                  kind="videoinput"
                  selectedDeviceId={cameraSetup.deviceId}
                  onSelect={(id) => setCameraSetup((prev) => ({ ...prev, deviceId: id }))}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-full"
                  onClick={() => setCameraSetup((prev) => ({ ...prev, ready: true }))}
                  style={{ marginTop: '0.75rem' }}
                >
                  Start Camera
                </button>
              </div>
            )}

            {/* Liveness guidance — while camera is streaming */}
            {state.faceCapture.status === 'streaming' && (
              <div className="capture-panel-section">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.5rem' }}>
                  <span className="capture-panel-label">Active Liveness</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 650, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                    Confirm the subject is physically present before capture
                  </span>
                </div>
                <div className="capture-panel-steps">
                  {['Center face in the oval', 'Ask for one natural blink', 'Ask for a slight head turn'].map((step, index) => {
                    const stepDone = [
                      faceInFrame,
                      hasMotionEvidence,
                      livenessReady,
                    ];
                    const currentIndex = stepDone.findIndex((done) => !done);
                    const activeIndex = currentIndex === -1 ? 2 : currentIndex;
                    const isComplete = stepDone[index];
                    const isCurrent = !isComplete && index === activeIndex;
                    return (
                      <div key={step} className={`capture-step-item${isComplete ? ' is-done' : ''}${isCurrent ? ' is-active' : ''}`}>
                        <span className="capture-step-num">{isComplete ? '✓' : index + 1}</span>
                        <span>{step}</span>
                      </div>
                    );
                  })}
                </div>
                <div className={`capture-readiness${livenessReady ? ' is-ready' : ''}`}>
                  {livenessReady
                    ? '● Ready to capture'
                    : !faceInFrame
                      ? '○ Face not detected — center the subject in the oval'
                      : '○ Awaiting motion proof…'}
                </div>
              </div>
            )}

            {/* Tips */}
            {(state.faceCapture.status === 'idle' || state.faceCapture.status === 'streaming') && (
              <div className="capture-panel-section capture-panel-tips">
                <span className="capture-panel-label">Tips</span>
                <ul>
                  <li>Ensure adequate, even lighting on the face</li>
                  <li>No sunglasses, hats, or face coverings</li>
                  <li>Capture button unlocks after liveness check</li>
                </ul>
              </div>
            )}

            {state.faceCapture.status === 'requesting-permission' && (
              <div className="capture-panel-section">
                <span className="capture-panel-label">Camera Access</span>
                <div className="capture-readiness">
                  ○ Waiting for camera permission in your browser...
                </div>
              </div>
            )}

            {/* Quality results — shown after capture */}
            {(state.faceCapture.status === 'captured' ||
              state.faceCapture.status === 'submitting' ||
              state.faceCapture.status === 'error') && (
              <QualityPanel quality={qualityState} />
            )}

            {/* Success action */}
            {state.faceCapture.status === 'success' && (
              <div className="capture-panel-section">
                <StatusBanner type="success" message="Face captured and enrolled!" />
                <button
                  type="button"
                  className="btn btn-primary btn-full"
                  onClick={() => dispatch({ type: 'FACE_ADVANCE' })}
                >
                  Continue to Fingerprint →
                </button>
              </div>
            )}

            <button type="button" className="btn btn-ghost cancel-link" onClick={onCancel}>
              Cancel Enrollment
            </button>
          </div>
        </div>
      )}

      {/* ── Fingerprint Step (placeholder) ── */}
      {state.step === 'fingerprint' && (
        <div className="step-content">
          <h2>Fingerprint Capture</h2>
          <p className="step-description">
            Select the fingerprint scanner and place the subject's finger on the sensor.
          </p>
          <StatusBanner type="success" message="Face capture complete." />
          <FingerprintStep onDone={handleFingerprint} />
        </div>
      )}

      {/* ── Review Step ── */}
      {state.step === 'review' && (
        <div className="step-content">
          <h2>Review &amp; Confirm</h2>
          <p className="step-description">
            Verify all captured biometric data before finalising enrollment for{' '}
            <strong>{state.userId}</strong>.
          </p>

          <div className="review-grid">
            <div className="review-bio-item">
              <span className="review-bio-label">Face Capture</span>
              {state.capturedFaceImageData ? (
                <div className="review-face-thumb">
                  <img src={state.capturedFaceImageData} alt="Captured face" />
                </div>
              ) : (
                <div className="review-fp-thumb"><ReviewFaceIcon /></div>
              )}
              <span className="review-status-badge review-status-ok">✓ Captured &amp; Enrolled</span>
            </div>

            <div className="review-bio-item">
              <span className="review-bio-label">Fingerprint</span>
              <div className="review-fp-thumb"><ReviewFingerprintIcon /></div>
              <span className="review-status-badge review-status-ok">✓ Scan Complete</span>
            </div>
          </div>

          <div className="review-id-row">
            <span className="review-id-label">Subject ID</span>
            <span className="review-id-value">{state.userId}</span>
          </div>

          <div className="review-actions">
            <button
              type="button"
              className="btn btn-primary btn-full"
              onClick={() => dispatch({ type: 'REVIEW_CONFIRMED' })}
            >
              Confirm Enrollment
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-full cancel-link"
              onClick={onCancel}
            >
              Cancel &amp; Start Over
            </button>
          </div>
        </div>
      )}

      {/* ── Enrollment Complete ── */}
      {state.step === 'complete' && (
        <div className="step-content step-complete">
          <div className="complete-graphic">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h2>Enrollment Complete</h2>
          <p className="step-description">
            ✓ Biometric enrollment for <strong>{state.userId}</strong> has been successfully saved to the system. The student can now use their face for identity verification.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            Enroll Another User
          </button>
        </div>
      )}
    </div>
  );
}

function getCaptureErrorHint(code?: string): string | undefined {
  switch (code) {
    case 'liveness_failed':
      return 'Liveness check failed — retake the capture. Ensure the subject blinks naturally once and turns their head slightly before the capture is ready.';
    case 'capture_quality_rejected':
      return 'Face image quality is insufficient. Ensure good lighting, clear view of the face, and position the subject so their full face fits inside the oval.';
    case 'network_error':
      return 'Network error detected. You can retry with the same capture. If the problem persists, please try recapturing.';
    case 'server_error':
      return 'Server error occurred. Retry submission now. If the issue persists, recapture the photo and try again.';
    default:
      return undefined;
  }
}

function FingerprintStep({ onDone }: { onDone: () => void }) {
  const [deviceId, setDeviceId] = useState('');

  return (
    <>
      <DeviceSelector
        kind="audioinput"
        selectedDeviceId={deviceId}
        onSelect={setDeviceId}
      />
      <StatusBanner type="info" message="Fingerprint hardware integration pending — this step is simulated." />
      <div className="fingerprint-placeholder">
        <div className="fingerprint-graphic">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
            <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
            <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
            <path d="M2 12a10 10 0 0 1 18-6" />
            <path d="M2 16h.01" />
            <path d="M21.8 16c.2-2 .131-5.354 0-6" />
            <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
            <path d="M8.65 22c.21-.66.45-1.32.57-2" />
            <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
          </svg>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onDone}
        >
          Simulate Fingerprint Scan
        </button>
      </div>
    </>
  );
}



function CameraSetupIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function ReviewFaceIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function ReviewFingerprintIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
      <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
      <path d="M2 12a10 10 0 0 1 18-6" />
      <path d="M2 16h.01" />
      <path d="M21.8 16c.2-2 .131-5.354 0-6" />
      <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
      <path d="M8.65 22c.21-.66.45-1.32.57-2" />
      <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
    </svg>
  );
}
