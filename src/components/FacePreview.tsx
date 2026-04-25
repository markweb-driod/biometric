import { useEffect, useState } from 'react';
import { analyzeImageQuality } from '../services/imageQuality';
import type { QualityIssue } from '../services/imageQuality';

interface FacePreviewProps {
  imageData: string;
  onRecapture: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

type QualityPhase =
  | { phase: 'checking' }
  | { phase: 'done'; issues: QualityIssue[]; passed: boolean };

export function FacePreview({
  imageData,
  onRecapture,
  onSubmit,
  isSubmitting,
}: FacePreviewProps) {
  const [quality, setQuality] = useState<QualityPhase>({ phase: 'checking' });
  const [allowOverride, setAllowOverride] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQuality({ phase: 'checking' });
    setAllowOverride(false);

    analyzeImageQuality(imageData).then((result) => {
      if (!cancelled) {
        setQuality({ phase: 'done', issues: result.issues, passed: result.passed });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imageData]);

  const hasErrors = quality.phase === 'done' && !quality.passed;
  const submitBlocked = hasErrors && !allowOverride;

  return (
    <div className="face-preview">
      <div className="preview-viewport">
        <img src={imageData} alt="Captured face" className="preview-image" />
        <span className="preview-badge">Preview</span>
      </div>

      <div className="quality-status" aria-live="polite">
        {quality.phase === 'checking' && (
          <span className="quality-checking">
            <span className="spinner spinner-sm" />
            Checking quality...
          </span>
        )}

        {quality.phase === 'done' && quality.issues.length === 0 && (
          <span className="quality-passed">
            <QualityPassIcon />
            Quality check passed
          </span>
        )}

        {quality.phase === 'done' && quality.issues.length > 0 && (
          <div className="quality-issues">
            <span
              className={`quality-issues-header quality-header-${
                quality.passed ? 'warn' : 'error'
              }`}
            >
              {quality.passed ? <QualityWarnIcon /> : <QualityErrorIcon />}
              {quality.issues.length === 1
                ? '1 issue detected'
                : `${quality.issues.length} issues detected`}
            </span>
            <ul className="quality-issue-list">
              {quality.issues.map((issue) => (
                <li
                  key={`${issue.code}-${issue.severity}`}
                  className={`quality-issue quality-issue-${issue.severity}`}
                >
                  <span className="quality-issue-label">{issue.label}</span>
                  <span className="quality-issue-suggestion">{issue.suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="preview-actions">
        <button
          type="button"
          className="btn btn-3d btn-3d-secondary"
          onClick={onRecapture}
          disabled={isSubmitting}
        >
          <RetakeIcon />
          Retake
        </button>

        <button
          type="button"
          className="btn btn-3d btn-3d-primary"
          onClick={onSubmit}
          disabled={isSubmitting || submitBlocked}
        >
          {isSubmitting ? (
            <>
              <span className="spinner" /> Submitting...
            </>
          ) : (
            <>
              <CheckIcon /> Use This Photo
            </>
          )}
        </button>
      </div>

      {hasErrors && !allowOverride && !isSubmitting && (
        <button
          type="button"
          className="btn btn-ghost quality-override-btn"
          onClick={() => setAllowOverride(true)}
        >
          Override and submit
        </button>
      )}
    </div>
  );
}

function RetakeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4v6h6" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function QualityPassIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 10l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QualityWarnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <path d="M10 2L1 18h18L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 8v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="14.5" r="0.8" fill="currentColor" />
    </svg>
  );
}

function QualityErrorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
