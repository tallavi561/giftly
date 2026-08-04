import { useState, useEffect, type FormEvent } from 'react';
import {
  getHebrewMonths, daysInHebrewMonth, currentHebrewYear, formatHebrewDate,
} from '../lib/hebrewDate.js';

const PRESET_TYPES = ['יום הולדת', 'יום נישואין', 'חג', 'סיום לימודים', 'אחר'];

export interface EventFormValues {
  type: string;
  date: string;
  date_type: 'gregorian' | 'hebrew';
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

function nextBirthdayDate(birthDate: string): string {
  const [, month, day] = birthDate.split('-');
  const today = new Date();
  const thisYear = today.getFullYear();
  const candidate = new Date(`${thisYear}-${month}-${day}`);
  if (candidate < today) candidate.setFullYear(thisYear + 1);
  return candidate.toISOString().split('T')[0];
}

const HY = currentHebrewYear();

export default function EventForm({ initial, birthDate, onSubmit, onCancel }: Props) {
  const [type, setType]               = useState(initial?.type ?? 'יום הולדת');
  const [customType, setCustomType]   = useState('');
  const [dateType, setDateType]       = useState<'gregorian' | 'hebrew'>(initial?.date_type ?? 'gregorian');

  // Gregorian state
  const [gregDate, setGregDate]       = useState(initial?.date_type === 'gregorian' ? (initial?.date ?? '') : '');

  // Hebrew state — parse from initial if hebrew
  const initialHMonth = initial?.date_type === 'hebrew' ? parseInt(initial.date!.split('-')[0]) : 7;
  const initialHDay   = initial?.date_type === 'hebrew' ? parseInt(initial.date!.split('-')[1]) : 1;
  const [hMonth, setHMonth]           = useState(initialHMonth);
  const [hDay, setHDay]               = useState(initialHDay);

  const [reminderDays, setReminderDays] = useState(initial?.reminder_days ?? 14);
  const [budgetMin, setBudgetMin]       = useState(initial?.budget_min?.toString() ?? '');
  const [budgetMax, setBudgetMax]       = useState(initial?.budget_max?.toString() ?? '');
  const [loading, setLoading]           = useState(false);

  // Leap-aware month list for current Hebrew year
  const hebrewMonths = getHebrewMonths(HY);
  const maxHDay = daysInHebrewMonth(hMonth, HY);

  useEffect(() => {
    if (initial?.type && !PRESET_TYPES.includes(initial.type)) {
      setType('אחר');
      setCustomType(initial.type);
    }
  }, []);

  useEffect(() => {
    if (type === 'יום הולדת' && birthDate && !initial?.date) {
      setGregDate(nextBirthdayDate(birthDate));
    }
  }, [type, birthDate]);

  // Clamp day when month changes
  useEffect(() => {
    if (hDay > maxHDay) setHDay(maxHDay);
  }, [hMonth]);

  const isOther = type === 'אחר';
  const resolvedType = isOther ? customType.trim() : type;

  // The stored date string
  const storedDate = dateType === 'hebrew' ? `${hMonth}-${String(hDay).padStart(2, '0')}` : gregDate;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isOther && !customType.trim()) return;
    if (dateType === 'gregorian' && !gregDate) return;
    setLoading(true);
    await onSubmit({
      type: resolvedType,
      date: storedDate,
      date_type: dateType,
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

      {/* Calendar type toggle */}
      <div className="field">
        <label>לוח שנה</label>
        <div className="cpf-children-toggle">
          <button type="button" className={`cpf-toggle-btn${dateType === 'gregorian' ? ' active' : ''}`} onClick={() => setDateType('gregorian')}>
            לועזי
          </button>
          <button type="button" className={`cpf-toggle-btn${dateType === 'hebrew' ? ' active' : ''}`} onClick={() => setDateType('hebrew')}>
            עברי
          </button>
        </div>
      </div>

      {dateType === 'gregorian' ? (
        <div className="field">
          <label>תאריך</label>
          <input type="date" value={gregDate} onChange={e => setGregDate(e.target.value)} required />
        </div>
      ) : (
        <div className="fields-row">
          <div className="field">
            <label>חודש עברי</label>
            <select value={hMonth} onChange={e => setHMonth(Number(e.target.value))}>
              {hebrewMonths.map(m => (
                <option key={m.num} value={m.num}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>יום</label>
            <input
              type="number"
              min={1}
              max={maxHDay}
              value={hDay}
              onChange={e => setHDay(Math.min(maxHDay, Math.max(1, Number(e.target.value))))}
              required
            />
          </div>
        </div>
      )}

      {dateType === 'hebrew' && (
        <p className="ef-hebrew-preview">
          {formatHebrewDate(storedDate, HY)}
        </p>
      )}

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
