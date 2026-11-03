import Link from 'next/link'

// Shown instead of an editing page to roles the API would refuse (VIEWER): the page explains
// itself instead of offering a form whose save fails.
export default function ViewOnlyNotice({ title }: { title: string }) {
  return (
    <div dir="rtl" className="max-w-lg rounded-2xl border border-gray-100 bg-white p-8 text-center">
      <h1 className="text-lg font-semibold text-gray-900 mb-2">{title}</h1>
      <p className="text-sm text-gray-500 mb-4">להרשאת צפייה אין אפשרות לערוך. לשינויים יש לפנות למנהל בית הספר.</p>
      <Link href="/admin/screens" className="text-sm text-blue-600 hover:underline">חזרה לרשימת המסכים</Link>
    </div>
  )
}
