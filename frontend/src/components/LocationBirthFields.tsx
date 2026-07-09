interface Props {
  birth_date: string;
  city: string;
  country: string;
  onChange: (field: 'birth_date' | 'city' | 'country', value: string) => void;
}

export default function LocationBirthFields({ birth_date, city, country, onChange }: Props) {
  return (
    <>
      <div>
        <label style={{ fontSize: '0.85rem', color: '#555', display: 'block', marginBottom: 4 }}>
          תאריך לידה
        </label>
        <input
          type="date"
          value={birth_date}
          onChange={e => onChange('birth_date', e.target.value)}
          max={new Date().toISOString().split('T')[0]}
        />
      </div>
      <div className="row">
        <input
          placeholder="עיר"
          value={city}
          onChange={e => onChange('city', e.target.value)}
        />
        <input
          placeholder="מדינה"
          value={country}
          onChange={e => onChange('country', e.target.value)}
        />
      </div>
    </>
  );
}
