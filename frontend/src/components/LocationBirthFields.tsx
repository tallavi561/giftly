interface Props {
  birth_date: string;
  city: string;
  country: string;
  onChange: (field: 'birth_date' | 'city' | 'country', value: string) => void;
}

export default function LocationBirthFields({ birth_date, city, country, onChange }: Props) {
  return (
    <>
      <div className="field">
        <label>תאריך לידה</label>
        <input
          type="date"
          value={birth_date}
          onChange={e => onChange('birth_date', e.target.value)}
          max={new Date().toISOString().split('T')[0]}
        />
      </div>
      <div className="fields-row">
        <div className="field">
          <label>עיר</label>
          <input placeholder="תל אביב" value={city} onChange={e => onChange('city', e.target.value)} />
        </div>
        <div className="field">
          <label>מדינה</label>
          <input placeholder="ישראל" value={country} onChange={e => onChange('country', e.target.value)} />
        </div>
      </div>
    </>
  );
}
