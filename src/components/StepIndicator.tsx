interface StepIndicatorProps {
  steps: { key: string; label: string }[];
  currentStep: string;
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  const currentIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="step-indicator">
      {steps.map((step, i) => {
        const state =
          i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'upcoming';
        return (
          <div key={step.key} className={`step-item step-${state}`}>
            <div className="step-circle">
              {state === 'done' ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span>{i + 1}</span>
              )}
            </div>
            <span className="step-label">{step.label}</span>
            {i < steps.length - 1 && <div className="step-connector" />}
          </div>
        );
      })}
    </div>
  );
}
