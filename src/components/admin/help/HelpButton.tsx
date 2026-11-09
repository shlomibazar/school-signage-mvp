'use client'
import { useState } from 'react'
import Link from 'next/link'
import { HelpCircle, ExternalLink } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { helpTopic } from '@/lib/help/topics'
import HelpTopicView from './HelpTopicView'
import { cn } from '@/lib/utils'

// Contextual help: a small "עזרה" button that opens the matching topic in the existing Modal. It
// never navigates the current page (an editor with unsaved changes stays as it is); the full guide
// opens in a new tab. The topic content is static and its screenshot loads only when opened.
export default function HelpButton({ topic: id, label = 'עזרה', className }: { topic: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const topic = helpTopic(id)
  if (!topic) return null
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" title={`עזרה: ${topic.title}`}
        className={cn('ui-focus inline-flex h-9 items-center gap-1.5 rounded-ui-sm border border-ui-border bg-ui-surface px-2.5 text-[13px] text-ui-ink-2 hover:bg-ui-subtle', className)}>
        <HelpCircle className="h-4 w-4 text-ui-primary" aria-hidden="true" /><span>{label}</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={topic.title} size="xl"
        description={<Link href={`/admin/help/${topic.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-ui-primary hover:underline">למדריך המלא ולכל נושאי העזרה<ExternalLink className="h-3 w-3" aria-hidden="true" /></Link>}>
        {open && <HelpTopicView topic={topic} compact />}
      </Modal>
    </>
  )
}
