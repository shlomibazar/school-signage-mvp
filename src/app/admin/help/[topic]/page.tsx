import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/Display'
import HelpTopicView from '@/components/admin/help/HelpTopicView'
import { HELP_TOPICS, helpTopic } from '@/lib/help/topics'

export function generateStaticParams() {
  return HELP_TOPICS.map(t => ({ topic: t.id }))
}

export default async function HelpTopicPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic: id } = await params
  const topic = helpTopic(id)
  if (!topic) notFound()
  return (
    <div className="mx-auto w-full max-w-3xl" dir="rtl">
      <Link href="/admin/help" className="ui-focus mb-3 inline-flex items-center gap-1 rounded text-sm text-ui-primary hover:underline">
        <ArrowRight className="h-4 w-4" aria-hidden="true" />כל נושאי העזרה
      </Link>
      <PageHeader title={topic.title} />
      <div className="rounded-ui-lg border border-ui-border bg-ui-surface p-5 shadow-ui sm:p-6">
        <HelpTopicView topic={topic} />
      </div>
    </div>
  )
}
