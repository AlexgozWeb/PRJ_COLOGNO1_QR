"use client";

export default function DatePickerButton({
  value,
  max,
  ariaLabel,
  onPick,
}: {
  value: string;
  max?: string;
  ariaLabel: string;
  onPick: (itDate: string) => void;
}) {
  return (
    <span className="datePickerWrap" title={ariaLabel}>
      <input
        className="datePickerNative"
        type="date"
        aria-label={ariaLabel}
        value={value}
        max={max}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {}
        }}
        onChange={(e) => e.target.value && onPick(e.target.value.split("-").reverse().join("/"))}
      />
      <span className="datePickerIcon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </span>
    </span>
  );
}
