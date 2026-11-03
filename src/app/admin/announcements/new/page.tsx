import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import AnnouncementForm from '@/components/admin/AnnouncementForm'
import ViewOnlyNotice from '@/components/admin/ViewOnlyNotice'

export default async function NewAnnouncement() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')
  // Creating announcements needs EDITOR or higher (API rule); viewers get a notice.
  if (user.role === 'VIEWER') return <ViewOnlyNotice title="הודעה חדשה" />
  return <AnnouncementForm />
}
