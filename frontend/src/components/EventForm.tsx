import { useState, useEffect, type FormEvent } from 'react';

const PRESET_TYPES = ['יום הולדת', 'יום נישואין', 'חג', 'סיום לימודים', 'אחר'];

export interface EventFormValues {
  type: string;
  date: string;
  reminder_days: number;
  budget_min: number | null;
  budget_max: number | null;
}

interface Props {
  initial?: Partial<EventFormValues>;
  birthDate?: string | null;
  onSubmit: (values: EventFormValues) => Promise<void>;
  onCancel: () => void;
}

// ממיר תאריך לידה YYYY-MM-DD לאותו יום השנה בשנה הקרובה
function nextBirthdayDate(birthDate: string): string {
  const [, month, day] = birthDate.split('-');
  const today = new Date();
  const thisYear = today.getFullYear();
  const candidate = new Date(`${thisYear}-${month}-${day}`);
  if (candidate < today) candidate.setFullYear(thisYear + 1);
  return candidate.toISOString().split('T')[0];
}

export default function EventForm({ initial, birthDate, onSubmit, onCancel }: Props) {
  const [type, setType] = useState(initial?.type ?? 'יום הולדת');
  const [customType, setCustomType] = useState('');
  const [date, setDate] = useState(initial?.date ?? '');
  const [reminderDays, setReminderDays] = useState(initial?.reminder_days ?? 14);
  const [budgetMin, setBudgetMin] = useState(initial?.budget_min?.toString() ?? '');
  const [budgetMax, setBudgetMax] = useState(initial?.budget_max?.toString() ?? '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initial?.type && !PRESET_TYPES.includes(initial.type)) {
      setType('אחר');
      setCustomType(initial.type);
    }
  }, []);

  // כשבוחרים "יום הולדת" וידוע תאריך לידה — ממלאים אוטומטית
  useEffect(() => {
    if (type === 'יום הולדת' && birthDate && !initial?.date) {
      setDate(nextBirthdayDate(birthDate));
    }
  }, [type, birthDate]);

  const isOther = type === 'אחר';
  const resolvedType = isOther ? customType.trim() : type;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isOther && !customType.trim()) return;
    setLoading(true);
    await onSubmit({
      type: resolvedType,
      date,
      reminder_days: reminderDays,
      budget_min: budgetMin ? Number(budgetMin) : null,
      budget_max: budgetMax ? Number(budgetMax) : null,
    });
    setLoading(false);
  }

  return (
    <form className="fields-stack" onSubmit={handleSubmit}>
      <div className="field">
        <label>סוג האירוע</label>
        <select value={type} onChange={e => setType(e.target.value)}>
          {PRESET_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {isOther && (
        <div className="field">
          <label>תיאור האירוע</label>
          <input placeholder="תאר את סוג האירוע..." value={customType} onChange={e => setCustomType(e.target.value)} required />
        </div>
      )}

      <div className="field">
        <label>תאריך</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </div>

      <label className="field-label">
        כמה ימים לפני האירוע לשלוח לי תזכורת במייל?
        <input type="number" value={reminderDays} min={1} onChange={e => setReminderDays(Math.max(1, Number(e.target.value)))} required />
      </label>

      <div className="fields-row">
        <div className="field">
          <label>תקציב מינימום ₪</label>
          <input type="number" placeholder="0" value={budgetMin} min={0} onChange={e => setBudgetMin(e.target.value)} />
        </div>
        <div className="field">
          <label>תקציב מקסימום ₪</label>
          <input type="number" placeholder="500" value={budgetMax} min={0} onChange={e => setBudgetMax(e.target.value)} />
        </div>
      </div>

      <div className="form-row-btns">
        <button type="submit" className="btn-filled" disabled={loading}>{loading ? 'שומר...' : 'שמור'}</button>
        <button type="button" className="btn-surface" onClick={onCancel}>ביטול</button>
      </div>
    </form>
  );
}
