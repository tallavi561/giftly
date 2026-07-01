import { useState, useEffect, type FormEvent } from 'react';

const PRESET_TYPES = ['יום הולדת', 'יום נישואין', 'חג', 'סיום לימודים', 'אחר'];

export interface EventFormValues {
  type: string;
  date: string;
  reminder_days: number;
}

interface Props {
  initial?: EventFormValues;
  onSubmit: (values: EventFormValues) => Promise<void>;
  onCancel: () => void;
}

export default function EventForm({ initial, onSubmit, onCancel }: Props) {
  const [type, setType] = useState(initial?.type ?? 'יום הולדת');
  const [customType, setCustomType] = useState('');
  const [date, setDate] = useState(initial?.date ?? '');
  const [reminderDays, setReminderDays] = useState(initial?.reminder_days ?? 14);
  const [loading, setLoading] = useState(false);

  // When editing an existing event whose type isn't in the preset list
  useEffect(() => {
    if (initial && !PRESET_TYPES.includes(initial.type)) {
      setType('אחר');
      setCustomType(initial.type);
    }
  }, []);

  const isOther = type === 'אחר';
  const resolvedType = isOther ? customType.trim() : type;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isOther && !customType.trim()) return;
    setLoading(true);
    await onSubmit({ type: resolvedType, date, reminder_days: reminderDays });
    setLoading(false);
  }

  return (
    <form className="card form-card" onSubmit={handleSubmit}>
      <select value={type} onChange={e => setType(e.target.value)}>
        {PRESET_TYPES.map(t => <option key={t}>{t}</option>)}
      </select>

      {isOther && (
        <input
          placeholder="תאר את סוג האירוע..."
          value={customType}
          onChange={e => setCustomType(e.target.value)}
          required
        />
      )}

      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        required
      />

      <input
        type="number"
        placeholder="תזכורת X ימים לפני"
        value={reminderDays}
        min={1}
        onChange={e => setReminderDays(Math.max(1, Number(e.target.value)))}
        required
      />

      <div className="row">
        <button type="submit" disabled={loading}>{loading ? 'שומר...' : 'שמור'}</button>
        <button type="button" onClick={onCancel}>ביטול</button>
      </div>
    </form>
  );
}
