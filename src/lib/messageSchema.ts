import { z } from 'zod'

// Fields a client may set on a message. id, schoolId, createdAt and updatedAt are
// server-managed; `.strict()` turns any other key into a 400 instead of writing it.
const color = z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i)
const fields = {
  title:     z.string().trim().min(1).max(200),
  body:      z.string().trim().min(1).max(5000),
  priority:  z.enum(['info', 'warning', 'urgent']),
  icon:      z.string().max(16),
  bgColor:   color,
  textColor: color,
  active:    z.boolean(),
}

export const MessageCreateSchema = z.object({
  ...fields,
  priority:  fields.priority.default('info'),
  icon:      fields.icon.default('📢'),
  bgColor:   fields.bgColor.default('#1e3a5f'),
  textColor: fields.textColor.default('#ffffff'),
  active:    fields.active.default(true),
}).strict()

export const MessageUpdateSchema = z.object(fields).partial().strict()
  .refine(v => Object.keys(v).length > 0, { message: 'No fields to update' })
