import { regionBackgroundStyles } from '@/lib/regionBackground'

// A content region's frame, shared by the public screen and the editor preview so both paint the
// region background identically. A custom background is drawn on its own layer inside the frame
// (theme rules for panels cannot override it), under an overlay layer whose opacity never touches
// the text; CSS variables make the content's own surfaces transparent and pick a readable ink.
export default function RegionFrame({ background, className, style, children, ...rest }: {
  background?: unknown; className?: string; style?: React.CSSProperties; children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'style' | 'className' | 'children'>) {
  const bg = regionBackgroundStyles(background)
  if (!bg) return <div className={className} style={style} {...rest}>{children}</div>
  const { background: color, backgroundColor, backgroundImage, backgroundSize, backgroundPosition, backgroundRepeat, ...vars } = bg.frame as Record<string, string>
  const layer = { background: color, backgroundColor, backgroundImage, backgroundSize, backgroundPosition, backgroundRepeat }
  const fill: React.CSSProperties = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' }
  return (
    <div className={className} data-region-bg="custom" style={{ ...style, ...(vars as React.CSSProperties), position: 'relative' }} {...rest}>
      <div aria-hidden="true" style={{ ...fill, zIndex: 0, ...(layer as React.CSSProperties) }} />
      {bg.overlay && <div aria-hidden="true" style={{ ...fill, zIndex: 0, ...(bg.overlay as React.CSSProperties) }} />}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>{children}</div>
    </div>
  )
}
