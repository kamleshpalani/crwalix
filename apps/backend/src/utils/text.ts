const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Basic international phone pattern — best-effort, not exhaustive.
const PHONE_RE =
  /(\+?\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}/g;

export function extractEmails(text: string): string[] {
  return unique((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()));
}

export function extractPhones(text: string): string[] {
  return unique(
    (text.match(PHONE_RE) ?? [])
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.replace(/\D/g, '').length >= 7)
  );
}

export function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function cleanText(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}
