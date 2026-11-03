import { NextRequest, NextResponse } from 'next/server'
import type { RssFeedItem } from '@/types'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { safeHttpsGet, validatePublicHttpsUrl, SafeFetchError } from '@/lib/safeFetch'

export const runtime = 'nodejs'

function extractTag(xml:string,tag:string):string{const c=new RegExp('<'+tag+'[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></'+tag+'>','i').exec(xml);if(c)return c[1].trim();const p=new RegExp('<'+tag+'[^>]*>([\\s\\S]*?)</'+tag+'>','i').exec(xml);return p?p[1].trim():''}
function stripHtml(h:string):string{return h.replace(/<[^>]+>/g,'').replace(/&[a-z]+;/gi,' ').trim().slice(0,200)}
function parseRss(xml:string,max:number):RssFeedItem[]{const items:RssFeedItem[]=[],re=/<item[\s>]([\s\S]*?)<\/item>/gi;let m:RegExpExecArray|null;while((m=re.exec(xml))!==null&&items.length<max){const b=m[1],title=extractTag(b,'title');if(title)items.push({title,link:extractTag(b,'link'),description:stripHtml(extractTag(b,'description')),pubDate:extractTag(b,'pubDate')})}return items}

// Shared feeds are fetched at most every 5 minutes, however many TVs poll them.
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; items: RssFeedItem[] }>()

// Without a login, a request must name the public context that uses the feed: the
// screen whose footer shows it (`screen`) or the RSS content item (`item`). The feed
// must be configured exactly there, and the screen and school must be active. So the
// public endpoint only serves feeds of active screens and is not a general proxy.
// Logged-in editors may preview any URL that passes the SSRF checks.
async function isFeedOfPublicContext(url: string, screenId: string | null, itemId: string | null) {
  const liveScreen = { active: true, school: { active: true } }
  if (itemId) return !!(await db.contentItem.findFirst({
    where: { id: itemId, contentType: 'RSS_FEED', active: true, rssUrl: url, section: { screen: liveScreen } }, select: { id: true },
  }))
  if (screenId) return !!(await db.screenLayout.findFirst({
    where: { screenId, footerRssUrl: url, footerFeedMode: { not: 'manual' }, screen: liveScreen }, select: { id: true },
  }))
  return false
}

// Anonymous TV responses carry only public feed data and may be shared-cached.
// Editor previews (authenticated) must never be stored by a shared cache.
const PUBLIC_CACHE = { 'Cache-Control': 'public, max-age=60, s-maxage=300' }
const PRIVATE_CACHE = { 'Cache-Control': 'private, no-store' }
const NO_STORE = { 'Cache-Control': 'no-store' }
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: NO_STORE })

export async function GET(req:NextRequest){
  const raw=req.nextUrl.searchParams.get('url')?.trim(),max=Math.max(1,Math.min(Number.parseInt(req.nextUrl.searchParams.get('max')?? '10',10)||10,100))
  if(!raw||raw.length>2048)return fail('כתובת RSS לא תקינה',400)
  let url:string
  try{url=validatePublicHttpsUrl(raw).toString()}catch{return fail('כתובת RSS לא מורשית',400)}
  const authenticated=!!(await getSession())
  // Decided before the in-memory cache is consulted, so cached editor previews never leak to anonymous callers.
  if(!authenticated&&!(await isFeedOfPublicContext(raw,req.nextUrl.searchParams.get('screen'),req.nextUrl.searchParams.get('item'))))return fail('פיד RSS לא מוגדר',403)
  const headers=authenticated?PRIVATE_CACHE:PUBLIC_CACHE
  const cached=cache.get(url)
  if(cached&&Date.now()-cached.at<CACHE_TTL_MS)return NextResponse.json({items:cached.items.slice(0,max)},{headers})
  try{
    const xml=(await safeHttpsGet(url)).toString('utf8')
    const items=parseRss(xml,100)
    cache.set(url,{at:Date.now(),items})
    if(cache.size>100)cache.delete(cache.keys().next().value!)
    return NextResponse.json({items:items.slice(0,max)},{headers})
  }catch(e){
    // Generic messages only: no upstream status, address or stack reaches the client.
    if(e instanceof SafeFetchError&&e.kind==='blocked')return fail('כתובת RSS לא מורשית',400)
    console.error('RSS fetch failed:',e instanceof SafeFetchError?e.message:'unexpected error')
    return fail('הפיד אינו זמין כרגע',502)
  }
}
