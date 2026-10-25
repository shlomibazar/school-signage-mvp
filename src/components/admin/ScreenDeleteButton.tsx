'use client'
import {useRouter} from 'next/navigation'
import {useState} from 'react'
import {Trash2} from 'lucide-react'
import toast from 'react-hot-toast'
export default function ScreenDeleteButton({id,name}:{id:string;name:string}){
 const router=useRouter();const [busy,setBusy]=useState(false)
 async function remove(){if(!window.confirm(`למחוק לצמיתות את המסך "${name}" ואת הפריסה שלו? ההודעות והתמונות במאגר יישארו.`))return;setBusy(true);try{const r=await fetch(`/api/screens/${id}`,{method:'DELETE'});if(!r.ok)throw Error();toast.success('המסך נמחק בהצלחה');router.refresh()}catch{toast.error('מחיקת המסך נכשלה')}finally{setBusy(false)}}
 return <button type="button" disabled={busy} onClick={remove} title="מחק מסך" className="flex items-center justify-center gap-1 px-3 py-2 border border-red-200 rounded-lg text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5"/>מחק</button>
}
