import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { unlink } from 'fs/promises'
import path from 'path'
import { requireRole } from '@/lib/auth'
function err(m:string,s:number){return NextResponse.json({error:m},{status:s})}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('VIEWER')
    const sc = user.schoolId
    const gallery = await db.gallery.findFirst({
      where: { id: params.id, ...(user.role !== 'SUPER_ADMIN' && sc ? { schoolId: sc } : {}) },
      include: { files: { where: { hidden: false }, orderBy: { uploadedAt: 'desc' } } },
    })
    if (!gallery) return err('Not found', 404)
    return NextResponse.json({
      data: {
        id: gallery.id, name: gallery.name, description: gallery.description, coverUrl: gallery.coverUrl,
        files: gallery.files.map(f => ({ id: f.id, url: f.url, originalName: f.originalName, caption: f.caption, size: f.size, uploadedAt: f.uploadedAt.toISOString() })),
        createdAt: gallery.createdAt.toISOString(), updatedAt: gallery.updatedAt.toISOString(),
      }
    })
  } catch (e:any) {
    if (e.message === 'Unauthorized') return err('Unauthorized', 401)
    return err('Server error', 500)
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('EDITOR')
    const sc = user.schoolId
    const gallery = await db.gallery.findFirst({ where: { id: params.id, ...(user.role !== 'SUPER_ADMIN' && sc ? { schoolId: sc } : {}) } })
    if (!gallery) return err('Not found', 404)
    const { name, description } = await req.json()
    const updated = await db.gallery.update({ where: { id: params.id }, data: { name: name ?? gallery.name, description: description ?? null } })
    return NextResponse.json({ data: { id: updated.id, name: updated.name, description: updated.description } })
  } catch (e:any) {
    if (e.message === 'Unauthorized') return err('Unauthorized', 401)
    return err('Server error', 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('EDITOR')
    const sc = user.schoolId
    const gallery = await db.gallery.findFirst({ where: { id: params.id, ...(user.role !== 'SUPER_ADMIN' && sc ? { schoolId: sc } : {}) } })
    if (!gallery) return err('Not found', 404)
    // Delete only media records belonging to this folder. Independently uploaded copies remain untouched.
    const files = await db.mediaFile.findMany({ where: { galleryId: params.id, schoolId: gallery.schoolId }, select: { id: true, url: true } })
    await db.$transaction(async tx => {
      await tx.mediaFile.deleteMany({ where: { galleryId: params.id, schoolId: gallery.schoolId } })
      await tx.gallery.delete({ where: { id: params.id } })
    })
    for (const file of files) {
      if (!/^\/uploads\/[a-zA-Z0-9._-]+$/.test(file.url)) continue
      try { await unlink(path.join(process.cwd(), 'public', file.url.slice(1))) } catch (e) { console.error('Media cleanup failed', file.id, e) }
    }
    return NextResponse.json({ ok: true })
  } catch (e:any) {
    if (e.message === 'Unauthorized') return err('Unauthorized', 401)
    return err('Server error', 500)
  }
}
