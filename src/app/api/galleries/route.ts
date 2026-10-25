import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
function err(m:string,s:number){return NextResponse.json({error:m},{status:s})}

export async function GET() {
  try {
    const user = await requireRole('VIEWER')
    const schoolId = user.role === 'SUPER_ADMIN' ? undefined : (user.schoolId ?? undefined)
    const galleries = await db.gallery.findMany({
      where: schoolId ? { schoolId } : {},
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { files: true } } },
    })
    return NextResponse.json({
      data: galleries.map(g => ({
        id: g.id, name: g.name, description: g.description, coverUrl: g.coverUrl,
        fileCount: g._count.files,
        createdAt: g.createdAt.toISOString(), updatedAt: g.updatedAt.toISOString(),
      }))
    })
  } catch (e:any) {
    if (e.message === 'Unauthorized') return err('Unauthorized', 401)
    return err('Server error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('EDITOR')
    if (!user.schoolId && user.role !== 'SUPER_ADMIN') return err('No school', 400)
    const { name, description } = await req.json()
    if (!name?.trim()) return err('Name required', 400)
    const gallery = await db.gallery.create({
      data: { schoolId: user.schoolId!, name: name.trim(), description: description ?? null }
    })
    return NextResponse.json({
      data: { id: gallery.id, name: gallery.name, description: gallery.description, coverUrl: null, fileCount: 0,
              createdAt: gallery.createdAt.toISOString(), updatedAt: gallery.updatedAt.toISOString() }
    }, { status: 201 })
  } catch (e:any) {
    if (e.message === 'Unauthorized') return err('Unauthorized', 401)
    return err('Server error', 500)
  }
}
