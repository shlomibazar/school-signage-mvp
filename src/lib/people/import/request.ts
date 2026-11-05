import { NextRequest } from 'next/server'
import { HttpError } from '@/lib/apiErrors'
import { XLSX_LIMITS } from './xlsx'
import type { ImportKind } from './columns'

// Reading an import upload: one .xlsx file (kept in memory only — never written to disk, storage or
// logs) and the import type chosen by the admin.

export async function readImportForm(req: NextRequest): Promise<{ buf: Buffer; fileName: string; kind: ImportKind; form: FormData }> {
  const length = Number(req.headers.get('content-length') ?? 0)
  if (length > XLSX_LIMITS.fileBytes + 64 * 1024) throw new HttpError(413, 'הקובץ גדול מדי (עד 5MB).')
  let form: FormData
  try { form = await req.formData() } catch { throw new HttpError(400, 'הבקשה אינה תקינה') }
  const file = form.get('file')
  if (!(file instanceof File)) throw new HttpError(400, 'יש לבחור קובץ Excel')
  if (file.size > XLSX_LIMITS.fileBytes) throw new HttpError(413, 'הקובץ גדול מדי (עד 5MB).')
  if (file.size === 0) throw new HttpError(400, 'הקובץ ריק')
  const name = file.name || 'file.xlsx'
  if (/\.xls$/i.test(name)) throw new HttpError(400, 'זהו קובץ Excel ישן (xls). שמרו אותו מחדש בפורמט xlsx ונסו שוב.')
  if (!/\.xlsx$/i.test(name)) throw new HttpError(400, 'יש לבחור קובץ Excel בפורמט xlsx')
  const kind = form.get('kind')
  if (kind !== 'STUDENT' && kind !== 'TEACHER') throw new HttpError(400, 'יש לבחור אם הקובץ הוא של תלמידים או של מורים')
  return { buf: Buffer.from(await file.arrayBuffer()), fileName: name.replace(/[\\/]/g, '_'), kind, form }
}
