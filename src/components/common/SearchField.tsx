// src/components/common/SearchField.tsx

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Accessible name. Defaults to the placeholder, which reads well for the
   *  list searches this serves ("Search pads by name"). */
  label?: string;
}

/** The icon and input share one bordered field so the pair reads as a single
 *  control. Used by all four list views. */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: SearchFieldProps) {
  return (
    <div className="search-field">
      <svg
        className="search-field-icon"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="text"
        className="search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
      />
    </div>
  );
}
