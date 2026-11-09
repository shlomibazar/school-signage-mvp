import Link from 'next/link'
import { ArrowLeft, Info, Lightbulb } from 'lucide-react'
import { helpTopic, type HelpTopic } from '@/lib/help/topics'
import { cn } from '@/lib/utils'

// One help topic: summary, numbered steps per section, tips, an optional screenshot (loaded lazily,
// only when the topic is shown) and links to the real admin pages. Used by the topic page and by
// the contextual help popup (compact: smaller headings; links open in a new tab there, so an open
// editor with unsaved changes is never left).
export default function HelpTopicView({ topic, compact = false }: { topic: HelpTopic; compact?: boolean }) {
  const linkProps = compact ? { target: '_blank', rel: 'noopener' } : {}
  return (
    <article className="grid gap-5 text-ui-ink" dir="rtl">
      <p className={cn('leading-relaxed text-ui-ink-2', compact ? 'text-sm' : 'text-[15px]')}>{topic.summary}</p>
      {topic.audience && (
        <p className="flex items-start gap-2 rounded-ui-sm bg-ui-subtle px-3 py-2 text-xs text-ui-ink-2"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{topic.audience}</p>
      )}

      {topic.image && (
        <figure className="overflow-hidden rounded-ui-lg border border-ui-border bg-ui-subtle">
          {/* Real, cropped screenshot (public/help); tall ones are capped so a topic stays compact. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={topic.image.src} alt={topic.image.alt} width={topic.image.width} height={topic.image.height} loading="lazy" decoding="async"
            className={cn('mx-auto block h-auto w-auto max-w-full', compact ? 'max-h-[360px]' : 'max-h-[460px]')} />
          {topic.image.caption && <figcaption className="border-t border-ui-border bg-ui-surface px-3 py-2 text-xs text-ui-muted">{topic.image.caption}</figcaption>}
        </figure>
      )}

      {topic.sections.map((section, i) => (
        <section key={i} className="grid gap-2">
          {section.title && <h3 className={cn('font-semibold text-ui-ink', compact ? 'text-sm' : 'text-base')}>{section.title}</h3>}
          {section.text && <p className="text-sm leading-relaxed text-ui-ink-2">{section.text}</p>}
          {section.steps && (
            <ol className="grid gap-2">
              {section.steps.map((step, n) => (
                <li key={n} className="flex gap-3 text-sm leading-relaxed text-ui-ink-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ui-primary-soft text-xs font-semibold text-ui-primary-ink" aria-hidden="true">{n + 1}</span>
                  <span className="min-w-0 pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          )}
          {section.tips && (
            <ul className="grid gap-1.5 rounded-ui-sm border border-amber-200 bg-amber-50 px-3 py-2.5">
              {section.tips.map((tip, n) => (
                <li key={n} className="flex gap-2 text-sm leading-relaxed text-amber-900"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{tip}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {topic.links.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-ui-border pt-4">
          {topic.links.map(link => (
            <Link key={link.href} href={link.href} {...linkProps}
              className="ui-focus inline-flex h-9 items-center gap-1.5 rounded-ui-sm border border-ui-border-strong bg-ui-surface px-3 text-[13px] font-medium text-ui-ink-2 hover:bg-ui-subtle">
              {link.label}<ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}

      {!compact && topic.related && topic.related.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold text-ui-ink">נושאים קשורים</h3>
          <div className="flex flex-wrap gap-2">
            {topic.related.map(id => helpTopic(id)).filter(Boolean).map(t => (
              <Link key={t!.id} href={`/admin/help/${t!.id}`} className="ui-focus rounded-full bg-ui-subtle px-3 py-1 text-xs text-ui-primary hover:underline">{t!.title}</Link>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}
