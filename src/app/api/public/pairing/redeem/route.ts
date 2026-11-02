import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPairingClient, hashPairingCode } from '@/lib/pairing'

export const runtime = 'nodejs'
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const code = body?.code
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'יש להזין קוד בן 6 ספרות' }, { status: 400 })
    }
    // Prefer the edge-provided client address. Do not trust a caller-supplied arbitrary IP.
    const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    const ip = req.headers.get('cf-connecting-ip') || forwarded || 'unknown'
    const key = hashPairingClient(ip)
    const now = new Date()
    const windowStart = new Date(now.getTime() - 15 * 60_000)
    const attempts = await db.$transaction(async tx => {
      await tx.pairingRateLimit.upsert({
        where: { key },
        create: { key, count: 0, windowStart: now },
        update: {},
      })
      await tx.pairingRateLimit.updateMany({ where: { key, windowStart: { lt: windowStart } }, data: { count: 0, windowStart: now } })
      return tx.pairingRateLimit.update({ where: { key }, data: { count: { increment: 1 } } })
    })
    if (attempts.count > 10) return NextResponse.json({ error: 'יותר מדי ניסיונות. נסה שוב מאוחר יותר' }, { status: 429 })
    const codeHash = hashPairingCode(code)
    const result = await db.$transaction(async tx => {
      const pairing = await tx.screenPairingCode.findUnique({ where: { codeHash }, include: { screen: { select: { slug: true, active: true } } } })
      if (!pairing || pairing.usedAt || pairing.expiresAt <= now || !pairing.screen.active) return null
      const consumed = await tx.screenPairingCode.updateMany({ where: { id: pairing.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } })
      if (consumed.count !== 1) return null
      return pairing.screen.slug
    })
    if (!result) return NextResponse.json({ error: 'הקוד שגוי, פג תוקף או כבר נוצל' }, { status: 400 })
    return NextResponse.json({ screenUrl: `/screen/${encodeURIComponent(result)}` }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('pairing redeem', err)
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
