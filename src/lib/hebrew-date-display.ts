/** Hebrew-calendar date with traditional Hebrew numerals, e.g. ז׳ בחשוון תשפ״ז. */
const hebrewDigits: Array<[number, string]> = [
  [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'],
  [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'],
  [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א'],
]
function hebrewNumeral(value: number): string {
  if (!Number.isInteger(value) || value <= 0) return String(value)
  let n = value
  let letters = ''
  // 15 and 16 are conventionally ט״ו and ט״ז rather than יה and יו.
  while (n >= 400) { letters += 'ת'; n -= 400 }
  if (n >= 100) {
    for (const [amount, letter] of hebrewDigits) {
      if (amount < 100 || amount > 300) continue
      while (n >= amount) { letters += letter; n -= amount }
    }
  }
  if (n === 15 || n === 16) { letters += n === 15 ? 'טו' : 'טז'; n = 0 }
  for (const [amount, letter] of hebrewDigits) {
    if (amount >= 100) continue
    while (n >= amount) { letters += letter; n -= amount }
    if (n === 15 || n === 16) { letters += n === 15 ? 'טו' : 'טז'; n = 0 }
  }
  return letters.length === 1 ? `${letters}׳` : `${letters.slice(0, -1)}״${letters.slice(-1)}`
}
export function formatHebrewDateLetters(date: Date): string {
  try {
    const formatter = new Intl.DateTimeFormat('he-IL-u-ca-hebrew-nu-latn', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
    const parts = formatter.formatToParts(date)
    const day = Number(parts.find(p => p.type === 'day')?.value)
    const month = parts.find(p => p.type === 'month')?.value ?? ''
    const year = Number(parts.find(p => p.type === 'year')?.value)
    if (!Number.isFinite(day) || !Number.isFinite(year) || !month) return formatter.format(date)
    // Hebrew year is traditionally shown without the millennium (5787 -> תשפ״ז).
    return `${hebrewNumeral(day)} ב${month} ${hebrewNumeral(year % 1000)}`
  } catch {
    return ''
  }
}
