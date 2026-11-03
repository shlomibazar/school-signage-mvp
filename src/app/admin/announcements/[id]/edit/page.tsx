import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { homeSchoolWhere } from '@/lib/schoolScope'
import { getCurrentUser } from '@/lib/auth'
import AnnouncementForm from '@/components/admin/AnnouncementForm'
export default async function EditAnnouncement({ params: paramsPromise }:{params: Promise<{id:string}>}){
  const params = await paramsPromise;const u=await getCurrentUser();if(!u)notFound();const a=await db.announcement.findFirst({where:{id:params.id,...homeSchoolWhere(u)}});if(!a)notFound();return <AnnouncementForm initial={{...a,startAt:a.startAt.toISOString(),endAt:a.endAt.toISOString(),createdAt:undefined,updatedAt:undefined} as any}/>}
