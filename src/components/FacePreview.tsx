interface FacePreviewProps {
  imageData: string;
  onRecapture: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
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
          className="btn btn-secondary"
          onClick={onRecapture}
          disabled={isSubmitting}
        >
          Retake
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <span className="spinner" /> Submitting…
            </>
          ) : (
            'Use This Photo'
          )}
        </button>
      </div>
    </div>
  );
}
