import { useEffect, useState } from 'react';
import { analyzeImageQuality } from '../services/imageQuality';
import type { QualityIssue } from '../services/imageQuality';

export type QualityPhase =
  | { phase: 'checking' }
  | { phase: 'done'; issues: QualityIssue[]; passed: boolean };

interface FacePreviewProps {
  imageData: string;
  onRecapture: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
  disableSubmit?: boolean;
  helperMessage?: string;
  /** When true the quality status + issues are NOT rendered inline. Use
   *  onQualityChange to render them elsewhere (e.g. the right panel). */
  hideQualityInline?: boolean;
  /** Fires whenever the quality analysis state changes. */
  onQualityChange?: (quality: QualityPhase) => void;
}

export function FacePreview({
  imageData,
  onRecapture,
  onSubmit,
  isSubmitting,
  submitLabel = 'Use This Photo',
  disableSubmit = false,
  helperMessage,
  hideQualityInline = false,
  onQualityChange,
}: FacePreviewProps) {
  const [quality, setQuality] = useState<QualityPhase>({ phase: 'checking' });
  const [allowOverride, setAllowOverride] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQuality({ phase: 'checking' });
    setAllowOverride(false);
    onQualityChange?.({ phase: 'checking' });

    analyzeImageQuality(imageData).then((result) => {
      if (!cancelled) {
        const next: QualityPhase = { phase: 'done', issues: result.issues, passed: result.passed };
        setQuality(next);
        onQualityChange?.(next);
      }
    });

    return () => {
      cancelled = true;
    };
  // onQualityChange is intentionally excluded — tracked via ref pattern in callers
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageData]);

  const hasErrors = quality.phase === 'done' && !quality.passed;
  const submitBlocked = disableSubmit || (hasErrors && !allowOverride);
  const blockingIssueCount =
    quality.phase === 'done'
      ? quality.issues.filter((issue) => issue.severity === 'error').length
      : 0;

  return (
    <div className="face-preview">
      <div className="preview-viewport">
        <img src={imageData} alt="Captured face" className="preview-image" />
        <span className="preview-badge">Preview</span>
      </div>

      {!hideQualityInline && (
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
                {quality.passed
                  ? quality.issues.length === 1
                    ? '1 warning detected'
                    : `${quality.issues.length} warnings detected`
                  : blockingIssueCount === 1
                    ? '1 blocking issue detected'
                    : `${blockingIssueCount} blocking issues detected`}
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
      )}

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
              <CheckIcon /> {submitLabel}
            </>
          )}
        </button>
      </div>

      {helperMessage && <p className="preview-helper-message">{helperMessage}</p>}

      {hasErrors && !allowOverride && !isSubmitting && !disableSubmit && (
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

/** Standalone component to render quality results in the right panel. */
export function QualityPanel({ quality }: { quality: QualityPhase }) {
  if (quality.phase === 'checking') {
    return (
      <div className="capture-panel-section">
        <span className="capture-panel-label">Quality Check</span>
        <span className="quality-checking" style={{ fontSize: '0.8rem' }}>
          <span className="spinner spinner-sm" />
          Analysing capture quality…
        </span>
      </div>
    );
  }

  const { issues, passed } = quality;
  const blockingCount = issues.filter((i) => i.severity === 'error').length;

  if (issues.length === 0) {
    return (
      <div className="capture-panel-section">
        <span className="capture-panel-label">Quality Check</span>
        <span className="quality-passed" style={{ fontSize: '0.8rem' }}>
          <QualityPassIcon />
          Quality check passed
        </span>
      </div>
    );
  }

  return (
    <div className="capture-panel-section">
      <span className="capture-panel-label">Quality Check</span>
      <div className="quality-issues">
        <span
          className={`quality-issues-header quality-header-${passed ? 'warn' : 'error'}`}
        >
          {passed ? <QualityWarnIcon /> : <QualityErrorIcon />}
          {passed
            ? issues.length === 1
              ? '1 warning detected'
              : `${issues.length} warnings detected`
            : blockingCount === 1
              ? '1 blocking issue detected'
              : `${blockingCount} blocking issues detected`}
        </span>
        <ul className="quality-issue-list">
          {issues.map((issue) => (
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
