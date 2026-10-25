import { NextRequest, NextResponse } from 'next/server'
import type { RssFeedItem } from '@/types'
function extractTag(xml:string,tag:string):string{const c=new RegExp('<'+tag+'[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></'+tag+'>','i').exec(xml);if(c)return c[1].trim();const p=new RegExp('<'+tag+'[^>]*>([\\s\\S]*?)</'+tag+'>','i').exec(xml);return p?p[1].trim():''}
function stripHtml(h:string):string{return h.replace(/<[^>]+>/g,'').replace(/&[a-z]+;/gi,' ').trim().slice(0,200)}
function parseRss(xml:string,max:number):RssFeedItem[]{const items:RssFeedItem[]=[],re=/<item[\s>]([\s\S]*?)<\/item>/gi;let m:RegExpExecArray|null;while((m=re.exec(xml))!==null&&items.length<max){const b=m[1],title=extractTag(b,'title');if(title)items.push({title,link:extractTag(b,'link'),description:stripHtml(extractTag(b,'description')),pubDate:extractTag(b,'pubDate')})}return items}
export async function GET(req:NextRequest){
  const url=req.nextUrl.searchParams.get('url'),max=Math.max(1,Math.min(Number.parseInt(req.nextUrl.searchParams.get('max')?? '10',10)||10,100))
  if(!url)return NextResponse.json({error:'url required'},{status:400})
  try{new URL(url)}catch{return NextResponse.json({error:'Invalid URL'},{status:400})}
  try{const res=await fetch(url,{headers:{'User-Agent':'SchoolScreen/1.0'},next:{revalidate:300}});if(!res.ok)return NextResponse.json({error:'Feed error '+res.status},{status:502});const xml=await res.text();return NextResponse.json({items:parseRss(xml,max)},{headers:{'Cache-Control':'public, s-maxage=300'}})}
  catch(e:any){console.error('RSS:',e);return NextResponse.json({error:'Failed'},{status:502})}
}
