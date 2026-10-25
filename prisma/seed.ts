
// prisma/seed.ts
// Seeds a demo school, a secure super admin, and sample screens.
// Safe to run multiple times without resetting an existing password.

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

function distributeWidths(count: number): number[] {
  const base = Math.floor(100 / count)
  const remainder = 100 - base * count

  return Array.from(
    { length: count },
    (_, i) => (i === 0 ? base + remainder : base)
  )
}

async function main() {
  console.log('🌱 Seeding database...')

  // ── Secure super admin ────────────────────────────────────

  const adminLogin = process.env.SEED_ADMIN_EMAIL?.trim()
  const adminPassword = process.env.SEED_ADMIN_PASSWORD

  if (!adminLogin) {
    throw new Error('SEED_ADMIN_EMAIL is required')
  }

  if (!adminPassword || adminPassword.length < 8) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must contain at least 8 characters'
    )
  }

  // Never reset an existing admin's password during seeding.
  let superAdmin = await db.user.findUnique({
    where: { email: adminLogin },
  })

  if (superAdmin) {
    if (superAdmin.role !== 'SUPER_ADMIN') {
      throw new Error(
        'The requested admin login already belongs to a non-super-admin user'
      )
    }

    console.log('↩️ Super admin already exists; password unchanged')
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, 12)

    superAdmin = await db.user.create({
      data: {
        email: adminLogin,
        name: 'מנהל ראשי',
        passwordHash,
        role: 'SUPER_ADMIN',
      },
    })

    console.log('✅ Super admin created')
  }

  // ── Demo school ──────────────────────────────────────────

  const school = await db.school.upsert({
    where: { slug: 'demo-school' },
    update: {},
    create: {
      name: 'בית ספר ניסויי',
      slug: 'demo-school',
      locale: 'he',
      timezone: 'Asia/Jerusalem',
      theme: {
        create: {
          primaryColor: '#1a73e8',
          secondaryColor: '#ffffff',
          backgroundColor: '#0f172a',
          fontFamily: 'Heebo',
          borderRadius: 8,
        },
      },
    },
  })

  console.log(`✅ School: ${school.name}`)

  // Assign super admin to the demo school.
  // Keep the existing school assignment if one is already set.
  if (!superAdmin.schoolId) {
    await db.user.update({
      where: { id: superAdmin.id },
      data: { schoolId: school.id },
    })
  }

  // ── Demo screens ─────────────────────────────────────────

  const screensData = [
    {
      name: 'לובי ראשי',
      slug: 'main-lobby',
      sections: 2,
      orientation: 'LANDSCAPE' as const,
    },
    {
      name: 'חדר מורים',
      slug: 'teachers-room',
      sections: 1,
      orientation: 'LANDSCAPE' as const,
    },
    {
      name: 'חצר — אנכי',
      slug: 'yard',
      sections: 3,
      orientation: 'PORTRAIT' as const,
    },
  ]

  for (const s of screensData) {
    const existing = await db.screen.findUnique({
      where: { slug: s.slug },
    })

    if (existing) {
      console.log(`↩️ Screen already exists: ${s.name}`)
      continue
    }

    const widths = distributeWidths(s.sections)

    await db.screen.create({
      data: {
        schoolId: school.id,
        name: s.name,
        slug: s.slug,
        orientation: s.orientation,
        active: true,
        refreshSecs: 30,
        layout: {
          create: {
            headerEnabled: true,
            headerShowLogo: true,
            headerShowTitle: true,
            headerShowClock: true,
            headerShowDate: false,
            headerShowHebDate: true,
            headerShowWeather: false,
            headerScrollText: null,
            mainSections: s.sections,
            footerEnabled: true,
            footerShowSchoolName: true,
            footerShowClock: false,
            footerTicker:
              'ברוכים הבאים לבית ספרנו! • אנחנו שמחים שאתם כאן • מוזמנים לבקר',
          },
        },
        sections: {
          create: Array.from(
            { length: s.sections },
            (_, i) => ({
              position: i,
              widthPct: widths[i],
            })
          ),
        },
      },
    })

    const created = await db.screen.findUnique({
      where: { slug: s.slug },
      include: {
        sections: {
          orderBy: { position: 'asc' },
        },
      },
    })

    if (created?.sections[0]) {
      await db.contentItem.create({
        data: {
          sectionId: created.sections[0].id,
          contentType: 'TEXT',
          textContent:
            `<div style="font-size:2em;font-weight:600">ברוכים הבאים!</div>` +
            `<div style="opacity:0.6;margin-top:8px;font-size:0.7em">${s.name}</div>`,
          textColor: '#ffffff',
          priority: 0,
          daysOfWeek: [],
          active: true,
          slideDuration: 5,
          transitionStyle: 'fade',
          videoLoop: true,
          videoMuted: true,
          rssMaxItems: 5,
          weatherUnits: 'metric',
        },
      })
    }

    console.log(`✅ Screen: ${s.name} → /screen/${s.slug}`)
  }

  // ── Sample announcement ─────────────────────────────────

  const existingAnn = await db.announcement.findFirst({
    where: {
      schoolId: school.id,
      title: 'ברוכים הבאים לשנת הלימודים!',
    },
  })

  if (!existingAnn) {
    await db.announcement.create({
      data: {
        schoolId: school.id,
        title: 'ברוכים הבאים לשנת הלימודים!',
        body:
          'אנחנו שמחים לפתוח את שנת הלימודים ומאחלים לכולם שנה מוצלחת ומלאת הצלחות.',
        priority: 'MEDIUM',
        bgColor: '#1e3a5f',
        textColor: '#ffffff',
        startAt: new Date(),
        endAt: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ),
        daysOfWeek: [],
        active: true,
        isEmergency: false,
      },
    })

    console.log('✅ Sample announcement created')
  } else {
    console.log('↩️ Sample announcement already exists')
  }

  // ── Finished ─────────────────────────────────────────────

  console.log('\n🎉 Seed complete!')
  console.log('─────────────────────────────────────')
  console.log('  Super admin is ready')
  console.log('  Admin:  /admin/dashboard')
  console.log('  Screen: /screen/main-lobby')
  console.log('─────────────────────────────────────')
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
