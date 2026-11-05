// The message shown when saving content fails. The API answers in Hebrew where it can; anything
// else (English text, a list of validation issues, no body) becomes a Hebrew message by status,
// so the user never sees "Invalid request" or "[object Object]".

const hasHebrew = (s: string) => /[֐-׿]/.test(s)

export function saveErrorMessage(status: number, body: unknown): string {
  const error = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined
  if (typeof error === 'string' && hasHebrew(error)) return error
  if (status === 401) return 'פג תוקף ההתחברות. התחברו מחדש ונסו שוב.'
  if (status === 403) return 'אין לך הרשאה לשנות את תוכן המסך.'
  if (status === 404) return 'האזור או המסך לא נמצאו. ייתכן שנמחקו — רעננו את הדף.'
  if (status === 409) return 'התוכן השתנה בינתיים. רעננו את הדף ונסו שוב.'
  if (status === 413) return 'התוכן גדול מדי לשמירה.'
  if (status >= 400 && status < 500) return 'השרת לא קיבל את התוכן. בדקו את השדות ונסו שוב.'
  return 'שמירת התוכן נכשלה. נסו שוב בעוד רגע.'
}
