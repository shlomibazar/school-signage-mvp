# SchoolScreen — מערכת שילוט דיגיטלי לבתי ספר

מערכת SaaS מלאה לניהול תוכן על מסכי בית הספר. כל בית ספר יכול ליצור מסכים, לערוך פריסה, לתזמן תוכן ולהציג URL ציבורי על כל מסך.

## הגדרה מהירה

```bash
# 1. התקנת תלויות
npm install

# 2. העתק קובץ .env
cp .env.example .env.local
# ערוך את .env.local עם פרטי ה-DB שלך

# 3. הרצת DB migrations
npm run db:push

# 4. Seed — נתוני דמו
npm run db:seed

# 5. הרצת שרת הפיתוח
npm run dev
```

פתח: http://localhost:3000

**כניסה לדמו:** `admin@schoolscreen.app` / `admin123`

---

## מסכים ציבוריים (ללא כניסה)

| מסך | URL |
|-----|-----|
| לובי ראשי | `/screen/main-lobby` |
| חדר מורים | `/screen/teachers-room` |
| חצר (אנכי) | `/screen/yard-portrait` |

---

## ארכיטקטורה

```
school-signage/
├── prisma/
│   ├── schema.prisma          # מסד נתונים מלא
│   └── seed.ts                # נתוני דמו
│
├── src/
│   ├── app/
│   │   ├── admin/             # ממשק ניהול (מוגן)
│   │   │   ├── dashboard/     # לוח בקרה
│   │   │   ├── screens/       # רשימת מסכים
│   │   │   ├── editor/        # עורך פריסה
│   │   │   ├── announcements/ # הודעות
│   │   │   └── media/         # ספריית מדיה
│   │   │
│   │   ├── screen/[slug]/     # תצוגה ציבורית (ללא ניהול)
│   │   └── auth/login/        # כניסה
│   │
│   ├── components/
│   │   ├── admin/
│   │   │   ├── layout/        # Sidebar, TopBar
│   │   │   ├── editor/        # עורך פריסה, תצוגה מקדימה
│   │   │   └── announcements/ # טפסי הודעות
│   │   └── display/           # רכיבי תצוגה ציבורית
│   │
│   ├── lib/
│   │   ├── auth.ts            # JWT + סשן
│   │   ├── db.ts              # Prisma singleton
│   │   └── scheduling.ts      # מנוע תזמון תוכן
│   │
│   └── types/index.ts         # TypeScript types
```

---

## MVP — Phase 1 (מוכן)

- ✅ אימות JWT + Cookie
- ✅ הרשאות לפי תפקיד (Super Admin / School Admin / Editor / Viewer)
- ✅ מודל מסך עם slug ייחודי
- ✅ עורך פריסה (header / main sections 1-2-3 / footer)
- ✅ תצוגה ציבורית `/screen/[slug]` ללא ממשק ניהול
- ✅ טיקר גלילה בתחתית
- ✅ שעון + תאריך עברי בכותרת
- ✅ רענון אוטומטי
- ✅ תמיכה מלאה ב-RTL עברית
- ✅ Multi-tenant (מספר בתי ספר)
- ✅ DB schema מלא עם Prisma

---

## Phase 2 (הבא)

- [ ] הודעות עם תזמון מלא
- [ ] גלריית תמונות + העלאת קבצים
- [ ] עורך תוכן לכל אזור מסך
- [ ] לוח בקרה עם סטטיסטיקות אמיתיות

## Phase 3

- [ ] סרטוני וידאו
- [ ] התראות חירום (override מלא)
- [ ] RSS Feed
- [ ] מזג אויר (OpenWeatherMap)
- [ ] ימי הולדת ואירועים
- [ ] לוח שיעורים יומי
- [ ] הרשאות מתקדמות

---

## TV / Kiosk מצב

לפתיחה על טלוויזיה חכמה:
1. פתח את Chrome/Chromium
2. גש ל: `http://YOUR_SERVER/screen/main-lobby`
3. F11 — מסך מלא
4. לכיוס (kiosk): `chromium --kiosk http://YOUR_SERVER/screen/main-lobby`

---

## Tech Stack

- **Next.js 14** — App Router + Server Components
- **TypeScript** — types מלאים
- **Tailwind CSS** — RTL
- **PostgreSQL + Prisma** — ORM מלא
- **Jose** — JWT (Edge-compatible)
- **bcryptjs** — הצפנת סיסמאות
- **react-hot-toast** — הודעות
- **Heebo** — גופן עברי (Google Fonts)
