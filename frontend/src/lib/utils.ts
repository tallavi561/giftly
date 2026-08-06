import { hebrewToGregorianInYear } from './hebrewDate.js';

export function calcAge(birth_date: string | null): number | null {
  if (!birth_date) return null;
  const today = new Date();
  const dob = new Date(birth_date);
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export function formatLocation(city: string | null, country: string | null): string | null {
  if (city && country) return `${city}, ${country}`;
  return city ?? country ?? null;
}

interface OccurrenceEvent {
  date: string;
  date_type?: 'gregorian' | 'hebrew';
}

/**
 * Resolve the next upcoming occurrence (today or later) of an event, whether
 * it's a one-time date (YYYY-MM-DD), a yearly-recurring one (MM-DD), or on
 * the Hebrew calendar. Returns null if the date can't be resolved.
 */
export function nextEventOccurrence(event: OccurrenceEvent, from: Date = new Date()): Date | null {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  if (event.date_type === 'hebrew') {
    for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
      const md = hebrewToGregorianInYear(event.date, year);
      if (!md) continue;
      const candidate = new Date(year, md.month, md.day);
      if (candidate >= today) return candidate;
    }
    return null;
  }

  const parts = event.date.split('-');
  if (parts.length === 3) {
    const d = new Date(event.date);
    return isNaN(d.getTime()) ? null : d;
  }
  if (parts.length === 2) {
    const [mm, dd] = parts.map(Number);
    for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
      const candidate = new Date(year, mm - 1, dd);
      if (candidate >= today) return candidate;
    }
  }
  return null;
}

export function daysUntil(date: Date, from: Date = new Date()): number {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

const CATEGORY_GRADIENTS = [
  'linear-gradient(160deg, #5851DB, #8b5cf6)',
  'linear-gradient(160deg, #D4AF37, #a67c1e)',
  'linear-gradient(160deg, #684444, #835b5c)',
  'linear-gradient(160deg, #735c00, #a68a1f)',
];

/** A stable, category-derived gradient — used as a placeholder wherever a product photo isn't available yet. */
export function gradientForCategory(category: string | null | undefined): string {
  if (!category) return CATEGORY_GRADIENTS[0];
  const idx = Math.abs(category.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % CATEGORY_GRADIENTS.length;
  return CATEGORY_GRADIENTS[idx];
}
