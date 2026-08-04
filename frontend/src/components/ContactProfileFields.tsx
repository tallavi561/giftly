interface Props {
  relationship_status: string;
  has_children: '' | 'true' | 'false';
  religion: string;
  onChange: (field: string, value: string) => void;
}

const RELATIONSHIP_OPTIONS = [
  { value: '', label: 'לא ידוע' },
  { value: 'single', label: 'רווק/ה' },
  { value: 'married', label: 'נשוי/אה' },
  { value: 'divorced', label: 'גרוש/ה' },
  { value: 'widowed', label: 'אלמן/ה' },
  { value: 'cohabiting', label: 'ידועים בציבור' },
];

const RELIGION_OPTIONS = [
  { value: '', label: 'לא ידוע' },
  { value: 'secular', label: 'חילוני/ת' },
  { value: 'jewish', label: 'יהודי/ה' },
  { value: 'muslim', label: 'מוסלמי/ת' },
  { value: 'christian', label: 'נוצרי/ת' },
  { value: 'druze', label: 'דרוזי/ת' },
  { value: 'other', label: 'אחר' },
];

export default function ContactProfileFields({ relationship_status, has_children, religion, onChange }: Props) {
  return (
    <div className="cpf-row">
      <div className="field">
        <label>מצב משפחתי</label>
        <select value={relationship_status} onChange={e => onChange('relationship_status', e.target.value)}>
          {RELATIONSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="field">
        <label>ילדים</label>
        <div className="cpf-children-toggle">
          {(['', 'true', 'false'] as const).map((v, i) => (
            <button
              key={v}
              type="button"
              className={`cpf-toggle-btn${has_children === v ? ' active' : ''}`}
              onClick={() => onChange('has_children', v)}
            >
              {i === 0 ? 'לא ידוע' : i === 1 ? 'כן' : 'לא'}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>דת</label>
        <select value={religion} onChange={e => onChange('religion', e.target.value)}>
          {RELIGION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </div>
  );
}
