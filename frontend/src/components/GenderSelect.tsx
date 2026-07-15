interface Props {
  value: string;
  onChange: (val: string) => void;
  required?: boolean;
}

export default function GenderSelect({ value, onChange, required }: Props) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} required={required}>
      <option value="">מגדר (בחר)</option>
      <option value="male">זכר</option>
      <option value="female">נקבה</option>
      <option value="other">אחר</option>
    </select>
  );
}
