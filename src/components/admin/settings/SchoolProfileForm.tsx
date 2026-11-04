'use client'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Building2, ImageUp, MapPin, X } from 'lucide-react'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import SaveBar, { type SaveStatus } from './SaveBar'
import { ISRAEL_WEATHER_CITIES } from '@/lib/israelWeatherCities'
import { weatherCityName } from '@/lib/screenSettings'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'

// "פרטי בית הספר": values shared by all the school's screens. Uses the existing endpoints
// (POST /api/schools/[id]/logo, PUT /api/schools/[id]/weather-city — EDITOR and up, own school).
// Nothing is sent until "שמירת פרטי בית הספר".

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_LOGO_BYTES = 3 * 1024 * 1024
type City = typeof ISRAEL_WEATHER_CITIES[number]
const cityValue = (c: City) => `${c.latitude},${c.longitude}|${c.name}`

export default function SchoolProfileForm({ school, canEdit }: {
  school: { id: string; name: string; logoUrl: string | null; weatherCity: string | null }
  canEdit: boolean
}) {
  const [savedLogo, setSavedLogo] = useState(school.logoUrl)
  const [savedCity, setSavedCity] = useState(school.weatherCity)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [cityInput, setCityInput] = useState(weatherCityName(school.weatherCity))
  // The stored value behind the text: set when a city is picked from the list (or the saved one).
  const [cityPick, setCityPick] = useState<string | null>(school.weatherCity)
  const [errors, setErrors] = useState<{ logo?: string; city?: string }>({})
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<SaveStatus>(null)
  const busy = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const preview = useMemo(() => logoFile ? URL.createObjectURL(logoFile) : null, [logoFile])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  // '' = no city (the system default is used); null = typed text that is not a picked city.
  const typed = cityInput.trim()
  const nextCity = typed === '' ? '' : cityPick && weatherCityName(cityPick) === typed ? cityPick : null
  const cityDirty = nextCity !== (savedCity ?? '')
  const dirty = !!logoFile || cityDirty
  useUnsavedChanges('settings:school', dirty)

  function pickLogo(file: File | undefined) {
    if (!file) return
    setStatus(null)
    if (!LOGO_TYPES.includes(file.type) || file.size > MAX_LOGO_BYTES) {
      setErrors(e => ({ ...e, logo: 'יש לבחור תמונת PNG, JPG או WebP עד 3MB' })); return
    }
    setErrors(e => ({ ...e, logo: undefined })); setLogoFile(file)
  }

  function reset() {
    setLogoFile(null); setCityInput(weatherCityName(savedCity)); setCityPick(savedCity); setErrors({}); setStatus(null)
  }

  async function save() {
    if (busy.current || !dirty || !canEdit) return
    if (cityDirty && nextCity === null) { setErrors(e => ({ ...e, city: 'יש לבחור יישוב מתוך הרשימה' })); return }
    busy.current = true; setSaving(true); setStatus(null); setErrors({})
    const failed: string[] = []
    try {
      if (logoFile) {
        try {
          const body = new FormData(); body.append('file', logoFile)
          const r = await fetch(`/api/schools/${encodeURIComponent(school.id)}/logo`, { method: 'POST', body })
          const d = await r.json().catch(() => ({}))
          if (!r.ok) throw new Error(r.status === 403 ? 'אין לך הרשאה לשנות את הלוגו' : d.error || 'שמירת הלוגו נכשלה')
          setSavedLogo(d.logoUrl); setLogoFile(null)
        } catch (e) {
          const text = e instanceof Error ? e.message : 'שמירת הלוגו נכשלה'
          setErrors(x => ({ ...x, logo: text })); failed.push('הלוגו')
        }
      }
      if (cityDirty && nextCity !== null) {
        try {
          const r = await fetch(`/api/schools/${encodeURIComponent(school.id)}/weather-city`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: nextCity }),
          })
          const d = await r.json().catch(() => ({}))
          if (!r.ok) throw new Error(r.status === 403 ? 'אין לך הרשאה לשנות את העיר' : d.error || 'שמירת העיר נכשלה')
          setSavedCity(d.weatherCity ?? null); setCityPick(d.weatherCity ?? null); setCityInput(weatherCityName(d.weatherCity))
        } catch (e) {
          const text = e instanceof Error ? e.message : 'שמירת העיר נכשלה'
          setErrors(x => ({ ...x, city: text })); failed.push('העיר')
        }
      }
      if (failed.length) setStatus({ kind: 'error', text: `לא נשמרו: ${failed.join(' ו')}. נסו שוב.` })
      else { setStatus({ kind: 'success', text: 'פרטי בית הספר נשמרו' }); toast.success('פרטי בית הספר נשמרו לכל המסכים') }
    } finally { busy.current = false; setSaving(false) }
  }

  const logoShown = preview ?? savedLogo
  return (
    <Card id="school" className="scroll-mt-20 overflow-visible">
      <CardHeader title="פרטי בית הספר" description="משותפים לכל המסכים של בית הספר" />
      <CardBody className="grid gap-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-ui-sm bg-ui-subtle text-ui-muted"><Building2 className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-xs text-ui-muted">שם בית הספר</p>
            <p className="truncate text-[15px] font-semibold text-ui-ink">{school.name}</p>
          </div>
        </div>

        <Field label="לוגו" error={errors.logo} hint={logoFile ? 'הלוגו החדש יישמר בלחיצה על שמירה' : 'PNG, JPG או WebP עד 3MB. מוצג בכותרת ובמסך ההמתנה.'}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-ui-sm border border-ui-border bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:12px_12px]">
              {logoShown
                ? <img src={logoShown} alt={preview ? 'תצוגה מקדימה של הלוגו החדש' : 'הלוגו הנוכחי'} className="max-h-14 max-w-[104px] object-contain" />
                : <span className="text-xs text-ui-faint">אין לוגו</span>}
            </div>
            {canEdit && <>
              <input ref={fileInput} type="file" accept={LOGO_TYPES.join(',')} className="sr-only" tabIndex={-1} aria-hidden="true"
                onChange={e => { pickLogo(e.target.files?.[0]); e.currentTarget.value = '' }} />
              <Button size="sm" onClick={() => fileInput.current?.click()} disabled={saving} icon={<ImageUp className="h-4 w-4" aria-hidden="true" />}>
                {savedLogo || logoFile ? 'החלפת לוגו' : 'העלאת לוגו'}
              </Button>
              {logoFile && <Button size="sm" variant="ghost" onClick={() => { setLogoFile(null); setErrors(e => ({ ...e, logo: undefined })) }} disabled={saving}>ביטול הבחירה</Button>}
            </>}
          </div>
        </Field>

        <CityField value={cityInput} invalid={!!errors.city} error={errors.city} disabled={!canEdit || saving}
          onType={v => { setCityInput(v); setCityPick(null); setStatus(null); setErrors(e => ({ ...e, city: undefined })) }}
          onPick={c => { setCityInput(c.name); setCityPick(cityValue(c)); setStatus(null); setErrors(e => ({ ...e, city: undefined })) }}
          onClear={() => { setCityInput(''); setCityPick(null); setStatus(null) }} />
      </CardBody>
      {canEdit
        ? <SaveBar label="שמירת פרטי בית הספר" dirty={dirty} saving={saving} status={status} onSave={save} onReset={reset} />
        : <p className="border-t border-ui-border px-5 py-3 text-[13px] text-ui-muted">לצפייה בלבד. שינויים נעשים על ידי עורך או מנהל בית הספר.</p>}
    </Card>
  )
}

/** Picks a city from the list of Israeli localities (the weather service needs its coordinates). */
function CityField({ value, invalid, error, disabled, onType, onPick, onClear }: {
  value: string; invalid: boolean; error?: string; disabled: boolean
  onType: (v: string) => void; onPick: (c: City) => void; onClear: () => void
}) {
  const id = useId(), listId = `${id}-list`
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const q = value.trim()
  const results = q ? ISRAEL_WEATHER_CITIES.filter(c => c.name.includes(q) || c.english.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []
  const exact = results.some(c => c.name === q)
  const show = open && !!q && !exact
  function choose(c: City) { onPick(c); setOpen(false) }
  return (
    <Field label="עיר למזג האוויר" htmlFor={id} error={error}
      hint={value ? 'משמשת את רכיב מזג האוויר בכל המסכים' : 'לא נבחרה עיר: מוצגת עיר ברירת המחדל של המערכת'}>
      <div className="relative">
        <MapPin className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-faint" aria-hidden="true" />
        <Input id={id} value={value} disabled={disabled} invalid={invalid} autoComplete="off" maxLength={80} placeholder="חיפוש יישוב בישראל"
          role="combobox" aria-expanded={show} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={show && results[active] ? `${listId}-${active}` : undefined}
          className="ps-9 pe-9"
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={e => {
            const exactCity = ISRAEL_WEATHER_CITIES.find(c => c.name === e.target.value.trim())
            if (exactCity) onPick(exactCity); else onType(e.target.value)
            setActive(0); setOpen(true)
          }}
          onKeyDown={e => {
            if (!show || !results.length) return
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % results.length) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + results.length) % results.length) }
            else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]) }
            else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
          }} />
        {value && !disabled && <button type="button" onClick={onClear} aria-label="ניקוי העיר"
          className="ui-focus absolute end-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-ui-sm text-ui-muted hover:bg-ui-subtle"><X className="h-4 w-4" aria-hidden="true" /></button>}
        {show && <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-ui-sm border border-ui-border bg-ui-surface py-1 shadow-ui-lg">
          {results.length ? results.map((c, i) => (
            <li key={c.name} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); choose(c) }} onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-ui-primary-soft text-ui-primary-ink' : 'text-ui-ink-2'}`}>{c.name}</li>
          )) : <li className="px-3 py-2 text-sm text-ui-muted">לא נמצא יישוב ברשימה</li>}
        </ul>}
      </div>
    </Field>
  )
}
