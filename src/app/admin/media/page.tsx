import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import MediaLibrary from './MediaLibrary'

// Uploading, editing captions, folders and deleting need EDITOR or higher (as in the API);
// a VIEWER gets the same library read-only.
export default async function MediaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')
  return <MediaLibrary canEdit={user.role !== 'VIEWER'} />
}
