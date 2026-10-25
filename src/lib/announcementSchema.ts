import { z } from 'zod'
import { cleanAnnouncementHtml } from './announcementRichText'
export const schema=z.object({title:z.string().trim().min(1),body:z.string().trim().min(1).max(30000).transform(cleanAnnouncementHtml),priority:z.enum(['LOW','MEDIUM','HIGH','EMERGENCY']).default('LOW'),active:z.boolean().default(true),startAt:z.string().datetime(),endAt:z.string().datetime(),icon:z.string().nullable().optional()}).refine(v=>v.endAt>=v.startAt,{message:'תאריך סיום קודם לתאריך התחלה'})
