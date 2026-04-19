import { useReducer, useCallback, useRef, useState } from 'react';
import {
  enrollmentReducer,
  initialEnrollmentState,
} from '../state/enrollmentReducer';
import { enrollFace } from '../services/enrollmentApi';
import { CameraCapture } from './CameraCapture';
import { FacePreview } from './FacePreview';
import { StatusBanner } from './StatusBanner';
import { StepIndicator } from './StepIndicator';
import { DeviceSelector } from './DeviceSelector';

const STEPS = [
  { key: 'face-capture', label: 'Face Capture' },
  { key: 'fingerprint', label: 'Fingerprint' },
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

  const handleCapture = useCallback((imageData: string) => {
    dispatch({ type: 'FACE_CAPTURED', imageData });
  }, []);

  const handleRecapture = useCallback(() => {
    cameraKeyRef.current += 1;
    dispatch({ type: 'FACE_RECAPTURE' });
  }, []);

  const doSubmit = useCallback(async (imageData: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    dispatch({ type: 'FACE_SUBMITTING' });
    try {
      await enrollFace({ userId, image: imageData });
      dispatch({ type: 'FACE_SUBMIT_SUCCESS' });
    } catch (err) {
      dispatch({
        type: 'FACE_SUBMIT_ERROR',
        error: err instanceof Error ? err.message : 'Submission failed',
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

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return (
    <div className="enrollment-flow">
      <StepIndicator steps={STEPS} currentStep={state.step} />

      {/* ── Face Capture Step ── */}
      {state.step === 'face-capture' && (
        <div className="step-content">
          <h2>Face Capture</h2>
          <p className="step-description">
            Position your face within the oval guide and ensure good lighting.
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

          {(state.faceCapture.status === 'idle' ||
            state.faceCapture.status === 'requesting-permission' ||
            state.faceCapture.status === 'streaming') && (
            <CameraCapture
              key={cameraKeyRef.current}
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
              />
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
            Select your fingerprint scanner and place your finger on the sensor.
          </p>
          <StatusBanner type="success" message="Face capture complete." />
          <FingerprintStep onDone={handleFingerprint} />
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
            onClick={handleReset}
          >
            Enroll Another User
          </button>
        </div>
      )}
    </div>
  );
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
