import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { toISOStringOrNull } from '@/lib/utils'
import { getDisplayTemplate, getTemplateWidths } from '@/lib/displayTemplates'

const LayoutSchema = z.object({
  layout: z.object({
    headerEnabled:       z.boolean(),
    headerHeight:        z.number().int().min(40).max(160).default(80),
    headerTitleFontSize: z.number().int().min(14).max(64).default(26),
    headerTitleFontWeight: z.number().int().refine(v=>[400,600,700].includes(v)).default(700),
    headerShowLogo:      z.boolean(),
    headerShowTitle:     z.boolean(),
    headerShowClock:     z.boolean(),
    headerShowDate:      z.boolean(),
    headerShowParasha:   z.boolean().default(false),
    headerShowHebDate:   z.boolean(),
    headerDateType:      z.enum(['HEBREW','GREGORIAN','BOTH']).default('BOTH'),
    headerShowWeather:   z.boolean(),
    headerScrollText:    z.string().nullable(),
    mainSections:        z.number().int().min(1).max(3),
    footerEnabled:       z.boolean(),
    footerHeight:        z.number().int().min(32).max(120).default(48),
    footerTicker:        z.string().nullable(),
    footerFeedMode: z.enum(['manual','rss','both']).default('manual'),
    footerRssUrl: z.string().max(2048).nullable().optional(),
    footerRssMaxItems: z.number().int().min(1).max(20).default(8),
    footerRssRefreshMinutes: z.number().int().min(5).max(60).default(15),
    footerTickerSpeed: z.enum(['slow','normal','fast']).default('normal'),
    footerShowSchoolName:z.boolean(),
    footerShowClock:     z.boolean(),
    footerShowBirthdays: z.boolean().default(false),
    bgColor:             z.string().nullable(),
    bgImageUrl:          z.string().nullable(),
    fontFamily: z.enum(["Heebo","Assistant","Rubik","Arial"]).default("Heebo"),
  }),
  sections: z.array(z.object({ position: z.number().int(), widthPct: z.number().min(1).max(100) })),
})

function err(m:string,s:number){ return NextResponse.json({error:m},{status:s}) }

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('EDITOR')
    const screen = await db.screen.findFirst({
      where: { id: params.id, ...(user.role !== 'SUPER_ADMIN' && user.schoolId ? { schoolId: user.schoolId } : {}) },
    })
    if (!screen) return err('מסך לא נמצא', 404)

    const body = await req.json()
    const { layout, sections } = LayoutSchema.parse(body)
    const cw = getTemplateWidths(getDisplayTemplate(layout.bgColor),layout.mainSections)
    const cs = sections.map((s, i) => ({ ...s, widthPct: Math.round(i < layout.mainSections ? (cw[i] ?? s.widthPct) : s.widthPct) }))

    await db.$transaction(async tx => {
      await tx.screenLayout.upsert({
        where:  { screenId: params.id },
        update: layout,
        create: { screenId: params.id, ...layout },
      })
      // Never delete hidden sections: their content must survive layout switches.
      for (const s of cs) {
        await tx.screenSection.upsert({
          where:  { screenId_position: { screenId: params.id, position: s.position } },
          update: { widthPct: s.widthPct },
          create: { screenId: params.id, position: s.position, widthPct: s.widthPct },
        })
      }
    })

    const saved = await db.screenSection.findMany({
      where: { screenId: params.id }, orderBy: { position: 'asc' },
      include: { contentItems: { orderBy: { createdAt: 'asc' } } },
    })

    return NextResponse.json({
      ok: true,
      sections: saved.map(s => ({
        id: s.id, screenId: s.screenId, position: s.position, widthPct: s.widthPct,
        contentItems: s.contentItems.map(ci => ({
          ...ci,
          startDate: toISOStringOrNull(ci.startDate), endDate: toISOStringOrNull(ci.endDate),
          createdAt: ci.createdAt.toISOString(), updatedAt: ci.updatedAt.toISOString(),
        })),
      })),
    })
  } catch (e: any) {
    if (e.message === 'Unauthorized') return err('Unauthorized', 401)
    if (e.message === 'Forbidden')    return err('Forbidden', 403)
    if (e instanceof z.ZodError)      return NextResponse.json({ error: e.errors }, { status: 400 })
    console.error('PUT layout', e)
    return err('Server error', 500)
  }
}
