interface FacePreviewProps {
  imageData: string;
  onRecapture: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
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

export function FacePreview({
  imageData,
  onRecapture,
  onSubmit,
  isSubmitting,
}: FacePreviewProps) {
  return (
    <div className="face-preview">
      <div className="preview-viewport">
        <img src={imageData} alt="Captured face" className="preview-image" />
        <span className="preview-badge">Preview</span>
      </div>
      <p className="preview-hint">Does this photo look clear and well-lit?</p>
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
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <span className="spinner" /> Submitting…
            </>
          ) : (
            <>
              <CheckIcon />
              Use This Photo
            </>
          )}
        </button>
      </div>
    </div>
  );
}
