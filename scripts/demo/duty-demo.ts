// Duty roster demo school: a repeatable seed and a separate, guarded cleanup.
//
//   npm run demo:seed                                   create / complete the demo school (idempotent)
//   npm run demo:seed -- --reset-schedule               rebuild only the demo school's schedules (dates move to "now")
//   npm run demo:cleanup -- --confirm=bazz-demo-duty    delete the demo school and everything it owns
//
// Safety:
// - Every write is scoped to ONE school, found by its fixed slug (DEMO_SLUG). If a school with that
//   slug exists under another name, the script stops without writing anything.
// - Other schools, users, screens and announcements are never read for writing, changed or deleted.
// - Schedules are written through the duty service (src/lib/duty/service.ts): the same validation as
//   the admin UI, so no invalid or conflicting assignment can be stored (no override reasons are given).
// - Optional demo login: only when DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD are set in the environment.
//   An existing user with that email is never changed (and an existing user of another school stops the
//   admin step). The password is never printed.
// - Output is counts and names only: no connection strings, environment values or passwords.
// - Not part of the build or the start command: it runs only when called explicitly.
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { zonedParts } from '@/lib/zonedTime'
import { addDays, weekStartOf, weekdayOf } from '@/lib/duty/rules'
import * as duty from '@/lib/duty/service'

export const DEMO_SLUG = 'bazz-demo-duty'
export const DEMO_NAME = 'בית ספר הדגמה — BazZ'
const DEMO_ADMIN_NAME = 'מנהל/ת הדגמה — BazZ'
const TZ = 'Asia/Jerusalem'
const SCHOOL_DAYS = [0, 1, 2, 3, 4, 5] // Sunday–Friday (Friday: short day)

const log = (...a: unknown[]) => console.log('[demo]', ...a)
class Stop extends Error {}

// ── Fictional data ──────────────────────────────────────────────────────────────

// Required at every duty time: the two yards and the entrance gate. The others are optional ("רשות"):
// staffed when possible, and an empty optional place is not shown as uncovered.
const LOCATIONS = [
  { name: 'חצר ראשית', staffNeeded: 1, required: true },
  { name: 'חצר אחורית', staffNeeded: 1, required: true },
  { name: 'שער כניסה', staffNeeded: 1, required: true },
  { name: 'מסדרון קומה א׳', staffNeeded: 1, required: false },
  { name: 'מסדרון קומה ב׳', staffNeeded: 1, required: false },
  { name: 'מגרש ספורט', staffNeeded: 1, required: false },
  { name: 'קפיטריה', staffNeeded: 1, required: false },
  { name: 'אזור הסעות', staffNeeded: 1, required: false },
]
const REQUIRED = LOCATIONS.filter(l => l.required).map(l => l.name)

// Fictional demo times (not official school times). Friday is a short day.
const PERIODS = [
  { name: 'תורנות בוקר', startTime: '07:45', endTime: '08:00', weekdays: [0, 1, 2, 3, 4, 5], at: ['אזור הסעות'] },
  { name: 'הפסקה ראשונה', startTime: '09:30', endTime: '09:50', weekdays: [0, 1, 2, 3, 4, 5], at: ['מסדרון קומה א׳', 'מסדרון קומה ב׳', 'מגרש ספורט'] },
  { name: 'הפסקה שנייה', startTime: '11:20', endTime: '11:40', weekdays: [0, 1, 2, 3, 4, 5], at: ['מסדרון קומה א׳', 'מגרש ספורט', 'קפיטריה'] },
  { name: 'הפסקה שלישית', startTime: '13:00', endTime: '13:15', weekdays: [0, 1, 2, 3, 4], at: ['קפיטריה'] },
  { name: 'סיום יום לימודים', startTime: '13:45', endTime: '14:00', weekdays: [0, 1, 2, 3, 4], at: ['אזור הסעות'] },
]

type StaffSeed = { first: string; last: string; kind?: 'REGULAR' | 'MANUAL' | 'TEMPORARY'; maxPerDay?: number; maxPerWeek?: number; notes?: string; role?: string }
const STAFF: StaffSeed[] = [
  { first: 'מיכל', last: 'אברהם' },
  { first: 'יוסי', last: 'כהן', notes: 'לבדיקת התנגשות: משובץ בהפסקה הראשונה של היום. נסו לשבץ אותו באותה הפסקה במקום נוסף.' },
  { first: 'רונית', last: 'לוי' },
  { first: 'דוד', last: 'מזרחי' },
  { first: 'שירה', last: 'פרץ' },
  { first: 'אבי', last: 'ביטון' },
  { first: 'נועה', last: 'פרידמן' },
  { first: 'עומר', last: 'שפירא' },
  { first: 'הילה', last: 'גולן', maxPerWeek: 3, notes: 'משרה חלקית: עד 3 תורנויות בשבוע.' },
  { first: 'איתי', last: 'רוזן' },
  { first: 'ליאת', last: 'אוחיון' },
  { first: 'גלעד', last: 'חדד' },
  { first: 'תמר', last: 'אלון', maxPerDay: 1, notes: 'לכל היותר תורנות אחת ביום.' },
  { first: 'אורי', last: 'קליין' },
  { first: 'מורן', last: 'אזולאי' },
  { first: 'יעל', last: 'ברק', role: 'unavailable-tuesday', notes: 'לא זמינה בימי שלישי.' },
  { first: 'משה', last: 'דהן', role: 'edges-only', notes: 'זמין רק לתורנות בוקר ולסיום יום הלימודים.' },
  { first: 'ענבל', last: 'שחר', kind: 'MANUAL', notes: 'רכזת שכבה — נוספה ידנית ללוח התורנויות.' },
  { first: 'רועי', last: 'טל', kind: 'MANUAL', maxPerWeek: 2, notes: 'יועץ — נוסף ידנית. עד 2 תורנויות בשבוע.' },
  { first: 'אסנת', last: 'נחום', kind: 'MANUAL', maxPerWeek: 4 },
  { first: 'עידן', last: 'וקנין', kind: 'MANUAL' },
  { first: 'רונן', last: 'שטרן', kind: 'TEMPORARY', role: 'temp-active', notes: 'מדריך ספורט חיצוני — זמין עד סוף השבוע הנוכחי בלבד.' },
  { first: 'טל', last: 'אורן', kind: 'TEMPORARY', role: 'temp-expired', notes: 'מורה מחליפה — תקופת ההחלפה הסתיימה בשבוע שעבר.' },
  { first: 'דנה', last: 'ישראלי', kind: 'TEMPORARY', role: 'temp-future', notes: 'מורה מחליפה — מתחילה בשבוע הבא.' },
]

// Required slots left empty on purpose (weekday, period, location): visible gaps to fill in the demo.
const LEAVE_EMPTY = new Set([
  '2|הפסקה שלישית|חצר אחורית', '3|הפסקה שנייה|שער כניסה', '4|הפסקה ראשונה|חצר אחורית', '5|הפסקה שנייה|חצר אחורית',
])

// ── Helpers ─────────────────────────────────────────────────────────────────────

const name = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`.trim()
async function tryDuty<T>(f: () => Promise<T>): Promise<T | null> {
  try { return await f() } catch (e) { if (e instanceof duty.DutyError) return null; throw e }
}

async function demoSchool(create: boolean) {
  const found = await db.school.findUnique({ where: { slug: DEMO_SLUG } })
  if (found && found.name !== DEMO_NAME) throw new Stop(`A school with slug "${DEMO_SLUG}" exists with another name; nothing was changed.`)
  if (found || !create) return found
  log('creating the demo school')
  return db.school.create({ data: { slug: DEMO_SLUG, name: DEMO_NAME, timezone: TZ, locale: 'he', weatherCity: 'תל אביב' } })
}

// ── Seed ────────────────────────────────────────────────────────────────────────

async function seed(resetSchedule: boolean) {
  const school = (await demoSchool(true))!
  const schoolId = school.id
  const admin = await demoAdmin(schoolId)
  const userId = admin ?? 'demo-seed'

  await db.dutySettings.upsert({ where: { schoolId }, update: {}, create: { schoolId, schoolDays: SCHOOL_DAYS, maxPerDay: 2, maxPerWeek: 6, allowOverride: true, scheduleMode: 'HYBRID' } })

  // Locations and periods (matched by name).
  const loc = new Map<string, string>()
  for (const [i, l] of LOCATIONS.entries()) {
    const f = await db.dutyLocation.findFirst({ where: { schoolId, name: l.name } })
    loc.set(l.name, f?.id ?? (await db.dutyLocation.create({ data: { schoolId, name: l.name, staffNeeded: l.staffNeeded, required: l.required, sortOrder: i } })).id)
  }
  const per = new Map<string, string>()
  for (const [i, p] of PERIODS.entries()) {
    const f = await db.dutyPeriod.findFirst({ where: { schoolId, name: p.name } })
    per.set(p.name, f?.id ?? (await db.dutyPeriod.create({ data: { schoolId, name: p.name, startTime: p.startTime, endTime: p.endTime, weekdays: p.weekdays, sortOrder: i } })).id)
  }

  // Dates: the demo day is today (school time), or the next Sunday on Friday/Saturday.
  const today = zonedParts(new Date(), TZ).date
  const demoDay = weekdayOf(today) <= 4 ? today : addDays(weekStartOf(today), 7)
  const W0 = weekStartOf(demoDay), Wm1 = addDays(W0, -7), W1 = addDays(W0, 7), W2 = addDays(W0, 14)

  // Staff (matched by name). Validity dates are relative to the current week.
  const staffIds = new Map<string, string>()
  const roleOf = new Map<string, string>()
  const breaks = ['הפסקה ראשונה', 'הפסקה שנייה', 'הפסקה שלישית'].map(n => per.get(n)!)
  for (const s of STAFF) {
    const unavailable = s.role === 'unavailable-tuesday' ? [{ weekday: 2, periodId: null }]
      : s.role === 'edges-only' ? SCHOOL_DAYS.flatMap(d => breaks.map(periodId => ({ weekday: d, periodId }))) : []
    const validity = s.role === 'temp-active' ? { validFrom: Wm1, validUntil: addDays(W0, 5) }
      : s.role === 'temp-expired' ? { validFrom: addDays(Wm1, -14), validUntil: addDays(Wm1, 3) }
      : s.role === 'temp-future' ? { validFrom: W1, validUntil: addDays(W1, 26) } : { validFrom: null, validUntil: null }
    const f = await db.dutyStaff.findFirst({ where: { schoolId, firstName: s.first, lastName: s.last } })
    const id = f?.id ?? (await db.dutyStaff.create({ data: {
      schoolId, firstName: s.first, lastName: s.last, kind: s.kind ?? 'REGULAR', source: 'MANUAL', notes: s.notes ?? null,
      maxPerDay: s.maxPerDay ?? null, maxPerWeek: s.maxPerWeek ?? null, unavailable,
      validFrom: validity.validFrom ? new Date(validity.validFrom + 'T00:00:00Z') : null, validUntil: validity.validUntil ? new Date(validity.validUntil + 'T00:00:00Z') : null,
    } })).id
    staffIds.set(`${s.first} ${s.last}`, id)
    if (s.role) roleOf.set(s.role, id)
  }

  const existing = await db.dutyTemplate.count({ where: { schoolId } })
  if (existing && !resetSchedule) {
    log('schedules already exist: kept as they are (use --reset-schedule to rebuild them)')
  } else {
    if (existing) await resetDemoSchedules(schoolId)
    await seedSchedules({ schoolId, userId, loc, per, staffIds, roleOf, demoDay, W0, Wm1, W1, W2 })
  }
  await seedScreens(schoolId)
  await summary(schoolId)
}

async function demoAdmin(schoolId: string): Promise<string | null> {
  const email = process.env.DEMO_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.DEMO_ADMIN_PASSWORD
  if (!email || !password) { log('demo login: skipped (DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD not set)'); return null }
  if (password.length < 10) throw new Stop('DEMO_ADMIN_PASSWORD must be at least 10 characters; nothing was changed for the login.')
  const u = await db.user.findUnique({ where: { email } })
  if (u && u.schoolId !== schoolId) throw new Stop('DEMO_ADMIN_EMAIL belongs to an existing user of another school; that user was not changed. Choose another email.')
  if (u) { log('demo login: exists (unchanged)'); return u.id }
  const c = await db.user.create({ data: { email, name: DEMO_ADMIN_NAME, role: 'SCHOOL_ADMIN', dutyAccess: 'PUBLISH', schoolId, passwordHash: await bcrypt.hash(password, 12) } })
  log('demo login: created (school admin of the demo school)')
  return c.id
}

type Ctx = { schoolId: string; userId: string; loc: Map<string, string>; per: Map<string, string>; staffIds: Map<string, string>; roleOf: Map<string, string>; demoDay: string; W0: string; Wm1: string; W1: string; W2: string }

async function seedSchedules(c: Ctx) {
  const { schoolId, userId, loc, per, staffIds, roleOf, demoDay, W0, Wm1, W1, W2 } = c
  const regular = [...staffIds.entries()].filter(([, id]) => ![roleOf.get('temp-expired'), roleOf.get('temp-future')].includes(id)).map(([, id]) => id)
  const setup = await duty.loadSetup(schoolId)
  const staffRule = new Map(setup.staff.map(s => [s.id, s]))

  // 1. Recurring template (from last week, open-ended), filled slot by slot through the service.
  const tpl = await duty.createTemplate(schoolId, userId, { name: 'תבנית קבועה — שנת הלימודים', effectiveFrom: Wm1, effectiveUntil: null })
  const perWeek = new Map<string, number>(), perDay = new Map<string, number>(), busy = new Set<string>()
  let rot = 0, entries = 0
  for (const pass of [0, 1]) for (const day of SCHOOL_DAYS) for (const p of PERIODS) {
    if (!p.weekdays.includes(day)) continue
    for (const l of pass === 0 ? REQUIRED : p.at) {
      if (LEAVE_EMPTY.has(`${day}|${p.name}|${l}`)) continue
      const periodId = per.get(p.name)!, locationId = loc.get(l)!
      const order = regular.map((_, i) => regular[(rot + i) % regular.length]).sort((a, b) => (perWeek.get(a) ?? 0) - (perWeek.get(b) ?? 0))
      for (const staffId of order) {
        const s = staffRule.get(staffId)!
        if (busy.has(`${day}|${periodId}|${staffId}`) || (perDay.get(`${day}|${staffId}`) ?? 0) >= (s.maxPerDay ?? 2) || (perWeek.get(staffId) ?? 0) >= (s.maxPerWeek ?? 6) - pass) continue // optional places keep one free duty a week (substitutes, one-time changes)
        if ((s.unavailable as { weekday: number; periodId: string | null }[] ?? []).some(u => u.weekday === day && (!u.periodId || u.periodId === periodId))) continue
        const ok = await tryDuty(() => duty.saveTemplateEntry(schoolId, userId, tpl.id, { weekday: day, periodId, locationId, staffId }))
        if (!ok) continue
        busy.add(`${day}|${periodId}|${staffId}`); perDay.set(`${day}|${staffId}`, (perDay.get(`${day}|${staffId}`) ?? 0) + 1); perWeek.set(staffId, (perWeek.get(staffId) ?? 0) + 1)
        entries++; rot++
        break
      }
    }
  }
  log(`recurring template: ${entries} weekly duties`)

  // 2. Last week (follows the template): the expired temporary teacher's duties while she was valid, then published (history).
  const expired = roleOf.get('temp-expired')!
  let added = 0
  for (const d of [0, 1, 2]) {
    const date = addDays(Wm1, d)
    for (const p of ['הפסקה ראשונה', 'הפסקה שנייה']) for (const l of ['קפיטריה', 'מגרש ספורט']) {
      if (added >= 2) break
      if (await tryDuty(() => duty.assign(schoolId, userId, { weekStart: Wm1, date, periodId: per.get(p)!, locationId: loc.get(l)!, staffId: expired }))) added++
    }
  }
  await duty.publishWeek(schoolId, userId, Wm1)
  log(`last week: published (${added} duties of the expired temporary teacher kept in history)`)

  // 3. Current week (hybrid): one-time change, sick teacher, approved substitute, then published.
  const view = async () => duty.weekView(schoolId, W0)
  let w = await view()
  const onDay = (date: string) => w.assignments.filter(a => a.date === date && a.origin === 'template')
  const laterDay = weekdayOf(demoDay) < 4 ? addDays(demoDay, 1) : demoDay
  const target = onDay(laterDay).find(a => a.periodId === per.get('הפסקה ראשונה') && a.locationId === loc.get('חצר ראשית')) ?? onDay(laterDay)[0]
  let override = null as null | { date: string; from: string; to: string }
  if (target) for (const staffId of regular) {
    if (staffId === target.staffId) continue
    if (await tryDuty(() => duty.moveAssignment(schoolId, userId, target.id, { staffId, weekStart: W0 }))) { override = { date: laterDay, from: target.staffId, to: staffId }; break }
  }
  log(`one-time change: ${override ? `on ${override.date}` : 'not possible'}`)

  w = await view()
  const countOn = (staffId: string) => onDay(demoDay).filter(a => a.staffId === staffId).length
  const byLoad = [...new Set(onDay(demoDay).map(a => a.staffId))].sort((a, b) => countOn(b) - countOn(a))
  const sick = byLoad.find(id => countOn(id) >= 2 && id !== override?.to) ?? byLoad[0]
  await duty.addAbsence(schoolId, userId, { staffId: sick, date: demoDay, periodId: null, reason: 'מורה חולה' })
  const course = byLoad.find(id => id !== sick && id !== override?.to && countOn(id) >= 1)!
  await duty.addAbsence(schoolId, userId, { staffId: course, date: demoDay, periodId: null, reason: 'השתלמות — מחליף אושר' })
  w = await view()
  let substitutes = 0
  for (const a of onDay(demoDay).filter(a => a.staffId === course)) {
    const list = await duty.suggestions(schoolId, W0, { date: a.date, periodId: a.periodId, locationId: a.locationId }, a.staffId)
    for (const s of list) if (await tryDuty(() => duty.approveSubstitution(schoolId, userId, a.id, s.staffId))) { substitutes++; break }
  }
  w = await view()
  const gap = onDay(demoDay).find(a => a.locationId === loc.get('שער כניסה') && a.periodId === per.get('הפסקה שלישית') && a.staffId !== sick && a.staffId !== course)
    ?? onDay(demoDay).find(a => REQUIRED.some(n => loc.get(n) === a.locationId) && a.staffId !== sick && a.staffId !== course)
  if (gap) await duty.unassign(schoolId, userId, gap.id)
  log(`uncovered duty on the demo day: ${gap ? 'yes' : 'no'}`)
  await duty.publishWeek(schoolId, userId, W0)
  log(`current week: published; sick teacher with ${countOn(sick)} duties left without a substitute, ${substitutes} duties covered by an approved substitute`)

  // 4. Next week: planned independently (own rows), with two changes; draft only.
  await duty.setWeekTemplate(schoolId, userId, W1, false)
  const w1 = await duty.weekView(schoolId, W1)
  const rows = w1.assignments.filter(a => a.origin === 'week')
  for (const a of rows.filter(a => weekdayOf(a.date) === 1 && a.locationId === loc.get('קפיטריה')).slice(0, 1)) await tryDuty(() => duty.unassign(schoolId, userId, a.id))
  const future = roleOf.get('temp-future')!
  for (const d of [1, 3]) {
    for (const p of ['הפסקה ראשונה', 'הפסקה שנייה']) {
      const slot = { date: addDays(W1, d), periodId: per.get(p)!, locationId: loc.get('קפיטריה')! }
      if (!(await duty.weekView(schoolId, W1)).assignments.some(a => a.date === slot.date && a.periodId === slot.periodId && a.locationId === slot.locationId)) {
        if (await tryDuty(() => duty.assign(schoolId, userId, { weekStart: W1, ...slot, staffId: future }))) break
      }
    }
  }
  log('next week: independent draft (not published)')

  // 5. In two weeks: follows the template, with a one-time change (draft).
  const w2 = await duty.weekView(schoolId, W2)
  const t2 = w2.assignments.find(a => a.origin === 'template' && weekdayOf(a.date) === 2 && a.periodId === per.get('הפסקה שנייה'))
  if (t2) for (const staffId of regular) { if (staffId !== t2.staffId && await tryDuty(() => duty.moveAssignment(schoolId, userId, t2.id, { staffId, weekStart: W2 }))) break }
  log('in two weeks: template week with a one-time change (draft)')
}

async function resetDemoSchedules(schoolId: string) {
  log('resetting the demo school schedules')
  await db.$transaction([
    db.dutySubstitution.deleteMany({ where: { schoolId } }),
    db.dutyAbsence.deleteMany({ where: { schoolId } }),
    db.dutyTemplateSkip.deleteMany({ where: { schoolId } }),
    db.dutyAssignment.deleteMany({ where: { schoolId } }),
    db.dutyWeek.deleteMany({ where: { schoolId } }),
    db.dutyTemplate.deleteMany({ where: { schoolId } }),
  ])
}

// ── Demo screens ────────────────────────────────────────────────────────────────

const ANNOUNCEMENTS = [
  { title: 'ברוכים הבאים ללוח התורנויות', body: '<p>הלוח מתעדכן אוטומטית מתוך מערכת התורנויות. אם אינכם מוצאים את שמכם — פנו לרכז/ת התורנויות.</p>', priority: 'MEDIUM' as const },
  { title: 'תזכורת לתורנים', body: '<p>נא להגיע לעמדת התורנות בתחילת ההפסקה ולהישאר עד סופה. בימי גשם התורנות עוברת למסדרונות.</p>', priority: 'LOW' as const },
  { title: 'יום ספורט בית ספרי', body: '<p>ביום חמישי הקרוב יתקיים יום ספורט במגרש. התורנות במגרש תתוגבר בהתאם.</p>', priority: 'LOW' as const },
]

async function seedScreens(schoolId: string) {
  const now = new Date(), until = new Date(Date.now() + 120 * 864e5)
  const annIds: string[] = []
  for (const a of ANNOUNCEMENTS) {
    const f = await db.announcement.findFirst({ where: { schoolId, title: a.title } })
    annIds.push(f?.id ?? (await db.announcement.create({ data: { schoolId, title: a.title, body: a.body, priority: a.priority, showTitle: true, active: true, startAt: now, endAt: until, daysOfWeek: [], attachmentDisplayMode: 'together', attachmentSlideSeconds: 8 } })).id)
  }
  const slug = () => `bazz-duty-${randomBytes(6).toString('hex')}` // not guessable from the name
  const roster = (mode: string, title: string) => ({ contentType: 'DUTY_ROSTER' as const, settings: { title, mode } })
  const screens = [
    { name: 'BazZ — הדגמת תורנויות', template: 'split', items: [roster('day', 'תורנויות היום'), { contentType: 'ANNOUNCEMENT' as const, settings: { selectedAnnouncementIds: annIds, rotationSecs: 12 } }, { contentType: 'TEXT' as const, textContent: '<p><strong>בית ספר הדגמה — BazZ</strong></p><p>לוח התורנויות שמוצג כאן הוא הלוח שפורסם.</p>' }] },
    { name: 'BazZ — תורנויות · אוטומטי', template: null, items: [roster('auto', 'תורנות עכשיו / הבאה')] },
    { name: 'BazZ — תורנויות · הפסקה נוכחית', template: null, items: [roster('current', 'תורנות עכשיו')] },
    { name: 'BazZ — תורנויות · הפסקה הבאה', template: null, items: [roster('next', 'התורנות הבאה')] },
  ]
  for (const s of screens) {
    if (await db.screen.findFirst({ where: { schoolId, name: s.name } })) continue
    const created = await db.screen.create({ data: {
      schoolId, name: s.name, slug: slug(), orientation: 'LANDSCAPE', width: 1920, height: 1080,
      layout: { create: { mainSections: s.items.length, headerEnabled: true, headerHeight: 100, footerEnabled: true, footerHeight: 60, footerTicker: 'בית ספר הדגמה — BazZ · נתוני הדגמה בלבד', bgColor: `${s.template ? `layout:${s.template}|` : ''}surface:unified|theme:midnight-gold` } },
      sections: { create: s.items.map((it, i) => ({ position: i, widthPct: s.template === 'split' ? (i === 0 ? 70 : 30) : Math.round(100 / s.items.length),
        contentItems: { create: [{ contentType: it.contentType, active: true, settings: 'settings' in it ? it.settings : undefined, textContent: 'textContent' in it ? it.textContent : null }] } })) },
    } })
    if (s.items.some(i => i.contentType === 'ANNOUNCEMENT')) await db.announcementScreen.createMany({ data: annIds.map(announcementId => ({ announcementId, screenId: created.id, sectionPosition: 1 })), skipDuplicates: true })
    log(`screen created: ${s.name}`)
  }
}

async function summary(schoolId: string) {
  const [staff, locations, periods, templates, entries, weeks, published, rows, absences, subs, screens] = await Promise.all([
    db.dutyStaff.count({ where: { schoolId } }), db.dutyLocation.count({ where: { schoolId } }), db.dutyPeriod.count({ where: { schoolId } }),
    db.dutyTemplate.count({ where: { schoolId } }), db.dutyTemplateEntry.count({ where: { schoolId } }), db.dutyWeek.count({ where: { schoolId } }),
    db.dutyWeek.count({ where: { schoolId, publishedAt: { not: null } } }), db.dutyAssignment.count({ where: { schoolId } }),
    db.dutyAbsence.count({ where: { schoolId } }), db.dutySubstitution.count({ where: { schoolId, cancelledAt: null } }), db.screen.findMany({ where: { schoolId }, select: { name: true, slug: true } }),
  ])
  log(JSON.stringify({ staff, locations, periods, templates, templateEntries: entries, weeks, publishedWeeks: published, weekRows: rows, absences, substitutions: subs }))
  for (const s of screens) log(`screen: ${s.name} → /screen/${s.slug}`)
}

// ── Cleanup (separate, explicit) ────────────────────────────────────────────────

async function cleanup(confirm: string | undefined) {
  if (confirm !== DEMO_SLUG) throw new Stop(`Cleanup deletes the demo school and all its data. To confirm, run: npm run demo:cleanup -- --confirm=${DEMO_SLUG}`)
  const school = await demoSchool(false)
  if (!school) { log('no demo school: nothing to delete'); return }
  const users = await db.user.findMany({ where: { schoolId: school.id }, select: { id: true, name: true } })
  const others = users.filter(u => u.name !== DEMO_ADMIN_NAME)
  if (others.length) throw new Stop(`The demo school has ${others.length} user(s) that the seed did not create; nothing was deleted. Remove or move them first.`)
  await db.$transaction([
    db.user.deleteMany({ where: { schoolId: school.id, name: DEMO_ADMIN_NAME } }),
    db.school.delete({ where: { id: school.id } }), // cascades to the school's own records only
  ])
  log(`deleted the demo school "${DEMO_NAME}" (${users.length} demo login(s))`)
}

// ── Entry ───────────────────────────────────────────────────────────────────────

const [cmd = 'seed', ...args] = process.argv.slice(2)
const flag = (n: string) => args.find(a => a === `--${n}` || a.startsWith(`--${n}=`))
const run = cmd === 'cleanup' ? () => cleanup(flag('confirm')?.split('=')[1]) : cmd === 'seed' ? () => seed(!!flag('reset-schedule')) : null
if (!run) { console.error('usage: duty-demo.ts seed [--reset-schedule] | cleanup --confirm=' + DEMO_SLUG); process.exit(2) }
run()
  .then(() => db.$disconnect())
  .catch(async e => {
    console.error('[demo] stopped:', e instanceof Stop ? e.message : (e instanceof Error ? e.message.split('\n')[0] : 'error'))
    await db.$disconnect().catch(() => {})
    process.exit(1)
  })
