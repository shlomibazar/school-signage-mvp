// Shared types and labels of the birthday management page (client side).

export type Role = 'STUDENT' | 'TEACHER'
export type Source = 'MANUAL' | 'EXCEL' | 'SMARTSCHOOL'

export type ListItem = {
  id: string; firstName: string; lastName: string; birthDay: number; birthMonth: number
  gender: 'MALE' | 'FEMALE' | null; active: boolean; roleActive: boolean
  grade: string | null; parallel: number | null; className: string | null
  dataSource: Source; identityHint: string | null; otherRole: boolean; updatedAt: string
}

export type Detail = {
  id: string; firstName: string; lastName: string; birthDate: string; gender: 'MALE' | 'FEMALE' | null
  active: boolean; dataSource: Source; identityHint: string | null; hasIdentity: boolean
  roles: { role: Role; grade: string | null; parallel: number | null; className: string | null; active: boolean }[]
}

export const ROLE_LABEL: Record<Role, string> = { STUDENT: 'תלמיד', TEACHER: 'מורה' }
export const SOURCE_LABEL: Record<Source, string> = { MANUAL: 'ידני', EXCEL: 'אקסל', SMARTSCHOOL: 'SmartSchool' }
export const GRADES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ז׳', 'ח׳', 'ט׳', 'י׳', 'י״א', 'י״ב', 'י״ג', 'י״ד']
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

/** "12 במרץ" — day and month only. */
export const birthdayLabel = (day: number, month: number) => `${day} ב${MONTHS[month - 1] ?? ''}`

/** The API's Hebrew error, or a fallback. */
export async function apiError(res: Response, fallback: string): Promise<{ message: string; body: Record<string, unknown> }> {
  const body = await res.json().catch(() => ({})) as Record<string, unknown>
  const message = typeof body.error === 'string' && /[֐-׿]/.test(body.error) ? body.error
    : res.status === 401 ? 'נדרשת התחברות מחדש' : res.status === 403 ? 'אין לך הרשאה לפעולה הזו' : fallback
  return { message, body }
}
