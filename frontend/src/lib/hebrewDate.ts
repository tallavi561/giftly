import { HDate, months } from '@hebcal/core';

// Hebrew months in traditional display order (starting from Tishrei)
export const HEBREW_MONTHS_BASE = [
  { num: 7,  name: 'תשרי' },
  { num: 8,  name: 'חשוון' },
  { num: 9,  name: 'כסלו' },
  { num: 10, name: 'טבת' },
  { num: 11, name: 'שבט' },
  { num: 12, name: 'אדר' },   // becomes 'אדר א' in leap year
  { num: 13, name: 'אדר ב' }, // only shown in leap year
  { num: 1,  name: 'ניסן' },
  { num: 2,  name: 'אייר' },
  { num: 3,  name: 'סיוון' },
  { num: 4,  name: 'תמוז' },
  { num: 5,  name: 'אב' },
  { num: 6,  name: 'אלול' },
];

/** Hebrew month list for a given Hebrew year — shows Adar I & II only in leap years */
export function getHebrewMonths(hebrewYear: number) {
  const leap = HDate.isLeapYear(hebrewYear);
  return HEBREW_MONTHS_BASE
    .filter(m => m.num !== 13 || leap)
    .map(m => ({
      ...m,
      name: m.num === 12 && leap ? 'אדר א' : m.name,
    }));
}

/** Current Hebrew year */
export function currentHebrewYear(): number {
  return new HDate().getFullYear();
}

/** How many days are in a Hebrew month (for a given Hebrew year) */
export function daysInHebrewMonth(month: number, hebrewYear: number): number {
  return HDate.daysInMonth(month, hebrewYear);
}

/**
 * Given a stored Hebrew date string "M-DD" and a Gregorian view year,
 * returns { month, day } (0-indexed month) for the calendar grid.
 *
 * Adar rule: stored month 12 (Adar) → Adar II (13) in a leap Hebrew year.
 * Stored month 13 → Adar I (12) if the target year is not a leap year.
 */
export function hebrewToGregorianInYear(
  dateStr: string,
  gregYear: number,
): { month: number; day: number } | null {
  const parts = dateStr.split('-');
  if (parts.length !== 2) return null;
  const hMonth = parseInt(parts[0], 10);
  const hDay = parseInt(parts[1], 10);
  if (isNaN(hMonth) || isNaN(hDay)) return null;

  // A Gregorian year overlaps two Hebrew years; try both
  for (const delta of [3760, 3761]) {
    const hy = gregYear + delta;
    const isLeap = HDate.isLeapYear(hy);

    let m = hMonth;
    if (m === 12 && isLeap) m = months.ADAR_II; // Adar → Adar II in leap year
    if (m === 13 && !isLeap) m = months.ADAR_I;  // Adar II → Adar if non-leap

    try {
      const maxDays = HDate.daysInMonth(m, hy);
      if (hDay > maxDays) continue; // e.g., 30 Kislev in a short year
      const hdate = new HDate(hDay, m, hy);
      const greg = hdate.greg();
      if (greg.getFullYear() === gregYear) {
        return { month: greg.getMonth(), day: greg.getDate() };
      }
    } catch {
      // invalid combination — skip
    }
  }
  return null;
}

/** Format a stored Hebrew date string "M-DD" as a Hebrew label, e.g. "י׳ תשרי" */
export function formatHebrewDate(dateStr: string, hebrewYear?: number): string {
  const parts = dateStr.split('-');
  if (parts.length !== 2) return dateStr;
  const hMonth = parseInt(parts[0], 10);
  const hDay = parseInt(parts[1], 10);

  const hy = hebrewYear ?? currentHebrewYear();
  const isLeap = HDate.isLeapYear(hy);

  const monthName = HEBREW_MONTHS_BASE.find(m => m.num === hMonth)?.name
    ?? `חודש ${hMonth}`;
  const displayName = hMonth === 12 && isLeap ? 'אדר א' : monthName;

  return `${hebrewDayStr(hDay)} ${displayName}`;
}

const HEB_LETTERS = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט',
  'י', 'יא', 'יב', 'יג', 'יד', 'טו', 'טז', 'יז', 'יח', 'יט',
  'כ', 'כא', 'כב', 'כג', 'כד', 'כה', 'כו', 'כז', 'כח', 'כט', 'ל'];

/**
 * Convert a full Hebrew date (year, month, day) to a Gregorian YYYY-MM-DD string.
 * Applies the Adar II rule automatically for leap years.
 */
export function hebrewToGregorianDate(hYear: number, hMonth: number, hDay: number): string | null {
  try {
    const isLeap = HDate.isLeapYear(hYear);
    let m = hMonth;
    if (m === 13 && !isLeap) m = months.ADAR_I;
    if (m === 12 && isLeap) m = months.ADAR_II;
    const maxDays = HDate.daysInMonth(m, hYear);
    if (hDay < 1 || hDay > maxDays) return null;
    const hdate = new HDate(hDay, m, hYear);
    const greg = hdate.greg();
    return greg.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

/** Convert a Gregorian YYYY-MM-DD string to a Hebrew date for display */
export function gregorianToHebrewDisplay(gregDateStr: string): string {
  try {
    const [y, mo, d] = gregDateStr.split('-').map(Number);
    const hdate = new HDate(new Date(y, mo - 1, d));
    const monthName = HEBREW_MONTHS_BASE.find(m => m.num === hdate.getMonth())?.name ?? '';
    return `${hebrewDayStr(hdate.getDate())} ${monthName} ${hdate.getFullYear()}`;
  } catch {
    return '';
  }
}

export function hebrewDayStr(day: number): string {
  return (HEB_LETTERS[day] ?? String(day)) + '׳';
}
