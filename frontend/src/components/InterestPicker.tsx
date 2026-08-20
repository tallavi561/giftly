// Fixed Master Tag List (backend/src/types/index.ts MASTER_TAG_LIST) — the
// recommendation engine and deal matching only ever compare against these
// English codes, so interests must be picked from this list, not typed
// freely (a free TagInput here silently breaks all tag-overlap matching).
const OPTIONS = [
  { value: 'sports', label: 'ספורט' },
  { value: 'music', label: 'מוזיקה' },
  { value: 'performances', label: 'הופעות' },
  { value: 'art', label: 'אמנות' },
  { value: 'culinary', label: 'בישול ואוכל' },
  { value: 'travel', label: 'טיולים' },
  { value: 'extreme', label: 'ספורט אתגרי' },
  { value: 'workshops', label: 'סדנאות' },
  { value: 'tech', label: 'טכנולוגיה' },
  { value: 'books', label: 'ספרים' },
  { value: 'gaming', label: 'גיימינג' },
];

export const INTEREST_LABELS: Record<string, string> = Object.fromEntries(
  OPTIONS.map(o => [o.value, o.label])
);

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
}

export default function InterestPicker({ value, onChange }: Props) {
  function toggle(tag: string) {
    onChange(value.includes(tag) ? value.filter(t => t !== tag) : [...value, tag]);
  }

  return (
    <div className="gender-pills">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          className={`gender-pill${value.includes(opt.value) ? ' selected' : ''}`}
          onClick={() => toggle(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
