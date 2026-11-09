// How long a gallery shows one image (slideshow) or one set of images (mosaic / collage) before it
// advances. One setting, "זמן החלפת תמונות" (settings.changeSeconds), for every mode. Galleries saved
// before it existed keep their exact timing: slideshows used the item's slideDuration (default 8),
// mosaic and collage used settings.groupDuration (5–60, default 15).
export const GALLERY_CHANGE_MIN = 3
export const GALLERY_CHANGE_MAX = 60

export function galleryChangeSeconds(settings: { changeSeconds?: unknown; displayMode?: string; groupDuration?: unknown } | null | undefined, slideDuration?: number | null): number {
  const s = settings ?? {}
  const own = Number(s.changeSeconds)
  if (Number.isFinite(own) && own > 0) return Math.max(GALLERY_CHANGE_MIN, Math.min(GALLERY_CHANGE_MAX, Math.round(own)))
  if ((s.displayMode ?? 'slideshow') === 'slideshow') return Math.max(2, slideDuration || 8)
  const group = Number(s.groupDuration)
  return Math.max(5, Math.min(60, Number.isFinite(group) && group > 0 ? group : 15))
}
