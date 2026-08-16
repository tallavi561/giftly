// Local-only "fits / doesn't fit" feedback for the per-contact find-gift feed.
// The v1.1 recommendation-engine spec (§14 area of the product discussion)
// explicitly leaves "how is a rating given on someone else's behalf stored"
// as local-only, at the rater's own device, not shared — there is no backend
// endpoint yet (that lands with the contact-flow rewrite). This is a
// deliberate stopgap, not a shortcut: swap it for a real API call once
// PATCH /api/recommendations/:id/rate exists, without changing the UI.

export type LocalFit = 'FIT' | 'NOT_FIT';

const STORAGE_KEY = 'giftly_local_gift_fit';

function readAll(): Record<string, LocalFit> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function getLocalFit(recommendationId: string): LocalFit | null {
  return readAll()[recommendationId] ?? null;
}

export function setLocalFit(recommendationId: string, value: LocalFit): void {
  const all = readAll();
  all[recommendationId] = value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
