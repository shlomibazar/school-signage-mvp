import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { gradeOrder } from './grades'
import { birthdaysInPeriod, periodDays, schoolToday, toPublicBirthday, type BirthdayPersonInput } from './birthdays'
import { MAX_PUBLIC_BIRTHDAYS, normalizeBirthdayConfig, isLegacyBirthdayCard, footerBirthdayConfig, type BirthdayDisplayConfig, type PublicBirthdayList } from '@/lib/birthdayDisplay'
import type { ContentItem, PublicScreenData } from '@/types'

// Birthdays for screens, computed on the server from the central registry (one query per page for
// all of a screen's birthday regions and its footer). The result holds only what is displayed: a
// display name, the class of students, the role and the day/month — never an id, an identifier, the
// birth year or the full date. Only active people with an active role of the screen's own school.

type Row = { id: string; firstName: string; lastName: string; birthDate: Date; role: 'STUDENT' | 'TEACHER'; grade: string | null; className: string | null }

/** Calendar months touched by the ranges of the configurations (so only those people are read). */
export function monthsFor(configs: BirthdayDisplayConfig[], now: Date, timeZone: string | null | undefined): number[] {
  const today = schoolToday(now, timeZone)
  const months = new Set<number>()
  for (const c of configs) for (const d of periodDays(c.period, today)) months.add(d.month)
  return [...months].sort((a, b) => a - b)
}

/** Active people of the school born in the given months, with their active roles. */
export async function loadBirthdayPeople(schoolId: string, months: number[]): Promise<BirthdayPersonInput[]> {
  if (!months.length) return []
  const rows = await db.$queryRaw<Row[]>`
    SELECT p."id", p."firstName", p."lastName", p."birthDate", r."role"::text AS "role", r."grade", r."className"
    FROM "people" p JOIN "person_roles" r ON r."personId" = p."id"
    WHERE p."schoolId" = ${schoolId} AND p."active" = true AND r."active" = true
      AND EXTRACT(MONTH FROM p."birthDate")::int IN (${Prisma.join(months)})
    ORDER BY p."id", r."role"`
  const people = new Map<string, BirthdayPersonInput>()
  for (const r of rows) {
    let p = people.get(r.id)
    if (!p) people.set(r.id, p = { id: r.id, firstName: r.firstName, lastName: r.lastName, birthDate: r.birthDate, active: true, roles: [] })
    p.roles.push({ role: r.role, grade: r.grade, className: r.className, active: true })
  }
  return [...people.values()]
}

/** The public list of one configuration. */
export function publicBirthdayList(people: BirthdayPersonInput[], config: BirthdayDisplayConfig, now: Date, timeZone: string | null | undefined): PublicBirthdayList {
  const matches = birthdaysInPeriod(people, {
    period: config.period, now, timeZone,
    roles: config.audience === 'ALL' ? ['STUDENT', 'TEACHER'] : [config.audience],
    grades: config.grades,
  })
  const today = schoolToday(now, timeZone)
  return {
    items: matches.slice(0, MAX_PUBLIC_BIRTHDAYS).map(m => toPublicBirthday(m, { lastName: config.nameFormat === 'full' })),
    today: { day: today.day, month: today.month },
    more: Math.max(0, matches.length - MAX_PUBLIC_BIRTHDAYS),
  }
}

/** Lists for several configurations of one school, with a single database query. */
export async function birthdayListsFor(schoolId: string, timeZone: string | null | undefined, configs: BirthdayDisplayConfig[], now = new Date()): Promise<PublicBirthdayList[]> {
  if (!configs.length) return []
  const people = await loadBirthdayPeople(schoolId, monthsFor(configs, now, timeZone))
  return configs.map(c => publicBirthdayList(people, c, now, timeZone))
}

/** Grades that active students of the school have (for the editor's grade filter), in school order. */
export async function schoolGrades(schoolId: string): Promise<string[]> {
  const rows = await db.personRole.findMany({
    where: { role: 'STUDENT', active: true, grade: { not: null }, person: { schoolId, active: true } },
    select: { grade: true }, distinct: ['grade'],
  })
  return rows.map(r => r.grade!).sort((a, b) => gradeOrder(a) - gradeOrder(b))
}

/**
 * Attaches birthday lists to a public screen's data: to every "ימי הולדת" region of the registry
 * kind (current and scheduled items) and to the footer when its birthday segment is on. A failure
 * leaves the lists empty (the screen itself must still load); only the error code is logged.
 */
export async function attachScreenBirthdays(data: PublicScreenData, now = new Date()): Promise<void> {
  const layout = data.screen.layout
  const regions = new Set<ContentItem>()
  for (const s of data.sections) for (const ci of [s.activeContent, ...(s.items ?? [])]) {
    if (ci && ci.contentType === 'BIRTHDAYS' && !isLegacyBirthdayCard(ci.settings)) regions.add(ci)
  }
  const footer = layout?.footerEnabled && layout.footerShowBirthdays ? footerBirthdayConfig(layout) : null
  if (!regions.size && !footer) return
  const items = [...regions]
  const configs = [...items.map(ci => normalizeBirthdayConfig(ci.settings)), ...(footer ? [footer] : [])]
  let lists: PublicBirthdayList[]
  try {
    lists = await birthdayListsFor(data.screen.schoolId, data.school.timezone, configs, now)
  } catch (e) {
    console.error(`Screen birthdays unavailable: ${e instanceof Prisma.PrismaClientKnownRequestError ? `Prisma ${e.code}` : e instanceof Error ? e.name : typeof e}`)
    const today = schoolToday(now, data.school.timezone)
    lists = configs.map(() => ({ items: [], today: { day: today.day, month: today.month }, more: 0 }))
  }
  items.forEach((ci, i) => { ci.settings = { ...(ci.settings as object), list: lists[i] } as ContentItem['settings'] })
  if (footer) data.footerBirthdays = lists[lists.length - 1]
}

