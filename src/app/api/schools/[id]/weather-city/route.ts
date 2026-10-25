import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

export async function PUT(req: NextRequest, {params}: {params:{id:string}}) {
  try {
    const user = await requireRole('EDITOR')
    if (user.role !== 'SUPER_ADMIN' && user.schoolId !== params.id) return NextResponse.json({error:'Forbidden'}, {status:403})
    const body = await req.json()
    const city = typeof body.city === 'string' ? body.city.trim() : ''
    const cityPattern = /^[\p{L}\p{M} .,'’\-]{2,80}$/u
    const coordinatePattern = /^(\d{1,2}(?:\.\d+)?),(\d{1,3}(?:\.\d+)?)\|(.{2,80})$/u
    const location = city.match(coordinatePattern)
    if (city && !location && !cityPattern.test(city)) return NextResponse.json({error:'שם עיר לא תקין'}, {status:400})
    if (city.includes('|')) {
      if (!location || !cityPattern.test(location[3])) return NextResponse.json({error:'שם עיר לא תקין'},{status:400})
      const lat = Number(location[1]), lon = Number(location[2])
      if (!(lat>=29 && lat<=34 && lon>=34 && lon<=36)) return NextResponse.json({error:'יש לבחור יישוב בישראל'},{status:400})
    }
    const school = await db.school.update({where:{id:params.id},data:{weatherCity:city || null},select:{weatherCity:true}})
    return NextResponse.json(school)
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return NextResponse.json({error:'Unauthorized'}, {status:401})
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({error:'Forbidden'}, {status:403})
    return NextResponse.json({error:'Server error'}, {status:500})
  }
}
