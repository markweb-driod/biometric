import { useReducer, useCallback, useRef, useState } from 'react';
import {
  enrollmentReducer,
  initialEnrollmentState,
} from '../state/enrollmentReducer';
import { enrollFace, isEnrollmentApiError } from '../services/enrollmentApi';
import { CameraCapture } from './CameraCapture';
import { FacePreview } from './FacePreview';
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
      const fallbackMessage = err instanceof Error ? err.message : 'Submission failed';
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
        <div className="step-content">
          <h2>Face Capture</h2>
          <p className="step-description">
            Position the subject's face within the oval guide and ensure good lighting before capturing.
          </p>

          {state.faceCapture.status === 'requesting-permission' && (
            <StatusBanner type="info" message="Requesting camera access…" />
          )}

          {state.faceCapture.status === 'permission-denied' && (
            <StatusBanner
              type="error"
              message={state.faceCapture.error}
              onRetry={handleRecapture}
            />
          )}

          {/* Phase 1: camera device selection (before stream starts) */}
          {state.faceCapture.status === 'idle' && !cameraSetup.ready && (
            <CameraSetupCard
              deviceId={cameraSetup.deviceId}
              onDeviceSelect={(id) => setCameraSetup((prev) => ({ ...prev, deviceId: id }))}
              onStart={() => setCameraSetup((prev) => ({ ...prev, ready: true }))}
            />
          )}

          {/* Phase 2: active camera — mounts only after device is confirmed */}
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
            />
          )}

          {state.faceCapture.status === 'error' && (
            <>
              <StatusBanner
                type="error"
                message={state.faceCapture.error}
              />
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
              />
              {!state.faceCapture.shouldRecapture && state.faceCapture.retryable && (
                <button
                  type="button"
                  className="btn btn-secondary btn-full"
                  onClick={handleRetrySubmit}
                >
                  Retry Submission
                </button>
              )}
            </>
          )}

          {state.faceCapture.status === 'success' && (
            <>
              <StatusBanner type="success" message="Face captured successfully!" />
              <button
                type="button"
                className="btn btn-primary btn-full"
                onClick={() => dispatch({ type: 'FACE_ADVANCE' })}
              >
                Continue to Fingerprint
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Face Capture Cancel ── */}
      {state.step === 'face-capture' && (
        <button
          type="button"
          className="btn btn-ghost cancel-link"
          onClick={onCancel}
        >
          Cancel Enrollment
        </button>
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
            Biometric enrollment for user <strong>{state.userId}</strong> has been
            completed successfully.
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
      return 'Have the subject blink or move slightly while streaming, then recapture.';
    case 'capture_quality_rejected':
      return 'Improve lighting and keep the full face inside the oval before recapturing.';
    case 'network_error':
      return 'Network issue detected. You can retry submission with the same capture.';
    case 'server_error':
      return 'Temporary server issue. Retry now or recapture if repeated failures continue.';
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
