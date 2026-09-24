export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}
export function allowedUser(id: string): boolean {
  return (process.env.LINE_ALLOWED_USER_IDS || '').split(',').map(x => x.trim()).filter(Boolean).includes(id);
}
