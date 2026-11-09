import Link from 'next/link'
import { Rocket, ArrowLeft, Monitor, Palette, LayoutGrid, Images, Megaphone, CalendarClock, Cake, Tv, Wifi, LifeBuoy, BookOpen } from 'lucide-react'
import { PageHeader } from '@/components/ui/Display'
import { HELP_TOPICS } from '@/lib/help/topics'

// Help Center index: static content (no database, no API).
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'getting-started': BookOpen, screens: Monitor, design: Palette, content: LayoutGrid, media: Images, announcements: Megaphone,
  timetable: CalendarClock, birthdays: Cake, 'tv-connection': Tv, 'connection-status': Wifi, troubleshooting: LifeBuoy,
}

export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-5xl" dir="rtl">
      <PageHeader title="עזרה והדרכה" description="הסברים קצרים, צעד אחר צעד, לכל מה שאפשר לעשות במערכת המסכים." />

      <Link href="/admin/help/quick-start" className="ui-focus group mb-6 flex items-center gap-4 rounded-ui-lg border border-ui-primary-line bg-ui-primary-soft p-5 hover:border-ui-primary">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ui-primary text-white"><Rocket className="h-6 w-6" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-ui-ink">התחלה מהירה: המסך הראשון שלכם</span>
          <span className="mt-0.5 block text-sm text-ui-ink-2">עשרה צעדים קצרים, מיצירת מסך ועד טלוויזיה שמציגה אותו. אפשר לעשות אותם בכל סדר.</span>
        </span>
        <ArrowLeft className="h-5 w-5 shrink-0 text-ui-primary transition-transform group-hover:-translate-x-1" aria-hidden="true" />
      </Link>

      <h2 className="mb-3 text-sm font-semibold text-ui-ink-2">כל הנושאים</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {HELP_TOPICS.map(topic => {
          const Icon = ICONS[topic.id] ?? BookOpen
          return (
            <li key={topic.id}>
              <Link href={`/admin/help/${topic.id}`} className="ui-focus flex h-full gap-3 rounded-ui-lg border border-ui-border bg-ui-surface p-4 shadow-ui hover:border-ui-border-strong hover:bg-ui-subtle">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-ui-sm bg-ui-subtle text-ui-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ui-ink">{topic.title}</span>
                  <span className="mt-1 line-clamp-3 block text-xs leading-relaxed text-ui-muted">{topic.summary}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
