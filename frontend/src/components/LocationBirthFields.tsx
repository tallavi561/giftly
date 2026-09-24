import { useState } from 'react';
import WheelPicker, { type WheelOption } from './WheelPicker.js';
import {
  getHebrewMonths, daysInHebrewMonth, currentHebrewYear,
  hebrewToGregorianDate, gregorianToHebrewParts, hebrewDayStr,
} from '../lib/hebrewDate.js';

interface Props {
  birth_date: string;
  city: string;
  country: string;
  onChange: (field: 'birth_date' | 'city' | 'country', value: string) => void;
}

const GREGORIAN_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const today = new Date();
const CURRENT_G_YEAR = today.getFullYear();
const CURRENT_H_YEAR = currentHebrewYear();
const DEFAULT_AGE = 25;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Number of days in Gregorian month `m` (1-indexed) of `y` */
function daysInGregorianMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function parseGregorian(dateStr: string): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  if (!y || !mo || !d) return null;
  return { year: y, month: mo, day: d };
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

export default function LocationBirthFields({ birth_date, city, country, onChange }: Props) {
  const [calType, setCalType] = useState<'gregorian' | 'hebrew'>('gregorian');
  const [touched, setTouched] = useState(Boolean(birth_date));

  const initialGreg = parseGregorian(birth_date);
  const initialHeb = birth_date ? gregorianToHebrewParts(birth_date) : null;

  const [gYear, setGYear]   = useState(initialGreg?.year  ?? CURRENT_G_YEAR - DEFAULT_AGE);
  const [gMonth, setGMonth] = useState(initialGreg?.month ?? 1);
  const [gDay, setGDay]     = useState(initialGreg?.day   ?? 1);

  const [hYear, setHYear]   = useState(initialHeb?.year  ?? CURRENT_H_YEAR - DEFAULT_AGE);
  const [hMonth, setHMonth] = useState(initialHeb?.month ?? 7); // Tishrei
  const [hDay, setHDay]     = useState(initialHeb?.day   ?? 1);

  // Gregorian bounds: birth date can't be in the future.
  const isCurrentGYear = gYear === CURRENT_G_YEAR;
  const maxGMonth = isCurrentGYear ? today.getMonth() + 1 : 12;
  const clampedGMonth = Math.min(gMonth, maxGMonth);
  const isCurrentGMonth = isCurrentGYear && clampedGMonth === maxGMonth;
  const maxGDay = isCurrentGMonth ? today.getDate() : daysInGregorianMonth(gYear, clampedGMonth);
  const clampedGDay = Math.min(gDay, maxGDay);

  const gYearOptions: WheelOption[] = range(CURRENT_G_YEAR - 110, CURRENT_G_YEAR).map(y => ({ value: y, label: String(y) }));
  const gMonthOptions: WheelOption[] = GREGORIAN_MONTHS.slice(0, maxGMonth).map((name, i) => ({ value: i + 1, label: name }));
  const gDayOptions: WheelOption[] = range(1, maxGDay).map(d => ({ value: d, label: String(d) }));

  // Hebrew bounds: year capped at the current Hebrew year (month/day within it are left open,
  // matching the leniency the Gregorian side used to have before the `max` attribute existed).
  const clampedHYear = Math.min(hYear, CURRENT_H_YEAR);
  const hebrewMonths = getHebrewMonths(clampedHYear);
  const clampedHMonth = hebrewMonths.some(m => m.num === hMonth) ? hMonth : hebrewMonths[0].num;
  const maxHDay = daysInHebrewMonth(clampedHMonth, clampedHYear);
  const clampedHDay = Math.min(hDay, maxHDay);

  const hYearOptions: WheelOption[] = range(CURRENT_H_YEAR - 110, CURRENT_H_YEAR).map(y => ({ value: y, label: String(y) }));
  const hMonthOptions: WheelOption[] = hebrewMonths.map(m => ({ value: m.num, label: m.name }));
  const hDayOptions: WheelOption[] = range(1, maxHDay).map(d => ({ value: d, label: hebrewDayStr(d) }));

  function commitGregorian(next: { year: number; month: number; day: number }) {
    setTouched(true);
    setGYear(next.year); setGMonth(next.month); setGDay(next.day);
    onChange('birth_date', `${next.year}-${pad2(next.month)}-${pad2(next.day)}`);
  }

  function commitHebrew(next: { year: number; month: number; day: number }) {
    setTouched(true);
    setHYear(next.year); setHMonth(next.month); setHDay(next.day);
    const greg = hebrewToGregorianDate(next.year, next.month, next.day);
    if (greg) onChange('birth_date', greg);
  }

  function switchToHebrew() {
    const gregStr = `${gYear}-${pad2(clampedGMonth)}-${pad2(clampedGDay)}`;
    const parts = gregorianToHebrewParts(gregStr);
    if (parts) { setHYear(parts.year); setHMonth(parts.month); setHDay(parts.day); }
    setCalType('hebrew');
  }

  function switchToGregorian() {
    const greg = hebrewToGregorianDate(clampedHYear, clampedHMonth, clampedHDay);
    if (greg) {
      const parts = parseGregorian(greg)!;
      setGYear(parts.year); setGMonth(parts.month); setGDay(parts.day);
    }
    setCalType('gregorian');
  }

  return (
    <>
      <div className="field">
        <label>תאריך לידה</label>

        <div className="cpf-children-toggle" style={{ marginBottom: 8 }}>
          <button
            type="button"
            className={`cpf-toggle-btn${calType === 'gregorian' ? ' active' : ''}`}
            onClick={switchToGregorian}
          >
            לועזי
          </button>
          <button
            type="button"
            className={`cpf-toggle-btn${calType === 'hebrew' ? ' active' : ''}`}
            onClick={switchToHebrew}
          >
            עברי
          </button>
        </div>

        {calType === 'gregorian' ? (
          <div className="bdw-wheels">
            <div className="bdw-wheel-col">
              <span className="bdw-wheel-label">יום</span>
              <WheelPicker options={gDayOptions} value={clampedGDay} ariaLabel="יום" onChange={d => commitGregorian({ year: gYear, month: clampedGMonth, day: d })} />
            </div>
            <div className="bdw-wheel-col">
              <span className="bdw-wheel-label">חודש</span>
              <WheelPicker options={gMonthOptions} value={clampedGMonth} ariaLabel="חודש" onChange={m => commitGregorian({ year: gYear, month: m, day: clampedGDay })} />
            </div>
            <div className="bdw-wheel-col">
              <span className="bdw-wheel-label">שנה</span>
              <WheelPicker options={gYearOptions} value={gYear} ariaLabel="שנה" onChange={y => commitGregorian({ year: y, month: clampedGMonth, day: clampedGDay })} />
            </div>
          </div>
        ) : (
          <div className="bdw-wheels">
            <div className="bdw-wheel-col">
              <span className="bdw-wheel-label">יום</span>
              <WheelPicker options={hDayOptions} value={clampedHDay} ariaLabel="יום" onChange={d => commitHebrew({ year: clampedHYear, month: clampedHMonth, day: d })} />
            </div>
            <div className="bdw-wheel-col">
              <span className="bdw-wheel-label">חודש</span>
              <WheelPicker options={hMonthOptions} value={clampedHMonth} ariaLabel="חודש" onChange={m => commitHebrew({ year: clampedHYear, month: m, day: clampedHDay })} />
            </div>
            <div className="bdw-wheel-col">
              <span className="bdw-wheel-label">שנה</span>
              <WheelPicker options={hYearOptions} value={clampedHYear} ariaLabel="שנה" onChange={y => commitHebrew({ year: y, month: clampedHMonth, day: clampedHDay })} />
            </div>
          </div>
        )}

        {!touched && (
          <p className="ef-hebrew-preview" style={{ marginTop: 6 }}>גללו לבחירת תאריך הלידה</p>
        )}
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
