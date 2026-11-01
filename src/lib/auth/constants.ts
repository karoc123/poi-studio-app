export const AUTH_COOKIE_NAME = 'auth_token';

// 30 days in seconds
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const AVATAR_PALETTE = [
  '#6366F1', // Indigo
  '#EC4899', // Pink
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EF4444', // Red
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#64748B', // Slate
];

export function getRandomAvatarColor(): string {
  const index = Math.floor(Math.random() * AVATAR_PALETTE.length);
  return AVATAR_PALETTE[index];
}
