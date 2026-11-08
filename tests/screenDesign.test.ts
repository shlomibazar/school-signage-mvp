import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getDisplayTemplate, getDisplayThemeValue, withDisplayTemplate, withDisplayTheme, getTemplateWidths, regionGrid, TEMPLATE_SECTION_COUNT } from '@/lib/displayTemplates'
import { CURATED_THEMES, SCREEN_THEMES, resolveScreenTheme, themeDesignVars } from '@/lib/screenThemes'
import { normalizeRegionBackground, regionBackgroundStyles, safeImageUrl } from '@/lib/regionBackground'

test('split 70/30 template: encoded like the others, three regions, grid placement', () => {
  const v = withDisplayTemplate('surface:unified|theme:fresh-mint', 'split')
  assert.equal(v, 'layout:split|surface:unified|theme:fresh-mint')
  assert.equal(getDisplayTemplate(v), 'split')
  assert.equal(getDisplayThemeValue(v), 'theme:fresh-mint')
  assert.equal(getDisplayTemplate(withDisplayTheme(v, 'theme:ocean-blue')), 'split')
  assert.equal(TEMPLATE_SECTION_COUNT.split, 3)
  assert.deepEqual(getTemplateWidths('split', 3), [70, 30, 30])
  const g = regionGrid('split', 3, false)!
  assert.equal(g.container.gridTemplateColumns, '70fr 30fr')
  assert.equal(g.cell(0).gridRow, '1 / span 2')
  assert.equal(regionGrid('split', 2, false), null, 'not enough regions: regular row')
  assert.equal(regionGrid('information', 2, false), null)
  // Existing templates unchanged
  assert.equal(getDisplayTemplate('layout:information|theme:classic'), 'information')
  assert.deepEqual(getTemplateWidths('visual', 3), [20, 60, 20])
})

test('legacy themes: still resolvable with their original colours and no v6 tokens', () => {
  for (const id of ['classic', 'light', 'playful', 'gold', 'rainbow', 'sea', 'soft-pastel', 'party-neon', 'orange-sun', 'spring', 'space', 'chalkboard']) {
    const t = resolveScreenTheme(`theme:${id}`)
    assert.equal(t.id, id); assert.equal(t.design, undefined); assert.deepEqual(themeDesignVars(t), {})
  }
  assert.equal(resolveScreenTheme('theme:classic').panel, '#172c48')
  assert.equal(resolveScreenTheme('layout:visual|theme:sea').header, '#007c91')
  assert.equal(resolveScreenTheme(null).id, 'classic')
  assert.equal(resolveScreenTheme('#123456').id, 'classic', 'raw colours resolve as before (classic)')
  assert.equal(SCREEN_THEMES.length, 18)
})

const lum = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722 }
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

test('six curated themes: distinct, balanced, readable from far away', () => {
  assert.equal(CURATED_THEMES.length, 6)
  assert.equal(new Set(CURATED_THEMES.map(t => t.accent)).size, 6, 'six different accents')
  assert.deepEqual(CURATED_THEMES.map(t => t.tokens!.dark), [true, false, false, true, false, false], 'two dark, four light')
  for (const t of CURATED_THEMES) {
    const r = resolveScreenTheme(`theme:${t.id}`)
    assert.ok(ratio(t.text, t.panel) >= 7, `${t.id}: text on surfaces ≥ 7:1`)
    assert.ok(ratio(r.headerText, t.header) >= 4.5, `${t.id}: header ≥ 4.5:1`)
    for (const k of ['cancel', 'sub', 'room', 'move', 'exam'] as const) assert.ok(ratio(t.tokens![k], t.panel) >= 3, `${t.id}: ${k} status ≥ 3:1 (large text)`)
    const vars = themeDesignVars(r)
    assert.equal(vars['--v6-accent'], t.accent); assert.ok(vars['--tv-st-cancel'] && vars['--tv-pri-urgent-bg'])
  }
})

test('region backgrounds: validated, overlay only, safe URLs', () => {
  assert.equal(normalizeRegionBackground(null), null)
  assert.equal(normalizeRegionBackground({ mode: 'theme' }), null)
  assert.equal(normalizeRegionBackground({ mode: 'image' }), null, 'image without URL = theme default')
  const bg = normalizeRegionBackground({ mode: 'image', imageUrl: '/uploads/a.jpg', opacity: 140, overlay: 'light', fit: 'contain', position: 'top' })!
  assert.deepEqual([bg.opacity, bg.overlay, bg.fit, bg.position], [90, 'light', 'contain', 'top'])
  for (const bad of ['javascript:alert(1)', 'http://x.test/a.jpg', '/a.jpg") url("x', '//evil.test/a.jpg']) assert.equal(safeImageUrl(bad), null, bad)
  const s = regionBackgroundStyles({ mode: 'image', imageUrl: 'https://res.cloudinary.com/x/a.jpg', opacity: 60 })!
  assert.equal(s.overlay!.opacity, '0.6', 'opacity on the overlay layer')
  assert.equal(s.frame['--tv-panel'], 'transparent', 'content surfaces become transparent')
  assert.equal(s.frame.color, '#ffffff', 'dark overlay → light text')
  const c = regionBackgroundStyles({ mode: 'color', color: '#fff4d6' })!
  assert.equal(c.overlay, null); assert.equal(c.frame.color, '#142033', 'light colour → dark text')
})
