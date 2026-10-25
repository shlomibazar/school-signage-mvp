export function youtubeId(value:string):string|null {
  try {
    const url=new URL(value)
    const host=url.hostname.toLowerCase().replace(/^www\./,'').replace(/^m\./,'')
    let id:string|null=null
    if(host==='youtu.be')id=url.pathname.split('/')[1]??null
    else if(host==='youtube.com'||host==='youtube-nocookie.com'){
      if(url.pathname==='/watch')id=url.searchParams.get('v')
      else if(/^\/(shorts|embed|live)\//.test(url.pathname))id=url.pathname.split('/')[2]??null
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id)?id:null
  }catch{return null}
}
