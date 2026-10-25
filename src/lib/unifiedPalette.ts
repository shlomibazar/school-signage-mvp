// Unified display palette: readable text and subtle cards for light or dark themes.
export function unifiedPalette(background: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(background)
  const hex = match ? match[1] : '101b2e'
  const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
  const luminance = rgb.map(v => { const s=v/255; return s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4 })
  const light = luminance[0]*0.2126+luminance[1]*0.7152+luminance[2]*0.0722 > 0.179
  return {
    ink: light ? '#152238' : '#f7f9ff',
    muted: light ? '#526176' : '#b6c7dd',
    card: light ? 'rgba(20,35,55,.065)' : 'rgba(255,255,255,.085)',
    stroke: light ? 'rgba(20,35,55,.12)' : 'rgba(255,255,255,.14)',
  }
}
