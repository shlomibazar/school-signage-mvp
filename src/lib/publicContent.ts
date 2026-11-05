// Region settings as sent to public screens (/screen/[slug]). The admin APIs keep the stored
// settings; a public screen gets only what it renders.
//
// - BIRTHDAYS (the existing single-person card): name, class text and greeting. The stored
//   birthDate (a full date, year included) is never sent — the card does not show it.
// - IFRAME: only the URL.
// - Other types are passed through unchanged (they hold display configuration, not personal data).

const pick = (s: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter(k => typeof s[k] === 'string').map(k => [k, s[k]]))

export function publicContentSettings(contentType: string, settings: unknown): Record<string, unknown> | null {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null
  const s = settings as Record<string, unknown>
  switch (contentType) {
    case 'BIRTHDAYS': return pick(s, ['personName', 'grade', 'greetingText'])
    case 'IFRAME': return pick(s, ['url'])
    default: return s
  }
}
