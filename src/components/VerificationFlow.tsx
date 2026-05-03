import { useCallback, useRef, useState } from 'react';
import {
  verifyFace,
  isVerificationApiError,
  VerificationResult,
} from '../services/verificationApi';
import { fetchStudentDetails } from '../services/studentApi';
import { CameraCapture } from './CameraCapture';
import { FacePreview, QualityPanel } from './FacePreview';
import type { QualityPhase } from './FacePreview';
import { StatusBanner } from './StatusBanner';

type FlowStep = 'capture' | 'submitting' | 'result';
type CameraStatus = 'idle' | 'requesting-permission' | 'streaming' | 'captured' | 'permission-denied';
type MatricStatus = 'idle' | 'loading' | 'found' | 'error';

interface VerificationFlowProps {
  onCancel: () => void;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const color = pct >= 80 ? 'var(--accent)' : pct >= 60 ? '#f59e0b' : 'var(--red-700)';
  return (
    <div className="vf-confidence-bar-wrap">
      <div className="vf-confidence-bar-track">
        <div className="vf-confidence-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="vf-confidence-pct" style={{ color }}>{pct}%</span>
    </div>
  );
}

export function VerificationFlow({ onCancel }: VerificationFlowProps) {
  const [step, setStep] = useState<FlowStep>('capture');
  const [identifier, setIdentifier] = useState('');
  const [matricStatus, setMatricStatus] = useState<MatricStatus>('idle');
  const [studentName, setStudentName] = useState<string | null>(null);
  const [matricError, setMatricError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraDevice] = useState<{ deviceId: string; ready: boolean }>({ deviceId: '', ready: true });
  const [livenessCount, setLivenessCount] = useState(0);
  const [hasMotionEvidence, setHasMotionEvidence] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [qualityState, setQualityState] = useState<QualityPhase>({ phase: 'checking' });

  const livenessFramesRef = useRef<string[]>([]);
  const cameraKeyRef = useRef(0);
  const submittingRef = useRef(false);

  const livenessReady = livenessCount >= 3 && hasMotionEvidence;

  const handleMatricLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = identifier.trim();
    if (!id || id.length < 3) {
      setMatricError('Enter a valid matric number (at least 3 characters).');
      return;
    }
    setMatricError(null);
    setStudentName(null);
    setMatricStatus('loading');
    try {
      const student = await fetchStudentDetails(id);
      setStudentName(student.fullName);
      setMatricStatus('found');
    } catch (err) {
      setMatricError(err instanceof Error ? err.message : 'Student not found.');
      setMatricStatus('error');
    }
  };

  const handleCapture = useCallback((imageData: string, livenessFrames: string[]) => {
    livenessFramesRef.current = livenessFrames;
    setCapturedImage(imageData);
    setCameraStatus('captured');
  }, []);

  const handleRecapture = useCallback(() => {
    cameraKeyRef.current += 1;
    livenessFramesRef.current = [];
    setCapturedImage(null);
    setCameraStatus('idle');
    setSubmitError(null);
  }, []);

  const doSubmit = useCallback(async (imageData: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setStep('submitting');
    setSubmitError(null);
    try {
      const res = await verifyFace({
        identifier: identifier.trim(),
        image: imageData,
        livenessFrames: livenessFramesRef.current,
      });
      setResult(res);
      setStep('result');
    } catch (err) {
      const msg = isVerificationApiError(err)
        ? err.message
        : err instanceof Error
        ? err.message
        : 'Verification failed. Please try again.';
      setSubmitError(msg);
      setCameraStatus('captured');
      setStep('capture');
    } finally {
      submittingRef.current = false;
    }
  }, [identifier]);

  const handleSubmit = useCallback(() => {
    if (!capturedImage) return;
    doSubmit(capturedImage);
  }, [capturedImage, doSubmit]);

  const handleNewVerification = () => {
    setStep('capture');
    setIdentifier('');
    setMatricStatus('idle');
    setStudentName(null);
    setMatricError(null);
    setCapturedImage(null);
    setCameraStatus('idle');
    livenessFramesRef.current = [];
    setLivenessCount(0);
    setHasMotionEvidence(false);
    setSubmitError(null);
    setResult(null);
    setCameraError(null);
    cameraKeyRef.current += 1;
    submittingRef.current = false;
  };

  // ── Capture / Submitting ─────────────────────────────────────────
  if (step === 'capture' || step === 'submitting') {
    const isSubmitting = step === 'submitting';

    return (
      <div className="capture-layout">
        {/* Left: Camera */}
        <div className="capture-layout-camera">
          {cameraStatus === 'permission-denied' && (
            <div className="capture-camera-placeholder capture-camera-error">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
              <p>{cameraError ?? 'Camera access denied. Check browser permissions.'}</p>
              <button type="button" className="btn btn-primary" onClick={handleRecapture}>
                Retry Camera
              </button>
            </div>
          )}

          {(cameraStatus === 'idle' ||
            cameraStatus === 'requesting-permission' ||
            cameraStatus === 'streaming') && (
            <CameraCapture
              key={cameraKeyRef.current}
              initialDeviceId={cameraDevice.deviceId}
              onCapture={handleCapture}
              onPermissionDenied={(err) => {
                setCameraError(err);
                setCameraStatus('permission-denied');
              }}
              onStreaming={() => setCameraStatus('streaming')}
              onPermissionRequested={() => setCameraStatus('requesting-permission')}
              onLivenessUpdate={(count, hasMotion) => {
                setLivenessCount(count);
                setHasMotionEvidence(hasMotion);
              }}
              isStreaming={cameraStatus === 'streaming'}
            />
          )}

          {(cameraStatus === 'captured' || isSubmitting) && capturedImage && (
            <FacePreview
              imageData={capturedImage}
              onRecapture={handleRecapture}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              disableSubmit={matricStatus !== 'found'}
              submitLabel="Verify Identity"
              hideQualityInline
              onQualityChange={setQualityState}
            />
          )}
        </div>

        {/* Right: Panel */}
        <div className="capture-layout-panel">
          <div className="capture-panel-header">
            <h2>Identity Verification</h2>
            <p>Enter the student's matric number and capture their face.</p>
          </div>

          {submitError && <StatusBanner type="error" message={submitError} />}

          {/* Matric input */}
          <div className="capture-panel-section">
            <span className="capture-panel-label">Matric Number</span>
            <form
              onSubmit={handleMatricLookup}
              style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}
            >
              <input
                type="text"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (matricStatus !== 'idle') {
                    setMatricStatus('idle');
                    setStudentName(null);
                    setMatricError(null);
                  }
                }}
                placeholder="e.g. NSU/2024/CS/0142"
                className="form-input"
                style={{ flex: 1, fontSize: '0.9rem' }}
                disabled={isSubmitting}
                autoFocus
              />
              <button
                type="submit"
                className="btn btn-primary"
                style={{ whiteSpace: 'nowrap', fontSize: '0.85rem', padding: '0 0.9rem' }}
                disabled={isSubmitting || matricStatus === 'loading'}
              >
                {matricStatus === 'loading' ? '…' : 'Look Up'}
              </button>
            </form>

            {matricStatus === 'found' && studentName && (
              <div className="vf-student-inline-card">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: 'var(--accent)', flexShrink: 0 }}
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <div>
                  <span className="vf-student-inline-name">{studentName}</span>
                  <span className="vf-student-inline-id">{identifier.toUpperCase()}</span>
                </div>
              </div>
            )}

            {matricError && (
              <p style={{ fontSize: '0.8rem', color: 'var(--red-700)', marginTop: '0.4rem' }}>
                {matricError}
              </p>
            )}

            {matricStatus === 'found' && cameraStatus !== 'captured' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                Student found. Proceed with the face capture on the left.
              </p>
            )}
            {matricStatus === 'idle' && !matricError && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                Enter the matric number and click Look Up to confirm the student.
              </p>
            )}
          </div>

          {/* Liveness guidance */}
          {cameraStatus === 'streaming' && (
            <div className="capture-panel-section">
              <span className="capture-panel-label">Liveness Check</span>
              <div className="capture-panel-steps" style={{ marginTop: '0.4rem' }}>
                {[
                  'Center face in the oval',
                  'Ask for one natural blink',
                  'Ask for a slight head turn',
                ].map((s, i) => {
                  const idx = Math.min(2, hasMotionEvidence ? 2 : livenessCount);
                  const done = i < idx || (i === 2 && livenessReady);
                  const cur = !done && i === idx;
                  return (
                    <div
                      key={s}
                      className={`capture-step-item${done ? ' is-done' : ''}${cur ? ' is-active' : ''}`}
                    >
                      <span className="capture-step-num">{done ? '✓' : i + 1}</span>
                      <span>{s}</span>
                    </div>
                  );
                })}
              </div>
              <div className={`capture-readiness${livenessReady ? ' is-ready' : ''}`}>
                {livenessReady ? '● Ready to capture' : '○ Awaiting liveness proof…'}
              </div>
            </div>
          )}

          {/* Submitting progress */}
          {isSubmitting && (
            <div className="vf-submitting-banner">
              <span className="spinner" style={{ width: '1.1rem', height: '1.1rem', borderWidth: '2px', flexShrink: 0 }} />
              <div>
                <span className="vf-submitting-title">Verifying identity…</span>
                <span className="vf-submitting-sub">Comparing face against stored biometric</span>
              </div>
            </div>
          )}

          {/* Submitting progress */}
          {isSubmitting && (
            <div className="vf-submitting-banner">
              <span className="spinner" style={{ width: '1.1rem', height: '1.1rem', borderWidth: '2px', flexShrink: 0 }} />
              <div>
                <span className="vf-submitting-title">Verifying identity…</span>
                <span className="vf-submitting-sub">Comparing face against stored biometric</span>
              </div>
            </div>
          )}

          {/* Quality panel after capture (hide while submitting to avoid visual clutter) */}
          {cameraStatus === 'captured' && !isSubmitting && (
            <QualityPanel quality={qualityState} />
          )}

          {!isSubmitting && (
            <button
              type="button"
              className="btn btn-ghost cancel-link"
              style={{ marginTop: 'auto' }}
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Result ──────────────────────────────────────────────────────
  if (step === 'result' && result) {
    const matched = result.matched;
    const pct = Math.round(Math.min(1, Math.max(0, result.confidence)) * 100);

    return (
      <div className="step-content vf-result">
        <div className={`vf-result-icon ${matched ? 'vf-result-icon--match' : 'vf-result-icon--fail'}`}>
          {matched ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          )}
        </div>

        <h2
          className={`vf-result-title ${matched ? 'vf-result-title--match' : 'vf-result-title--fail'}`}
        >
          {matched ? 'Identity Confirmed' : 'Identity Not Confirmed'}
        </h2>
        <p className="step-description">{result.message}</p>

        <div className="vf-result-card">
          {identifier && (
            <div className="vf-result-row">
              <span className="vf-result-label">Matric No.</span>
              <span className="vf-result-value vf-result-mono">{identifier.toUpperCase()}</span>
            </div>
          )}
          {result.full_name && (
            <div className="vf-result-row">
              <span className="vf-result-label">Name on Record</span>
              <span className="vf-result-value" style={{ fontWeight: 600 }}>
                {result.full_name}
              </span>
            </div>
          )}
          <div className="vf-result-row">
            <span className="vf-result-label">Confidence</span>
            <span className="vf-result-value" style={{ flex: 1 }}>
              <ConfidenceBar value={result.confidence} />
            </span>
          </div>
          <div className="vf-result-row">
            <span className="vf-result-label">Liveness</span>
            <span
              className={`vf-result-value vf-liveness-badge ${
                result.liveness_passed ? 'vf-liveness-badge--pass' : 'vf-liveness-badge--fail'
              }`}
            >
              {result.liveness_passed ? 'Passed' : 'Failed'}
            </span>
          </div>
          <div className="vf-result-row">
            <span className="vf-result-label">Decision</span>
            <span
              className={`vf-result-value ${matched ? 'vf-decision--match' : 'vf-decision--fail'}`}
            >
              {matched ? `Match (${pct}%)` : `No Match (${pct}%)`}
            </span>
          </div>
        </div>

        <div className="validation-actions" style={{ marginTop: '1.5rem' }}>
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={handleNewVerification}
          >
            Verify Another Student
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-full cancel-link"
            onClick={onCancel}
          >
            Back to Registration
          </button>
        </div>
      </div>
    );
  }

  return null;
}
