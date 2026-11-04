// Shared setup of the local QA scripts in this folder.
//
// LOCAL TEST ENVIRONMENT ONLY: exits (code 2) unless the app URL (QA_BASE_URL, default
// http://localhost:3000) and DATABASE_URL (environment, or .env in the repository) both point to
// localhost, NODE_ENV is not production, and QA_CREDS_FILE (outside the repository) names two
// local test users of two different schools, each EDITOR or higher:
//   { "A": { "email": "...", "password": "..." }, "B": { "email": "...", "password": "..." } }
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const abort = msg => { console.error('ABORT: ' + msg); process.exit(2) }
if (process.env.NODE_ENV === 'production') abort('NODE_ENV is production')
const envFile = path.join(ROOT, '.env')
const dbUrl = process.env.DATABASE_URL || (fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').match(/^DATABASE_URL="?([^"\r\n]*)/m)?.[1] : undefined)
if (!dbUrl) abort('DATABASE_URL is not set')
let dbHost; try { dbHost = new URL(dbUrl).hostname } catch { abort('DATABASE_URL is not a valid URL') }
if (!LOCAL.has(dbHost)) abort('DATABASE_URL does not point to a local database')
export const BASE = (process.env.QA_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
if (!LOCAL.has(new URL(BASE).hostname)) abort('QA_BASE_URL is not a local address')
const credsFile = process.env.QA_CREDS_FILE
if (!credsFile || !fs.existsSync(credsFile)) abort('QA_CREDS_FILE is not set or does not exist')
if (!path.relative(ROOT, path.resolve(credsFile)).startsWith('..')) abort('QA_CREDS_FILE must be outside the repository')
export const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'))
if (!creds.A?.email || !creds.B?.email) abort('QA_CREDS_FILE needs users A and B')

const { PrismaClient } = require('@prisma/client')
export const db = new PrismaClient({ datasources: { db: { url: dbUrl } } })
const schoolOf = async email => (await db.user.findUnique({ where: { email }, select: { schoolId: true } }))?.schoolId
export const ids = { schoolA: await schoolOf(creds.A.email), schoolB: await schoolOf(creds.B.email) }
if (!ids.schoolA || !ids.schoolB || ids.schoolA === ids.schoolB) abort('users A and B must belong to two different schools')

export async function login(c) {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email: c.email, password: c.password }) })
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0]
  if (!r.ok || !cookie) throw new Error('login failed ' + r.status)
  return cookie
}
/** JSON (or FormData) request; returns { s: status, j: parsed JSON, text }. */
export async function call(cookie, p, method = 'GET', body) {
  const h = { Origin: BASE }; if (cookie) h.Cookie = cookie
  const isForm = body instanceof FormData
  if (body !== undefined && !isForm) h['Content-Type'] = 'application/json'
  const r = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body), redirect: 'manual' })
  const text = await r.text(); let j = null; try { j = JSON.parse(text) } catch {}
  return { s: r.status, j, text }
}
export function reporter() {
  const out = []
  const t = (name, ok, detail = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`)
  const finish = () => {
    const failed = out.filter(l => !l.startsWith('PASS')).length
    console.log(out.join('\n'))
    console.log(`\n${out.length - failed} passed, ${failed} failed`)
    process.exitCode = failed ? 1 : 0
  }
  return { out, t, finish }
}
