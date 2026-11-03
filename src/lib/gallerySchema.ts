import { z } from 'zod'

// Folder (gallery) fields accepted from the admin. Unknown fields are ignored.
export const galleryCreateSchema = z.object({
  name: z.string().trim().min(1, 'יש להזין שם תיקייה').max(100, 'שם התיקייה ארוך מדי'),
  description: z.string().trim().max(500).nullish(),
})

export const galleryUpdateSchema = galleryCreateSchema.partial()
