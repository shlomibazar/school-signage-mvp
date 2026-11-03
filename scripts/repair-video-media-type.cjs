// One-off data repair: older uploads stored videos with mediaType IMAGE. Since Batch D new
// uploads store VIDEO, and every reader accepts both (the MIME type decides how a file is shown),
// so running this is optional; it only makes the data consistent.
//
//   node scripts/repair-video-media-type.cjs           dry run: lists what would change
//   node scripts/repair-video-media-type.cjs --apply   updates the rows
//
// It acts on the database in DATABASE_URL and prints its host first. Run it against production
// only deliberately, after a backup, as part of a reviewed deployment.
const { PrismaClient } = require('@prisma/client')

async function main() {
  const apply = process.argv.includes('--apply')
  const host = (() => { try { return new URL(process.env.DATABASE_URL).host } catch { return '(unknown)' } })()
  console.log(`Database host: ${host}  mode: ${apply ? 'APPLY' : 'dry run'}`)
  const db = new PrismaClient()
  try {
    const where = { mediaType: 'IMAGE', mimeType: { startsWith: 'video/' } }
    const rows = await db.mediaFile.findMany({ where, select: { id: true, originalName: true, mimeType: true } })
    for (const r of rows) console.log(`  ${r.id}  ${r.mimeType}  ${r.originalName}`)
    console.log(`${rows.length} video file(s) stored as IMAGE`)
    if (apply && rows.length) {
      const { count } = await db.mediaFile.updateMany({ where: { id: { in: rows.map(r => r.id) } }, data: { mediaType: 'VIDEO' } })
      console.log(`Updated ${count} row(s)`)
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
