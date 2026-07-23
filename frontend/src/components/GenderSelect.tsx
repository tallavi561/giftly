const OPTIONS = [
  { value: 'male',   label: 'גבר' },
  { value: 'female', label: 'אישה' },
  { value: 'other',  label: 'אחר' },
];

interface Props {
  value: string;
  onChange: (val: string) => void;
  required?: boolean;
}

export default function GenderSelect({ value, onChange }: Props) {
  return (
    <div className="gender-pills">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          className={`gender-pill${value === opt.value ? ' selected' : ''}`}
          onClick={() => onChange(value === opt.value ? '' : opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
