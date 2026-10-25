import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function ShortScreenPage({ params }: { params: { code: string } }) {
  if (!/^[A-Za-z0-9]{6,10}$/.test(params.code)) notFound()
  const screen = await db.screen.findUnique({
    where: { shortCode: params.code },
    select: { slug: true, active: true, school: { select: { active: true } } },
  })
  if (!screen?.active || !screen.school.active) notFound()
  redirect(`/screen/${screen.slug}`)
}
