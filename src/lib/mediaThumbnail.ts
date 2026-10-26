/** Build a Cloudinary delivery transformation only for trusted Cloudinary upload URLs. */
export function cloudinaryThumbnailUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com') return null
    const match = u.pathname.match(/^(\/[^/]+\/image\/upload\/)(.*)$/)
    if (!match) return null
    // Preserve any existing version/public ID and transformations. Prefix our thumbnail transform.
    u.pathname = `${match[1]}c_limit,w_320,h_320,q_auto:eco,f_auto/${match[2]}`
    return u.toString()
  } catch { return null }
}
