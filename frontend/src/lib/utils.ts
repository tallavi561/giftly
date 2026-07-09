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
