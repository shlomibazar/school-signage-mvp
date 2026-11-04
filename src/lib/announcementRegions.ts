import { Prisma, type PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/apiErrors'

// Announcement "regions": the ANNOUNCEMENT content items of a school's screens. Which
// announcements a region shows is the ordered list settings.selectedAnnouncementIds on that
// content item (unchanged data model). Every change to these lists goes through this module:
//   - rows are locked (SELECT ... FOR UPDATE) inside the caller's transaction and re-read, so
//     two admins changing assignments at the same time never overwrite each other;
//   - only the given announcement's id is added or removed; the rest of the list (order and
//     other ids) and every other setting of the region stay as they are;
//   - new assignments go to the end of the rotation; an id is never added twice.

type Tx = Prisma.TransactionClient | PrismaClient

export type RegionInfo = {
  id: string            // content item id
  title: string         // the region's heading (sectionTitle) or a generic name
  position: number      // section position
  positionLabel: string // where it is on the screen, in words
  active: boolean       // content item enabled
  announcementIds: string[]
}
export type ScreenRegions = { id: string; name: string; active: boolean; regions: RegionInfo[] }

const settingsOf = (value: Prisma.JsonValue | null): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const idsOf = (settings: Record<string, unknown>): string[] =>
  Array.isArray(settings.selectedAnnouncementIds) ? settings.selectedAnnouncementIds.filter((x): x is string => typeof x === 'string') : []

/** Position in words. Landscape regions run right to left (RTL); portrait ones top to bottom. */
export function positionLabel(position: number, count: number, portrait: boolean): string {
  if (count <= 1) return 'האזור המרכזי'
  const words = portrait
    ? (count === 2 ? ['למעלה', 'למטה'] : ['למעלה', 'באמצע', 'למטה'])
    : (count === 2 ? ['צד ימין', 'צד שמאל'] : ['צד ימין', 'באמצע', 'צד שמאל'])
  return words[position] ?? `אזור ${position + 1}`
}

const regionQuery = (schoolIds: string[]) => ({
  where: { contentType: 'ANNOUNCEMENT' as const, section: { screen: { schoolId: { in: schoolIds } } } },
  select: {
    id: true, active: true, settings: true,
    section: { select: { position: true, screen: { select: { id: true, schoolId: true, name: true, active: true, orientation: true, layout: { select: { mainSections: true } } } } } },
  },
})

/**
 * Screens of the given schools with their visible announcement regions (sections beyond the
 * layout's mainSections are not shown on the TV and are left out). Screens without an
 * announcement region are included with an empty list, so the UI can explain why.
 */
export async function listScreenRegions(schoolIds: string[], client: Tx = db): Promise<(ScreenRegions & { schoolId: string })[]> {
  if (!schoolIds.length) return []
  const [screens, items] = await Promise.all([
    client.screen.findMany({ where: { schoolId: { in: schoolIds } }, select: { id: true, schoolId: true, name: true, active: true }, orderBy: { name: 'asc' } }),
    client.contentItem.findMany({ ...regionQuery(schoolIds), orderBy: { createdAt: 'asc' } }),
  ])
  const byScreen = new Map(screens.map(s => [s.id, { ...s, regions: [] as RegionInfo[] }]))
  for (const item of items) {
    const screen = item.section.screen
    const visible = screen.layout?.mainSections ?? 1
    if (item.section.position >= visible) continue
    const settings = settingsOf(item.settings)
    const title = typeof settings.sectionTitle === 'string' && settings.sectionTitle.trim() ? settings.sectionTitle.trim() : 'הודעות כלליות'
    byScreen.get(screen.id)?.regions.push({
      id: item.id, title, position: item.section.position,
      positionLabel: positionLabel(item.section.position, visible, screen.orientation === 'PORTRAIT'),
      active: item.active, announcementIds: idsOf(settings),
    })
  }
  for (const s of byScreen.values()) s.regions.sort((a, b) => a.position - b.position)
  return [...byScreen.values()]
}

/** Where each announcement is shown: announcement id → [{ screen, region }]. */
export function displayedIn(screens: ScreenRegions[]) {
  const map = new Map<string, { screenId: string; screenName: string; regionId: string; regionTitle: string; positionLabel: string; regionsOnScreen: number }[]>()
  for (const s of screens) for (const r of s.regions) for (const id of new Set(r.announcementIds)) {
    const list = map.get(id) ?? []
    list.push({ screenId: s.id, screenName: s.name, regionId: r.id, regionTitle: r.title, positionLabel: r.positionLabel, regionsOnScreen: s.regions.length })
    map.set(id, list)
  }
  return map
}

/** Locks every announcement region of the school for the rest of the transaction (always in id
 *  order, so concurrent transactions queue up instead of deadlocking). */
async function lockSchoolRegions(tx: Tx, schoolId: string) {
  await tx.$queryRaw`
    SELECT ci.id FROM content_items ci
    JOIN screen_sections ss ON ss.id = ci."sectionId"
    JOIN screens s ON s.id = ss."screenId"
    WHERE ci."contentType" = 'ANNOUNCEMENT' AND s."schoolId" = ${schoolId}
    ORDER BY ci.id
    FOR UPDATE OF ci`
}

/**
 * Makes the announcement appear in exactly the given regions of its school (visible regions
 * only; hidden sections are never touched). Unknown, other-school or non-announcement region
 * ids are rejected with a 400 before anything changes. Must run inside a transaction.
 */
export async function setAnnouncementRegions(tx: Tx, announcementId: string, schoolId: string, regionIds: string[]) {
  await lockSchoolRegions(tx, schoolId)
  const screens = await listScreenRegions([schoolId], tx)
  const regions = screens.flatMap(s => s.regions)
  const known = new Set(regions.map(r => r.id))
  const wanted = new Set(regionIds)
  for (const id of wanted) if (!known.has(id)) throw new HttpError(400, 'אחד מאזורי ההודעות שנבחרו אינו זמין')
  for (const region of regions) {
    const has = region.announcementIds.includes(announcementId)
    const want = wanted.has(region.id)
    if (has === want) continue
    const item = await tx.contentItem.findUnique({ where: { id: region.id }, select: { settings: true } })
    const settings = settingsOf(item?.settings ?? null)
    const ids = idsOf(settings)
    const next = want ? [...ids.filter(x => x !== announcementId), announcementId] : ids.filter(x => x !== announcementId)
    await tx.contentItem.update({ where: { id: region.id }, data: { settings: { ...settings, selectedAnnouncementIds: next } as Prisma.InputJsonObject } })
  }
}

/** Removes the announcement from every region of the school, including hidden sections. */
export async function removeAnnouncementEverywhere(tx: Tx, announcementId: string, schoolId: string) {
  await lockSchoolRegions(tx, schoolId)
  const items = await tx.contentItem.findMany({ ...regionQuery([schoolId]) })
  for (const item of items) {
    const settings = settingsOf(item.settings)
    const ids = idsOf(settings)
    if (!ids.includes(announcementId)) continue
    await tx.contentItem.update({ where: { id: item.id }, data: { settings: { ...settings, selectedAnnouncementIds: ids.filter(x => x !== announcementId) } as Prisma.InputJsonObject } })
  }
}
