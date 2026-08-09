import { useState, useEffect } from 'react';
import {
  getHebrewMonths, daysInHebrewMonth, currentHebrewYear,
  hebrewToGregorianDate, gregorianToHebrewDisplay,
} from '../lib/hebrewDate.js';

interface Props {
  birth_date: string;
  city: string;
  country: string;
  onChange: (field: 'birth_date' | 'city' | 'country', value: string) => void;
}

const DEFAULT_HY = currentHebrewYear() - 25;

export default function LocationBirthFields({ birth_date, city, country, onChange }: Props) {
  const [calType, setCalType] = useState<'gregorian' | 'hebrew'>('gregorian');

  // Hebrew sub-state (only used when calType === 'hebrew').
  // Year/day are kept as raw strings while editing so the field can be
  // fully cleared (e.g. to delete the default "1" and type "23") without
  // snapping back to a clamped value on every keystroke; clamping/validation
  // happens on blur instead.
  const [hYearStr, setHYearStr] = useState(String(DEFAULT_HY));
  const [hMonth,   setHMonth]   = useState(7);  // Tishrei
  const [hDayStr,  setHDayStr]  = useState('1');

  const hYear = Number(hYearStr) || DEFAULT_HY;
  const hDay = Number(hDayStr) || 1;

  const hebrewMonths = getHebrewMonths(hYear);
  const maxHDay = daysInHebrewMonth(hMonth, hYear);

  // Clamp day when month/year changes
  useEffect(() => {
    if (hDay > maxHDay) setHDayStr(String(maxHDay));
  }, [hMonth, hYear]);

  // When any Hebrew field changes (and is validly filled in) → convert and emit
  useEffect(() => {
    if (calType !== 'hebrew') return;
    if (hYearStr === '' || hDayStr === '') return;
    const greg = hebrewToGregorianDate(hYear, hMonth, hDay);
    if (greg) onChange('birth_date', greg);
  }, [calType, hYear, hMonth, hDay, hYearStr, hDayStr]);

  function switchToHebrew() {
    setCalType('hebrew');
    // Reset to defaults (can't reliably reverse-convert an existing gregorian date)
    setHYearStr(String(DEFAULT_HY));
    setHMonth(7);
    setHDayStr('1');
  }

  function commitHYear() {
    const n = Number(hYearStr);
    if (hYearStr === '' || Number.isNaN(n)) { setHYearStr(String(DEFAULT_HY)); return; }
    setHYearStr(String(Math.min(5900, Math.max(5700, n))));
  }

  function commitHDay() {
    const n = Number(hDayStr);
    if (hDayStr === '' || Number.isNaN(n)) { setHDayStr('1'); return; }
    setHDayStr(String(Math.min(maxHDay, Math.max(1, n))));
  }

  function switchToGregorian() {
    setCalType('gregorian');
    // Clear birth_date so the user re-enters it in the date picker
    onChange('birth_date', '');
  }

  // Gregorian preview label shown below Hebrew picker
  const gregPreview = calType === 'hebrew' && hYearStr !== '' && hDayStr !== ''
    ? hebrewToGregorianDate(hYear, hMonth, hDay) ?? ''
    : '';

  // If we have a gregorian date and calType is gregorian, also show Hebrew equivalent
  const hebEquivalent = calType === 'gregorian' && birth_date
    ? gregorianToHebrewDisplay(birth_date)
    : '';

  return (
    <>
      <div className="field">
        <label>תאריך לידה</label>

        {/* Calendar type toggle */}
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
          <>
            <input
              type="date"
              value={birth_date}
              onChange={e => onChange('birth_date', e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
            {hebEquivalent && (
              <p className="ef-hebrew-preview" style={{ marginTop: 6 }}>{hebEquivalent}</p>
            )}
          </>
        ) : (
          <>
            <div className="fields-row" style={{ marginBottom: 4 }}>
              <div className="field">
                <label>שנה עברית</label>
                <input
                  type="number"
                  min={5700}
                  max={5900}
                  value={hYearStr}
                  onChange={e => setHYearStr(e.target.value)}
                  onBlur={commitHYear}
                />
              </div>
              <div className="field">
                <label>חודש</label>
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
                  value={hDayStr}
                  onChange={e => setHDayStr(e.target.value)}
                  onBlur={commitHDay}
                />
              </div>
            </div>
            {gregPreview && (
              <p className="ef-hebrew-preview">
                מקביל ל-{new Date(gregPreview).toLocaleDateString('he-IL')}
              </p>
            )}
          </>
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
