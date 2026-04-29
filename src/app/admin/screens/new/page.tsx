// src/app/admin/screens/new/page.tsx
import NewScreenForm from './NewScreenForm'

export default function NewScreenPage() {
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">מסך חדש</h1>
      <p className="text-sm text-gray-500 mb-6">הגדר את פרטי המסך הבסיסיים. ניתן לשנות אחר כך.</p>
      <NewScreenForm />
    </div>
  )
}
