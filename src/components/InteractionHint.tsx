export function InteractionHint({ steps, activeStep, note }: { steps: string[]; activeStep: number; note?: string }) {
  return (
    <div className="interaction-hint">
      <ol aria-label="操作步骤">{steps.map((step, index) => <li key={step} className={index === activeStep ? 'is-current' : index < activeStep ? 'is-done' : ''} aria-current={index === activeStep ? 'step' : undefined}><span className="interaction-step-number" aria-hidden="true">{index < activeStep ? '✓' : index + 1}</span>{step}</li>)}</ol>
      {note && <p>{note}</p>}
    </div>
  )
}
