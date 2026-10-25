'use client'
import {useRouter} from 'next/navigation'
import {useState} from 'react'
import {Trash2} from 'lucide-react'
import toast from 'react-hot-toast'
export default function AnnouncementDeleteButton({id,title}:{id:string;title:string}){
 const router=useRouter();const [busy,setBusy]=useState(false)
 async function remove(){if(!window.confirm(`למחוק את ההודעה "${title}"? היא תוסר מכל המסכים.`))return;setBusy(true);try{const r=await fetch(`/api/announcements/${id}`,{method:'DELETE'});if(!r.ok)throw Error();toast.success('ההודעה נמחקה בהצלחה');router.refresh()}catch{toast.error('מחיקת ההודעה נכשלה')}finally{setBusy(false)}}
 return <button type="button" disabled={busy} onClick={remove} className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5"/>מחק</button>
}
