import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanAnnouncementHtml, cleanStyle, announcementPlainText, announcementTextLength } from '@/lib/announcementRichText'
import { EXCEL_TABLE, WORD_DOCUMENT, MALICIOUS } from './fixtures/office.mjs'

// The server-side allowlist (save and display). The browser-side conversion of the same fixtures
// (class styles, Word lists) runs in a real browser: scripts/qa/office-paste.mjs.

const UNSAFE = /<(script|style|iframe|img|svg|math|link|a|object|embed|meta)\b|\son\w+=|javascript:|expression\(|url\(|position:|z-index|xml/i

test('rich text: Excel clipboard HTML keeps the table structure and data, safely', () => {
  const out = cleanAnnouncementHtml(EXCEL_TABLE)
  assert.doesNotMatch(out, UNSAFE)
  assert.equal((out.match(/<tr>/g) ?? []).length, 5)
  assert.match(out, /<td colspan="4">לוח מבחנים – שכבה י׳ \(Term A\)<\/td>/)
  assert.match(out, /<td rowspan="2">12\/11\/2026<\/td>/)
  for (const v of ['87%', '90%', '1,234.50', 'Room 214', 'נדחה – בגלל טיול', 'מתמטיקה 5 יח״ל']) assert.ok(out.includes(v), v)
  assert.doesNotMatch(out, /=B3\/C3|x:num|x:fmla|mso-/, 'formulas and Office attributes are not kept')
  assert.equal(cleanAnnouncementHtml(out), out, 'idempotent (save, then display)')
})

test('rich text: Word clipboard HTML keeps text, emphasis and table; drops Office markup and links', () => {
  const out = cleanAnnouncementHtml(WORD_DOCUMENT)
  assert.doesNotMatch(out, UNSAFE)
  assert.doesNotMatch(out, /o:p|lang=|class=|WordDocument|Normal<\/w|StartFragment/)
  assert.match(out, /אתר בית הספר/, 'link text is kept')
  assert.doesNotMatch(out, /example\.org/, 'link targets are not kept')
  assert.match(out, /<i>Parents who cannot attend<\/i>/)
  assert.match(out, /<b><i>בחניון הצפוני<\/i><\/b>/)
  assert.doesNotMatch(out, /<span[^>]*dir=/, 'inline direction (Word marks Hebrew runs LTR) is dropped')
  assert.match(out, /<p dir="rtl" align="right"/, 'block direction and alignment are kept')
  assert.match(out, /<table dir="rtl"/)
  assert.equal(cleanAnnouncementHtml(out), out)
})

test('rich text: hostile and broken markup comes out inert', () => {
  for (const html of MALICIOUS) {
    const out = cleanAnnouncementHtml(html)
    assert.doesNotMatch(out, UNSAFE, html)
    assert.doesNotMatch(out, /colspan="999999"|rowspan="-3"/)
    assert.equal(cleanAnnouncementHtml(out), out, 'idempotent: ' + html)
  }
  assert.match(cleanAnnouncementHtml(MALICIOUS[0]), /^<p>a<\/p>$/)
  assert.match(cleanAnnouncementHtml(MALICIOUS[1]), /<p style="color:red">b<\/p>/, 'only allowed declarations survive')
})

test('rich text: style allowlist normalizes values', () => {
  assert.equal(cleanStyle('font-size:12pt;color:windowtext;background:#FFF2CC;border:solid windowtext 1.0pt'), 'font-size:16px;background-color:#fff2cc;border:1.33px solid currentColor')
  assert.equal(cleanStyle('font-size:9999px'), 'font-size:72px')
  assert.equal(cleanStyle('font-size:1.4em;text-align:center;direction:rtl;vertical-align:middle'), 'font-size:1.4em;text-align:center;direction:rtl;vertical-align:middle')
  assert.equal(cleanStyle('display:none;position:fixed;width:100vw;margin:-999px;font-family:x;transform:scale(9)'), '')
})

test('rich text: plain text and existing toolbar formats are unchanged', () => {
  assert.equal(cleanAnnouncementHtml('שורה 1\nשורה <2> & 3'), 'שורה 1<br>שורה &lt;2&gt; &amp; 3')
  const toolbar = '<p><span style="font-size:26px">יתקיים ביום רביעי</span></p><div style="text-align:center"><b>מודגש</b></div><ul><li>א</li></ul>'
  assert.equal(cleanAnnouncementHtml(toolbar), toolbar)
})

test('rich text: plain text for the emergency overlay and visible length for layout', () => {
  const text = announcementPlainText(cleanAnnouncementHtml(EXCEL_TABLE))
  assert.match(text, /תאריך \| מקצוע \| אחוז הצלחה \| Notes/)
  assert.doesNotMatch(text, /<|>/)
  assert.equal(announcementPlainText('<p>&lt;img src=x onerror=alert(1)&gt;</p>'), '<img src=x onerror=alert(1)>', 'tag-like text stays text (rendered as a text node)')
  const html = cleanAnnouncementHtml(EXCEL_TABLE)
  assert.ok(announcementTextLength(html) < html.length / 2, 'markup does not count')
  assert.equal(announcementTextLength('abc def'), 7)
})
