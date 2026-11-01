export function generateInviteCode(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

export function formatCountdown(startDateStr?: string | null, endDateStr?: string | null): string {
  if (!startDateStr) return 'Dates TBD';

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(startDateStr);
    start.setHours(0, 0, 0, 0);

    const diffTime = start.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Starts today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays > 1) return `In ${diffDays} days`;

    // If start date is in the past, check if end date is still in the future
    if (endDateStr) {
      const end = new Date(endDateStr);
      end.setHours(23, 59, 59, 999);
      if (end.getTime() >= today.getTime()) {
        return 'Ongoing';
      }
    }

    return 'Completed';
  } catch {
    return 'Dates TBD';
  }
}

export function calculateTripDays(startDateStr?: string | null, endDateStr?: string | null): number | null {
  if (!startDateStr || !endDateStr) return null;
  try {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) return null;
    return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
  } catch {
    return null;
  }
}
