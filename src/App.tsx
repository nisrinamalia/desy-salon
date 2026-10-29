import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowRight, BadgeCheck, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3,
  Edit3, Heart, Image, Instagram, LayoutDashboard, LogOut, MapPin, Menu, MessageCircle,
  Music2, PackageCheck, Plus, Search, Settings, Sparkles, Trash2, X,
} from 'lucide-react'
import brandLogo from './assets/logo-horizontal.png'
import { initialStore } from './data'
import type { Category, GalleryItem, Package, SalonStore, Schedule } from './types'

const STORE_KEY = 'desy-salon-store-v1'
const legacyProfile = {
  phone: '6281234567890',
  address: 'Jl. Melati Indah No. 18, Yogyakarta',
  openingHours: 'Senin–Sabtu, 09.00–18.00 WIB',
}
const scheduleStatuses = ['Menunggu Konfirmasi', 'Terkonfirmasi', 'Menunggu DP', 'Lunas'] as const
const eventTypes = ['Akad Nikah', 'Resepsi Adat', 'Wisuda & Pesta'] as const
const publicRoutes = ['/', '/paket'] as const
type PublicRoute = typeof publicRoutes[number]
type EditorKind = 'package' | 'schedule' | 'gallery'
type AdminTab = 'Katalog' | 'Kategori' | 'Jadwal' | 'Portfolio' | 'Pengaturan'

function readStore(): SalonStore {
  try {
    const saved = localStorage.getItem(STORE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<Omit<SalonStore, 'schedules'>> & {
        users?: unknown
        schedules?: Array<Omit<Schedule, 'status'> & { status: Schedule['status'] | 'Selesai' }>
      }
      delete parsed.users
      const profile = { ...initialStore.profile, ...parsed.profile }
      if (parsed.profile?.phone === legacyProfile.phone) profile.phone = initialStore.profile.phone
      if (parsed.profile?.address === legacyProfile.address) profile.address = initialStore.profile.address
      if (parsed.profile?.openingHours === legacyProfile.openingHours) profile.openingHours = initialStore.profile.openingHours
      const credentials = { ...initialStore.credentials, ...parsed.credentials }
      if ((parsed.credentials?.username === 'desy' && parsed.credentials.password === 'desy') || (parsed.credentials?.username === 'admin' && parsed.credentials.password === 'admin123')) {
        Object.assign(credentials, initialStore.credentials)
      }
      const schedules: Schedule[] = parsed.schedules?.map((schedule) => ({
        ...schedule,
        status: schedule.status === 'Selesai' ? 'Lunas' : schedule.status,
      })) ?? initialStore.schedules
      return { ...initialStore, ...parsed, profile, credentials, schedules }
    }
  } catch (error) {
    console.warn('Data salon lokal tidak dapat dibaca.', error)
  }
  return initialStore
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function rupiah(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}

function formatDate(value: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function whatsappLink(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}`
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits
}

function sessionForTime(value: string): Schedule['session'] {
  const hour = Number(value.split(':')[0])
  return hour < 11 ? 'Pagi' : hour < 15 ? 'Siang' : 'Sore'
}

function hasScheduleCollision(first: Schedule, second: Schedule) {
  if (first.eventDate !== second.eventDate) return false
  if (first.eventTime && second.eventTime) return first.eventTime === second.eventTime
  return first.session === second.session
}

async function imageFileToDataUrl(file: File) {
  const isSupportedType = ['image/png', 'image/jpeg'].includes(file.type)
  const hasSupportedExtension = /\.(png|jpe?g)$/i.test(file.name)
  if (!isSupportedType && !hasSupportedExtension) throw new Error('Pilih gambar berformat PNG, JPG, atau JPEG.')
  if (file.size > 15 * 1024 * 1024) throw new Error('Ukuran file maksimal 15 MB.')

  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('File tidak dapat dibaca.'))
    reader.onerror = () => reject(new Error('File tidak dapat dibaca.'))
    reader.readAsDataURL(file)
  })
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new window.Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('File gambar tidak valid.'))
    element.src = source
  })
  const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Browser tidak dapat memproses gambar.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.78)
  if (dataUrl.length > 900_000) throw new Error('File masih terlalu besar setelah diproses. Coba gambar yang lebih kecil.')
  return dataUrl
}

function SectionHeading({ eyebrow, title, description, align = 'center' }: { eyebrow: string; title: string; description?: string; align?: 'left' | 'center' }) {
  return <div className={`mb-9 max-w-2xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
    <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-rose-500">{eyebrow}</p>
    <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
    {description && <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">{description}</p>}
  </div>
}

function App() {
  const [store, setStore] = useState<SalonStore>(readStore)
  const [page, setPage] = useState<'public' | 'login' | 'admin'>(() => window.location.pathname === '/admin' ? 'login' : 'public')
  const [publicRoute, setPublicRoute] = useState<PublicRoute>(() => publicRoutes.includes(window.location.pathname as PublicRoute) ? window.location.pathname as PublicRoute : '/')
  const [activeTab, setActiveTab] = useState<AdminTab>('Katalog')
  const [selectedCategory, setSelectedCategory] = useState('Semua')
  const [search, setSearch] = useState('')
  const [bookingPackage, setBookingPackage] = useState<Package | null>(null)
  const [editor, setEditor] = useState<{ kind: EditorKind; item?: Package | Schedule | GalleryItem } | null>(null)
  const [notice, setNotice] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const syncRoute = () => setPublicRoute(publicRoutes.includes(window.location.pathname as PublicRoute) ? window.location.pathname as PublicRoute : '/')
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [])

  function navigatePublic(route: PublicRoute) {
    if (window.location.pathname !== route) window.history.pushState({}, '', route)
    setPublicRoute(route)
    setMenuOpen(false)
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store))
    } catch (error) {
      console.warn('Data salon tidak dapat disimpan ke browser.', error)
      setNotice('Penyimpanan browser penuh. Hapus beberapa gambar atau pilih file yang lebih kecil.')
    }
  }, [store])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const visiblePackages = useMemo(() => store.packages.filter((item) => {
    const matchesCategory = selectedCategory === 'Semua' || item.category.toLowerCase() === selectedCategory.toLowerCase()
    const term = search.trim().toLowerCase()
    return matchesCategory && (!term || `${item.name} ${item.description} ${item.category} ${item.features.join(' ')}`.toLowerCase().includes(term))
  }), [store.packages, selectedCategory, search])

  function openEditor(kind: EditorKind, item?: Package | Schedule | GalleryItem) {
    setEditor({ kind, item })
  }

  function saveEntity(event: FormEvent<HTMLFormElement>, kind: EditorKind, item?: Package | Schedule | GalleryItem) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = (name: string) => String(form.get(name) ?? '').trim()
    const id = item?.id ?? makeId(kind)
    let scheduleCollision: Schedule | undefined

    if (kind === 'package') {
      const name = value('name')
      const price = Number(value('price'))
      if (!name || !price || !value('image')) return setNotice('Nama, harga, dan foto wajib diisi.')
      const entity: Package = {
        id, name, category: value('category'), price,
        originalPrice: value('originalPrice') ? Number(value('originalPrice')) : undefined,
        badge: value('badge') || undefined, image: value('image'), description: value('description'),
        features: value('features').split('\n').map((feature) => feature.trim()).filter(Boolean),
      }
      setStore((current) => ({ ...current, packages: item ? current.packages.map((entry) => entry.id === id ? entity : entry) : [entity, ...current.packages] }))
    }
    if (kind === 'schedule') {
      const eventTime = value('eventTime') || undefined
      const previousSchedule = item as Schedule | undefined
      const entity: Schedule = {
        id,
        clientName: previousSchedule?.clientName ?? value('clientName'),
        packageName: previousSchedule?.packageName ?? value('packageName'),
        eventDate: value('eventDate'),
        eventTime,
        whatsapp: previousSchedule?.whatsapp ?? (value('whatsapp') || undefined),
        session: eventTime ? sessionForTime(eventTime) : previousSchedule?.session ?? 'Full Day',
        location: value('location'),
        notes: value('notes'),
        status: value('status') as Schedule['status'],
      }
      scheduleCollision = store.schedules.find((entry) => entry.id !== id && hasScheduleCollision(entry, entity))
      setStore((current) => ({ ...current, schedules: item ? current.schedules.map((entry) => entry.id === id ? entity : entry) : [entity, ...current.schedules] }))
    }
    if (kind === 'gallery') {
      const entity: GalleryItem = {
        id, title: value('title'), eventType: value('eventType') as GalleryItem['eventType'], tag: value('tag'),
        imageUrl: value('imageUrl'), description: value('description'),
      }
      setStore((current) => ({ ...current, gallery: item ? current.gallery.map((entry) => entry.id === id ? entity : entry) : [entity, ...current.gallery] }))
    }
    setEditor(null)
    if (scheduleCollision) setNotice(`Jadwal disimpan, tetapi bentrok dengan ${scheduleCollision.clientName} (${scheduleCollision.session}).`)
    else setNotice(item ? 'Perubahan berhasil disimpan.' : 'Data baru berhasil ditambahkan.')
  }

  function deleteEntity(collection: 'packages' | 'schedules' | 'gallery', id: string) {
    if (!window.confirm('Hapus data ini? Tindakan ini tidak dapat dibatalkan.')) return
    setStore((current) => ({ ...current, [collection]: current[collection].filter((entry) => entry.id !== id) }))
    setNotice('Data berhasil dihapus.')
  }

  function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('categoryName') ?? '').trim()
    if (!name) return
    const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
    if (store.categories.some((category) => category.slug === slug)) return setNotice('Kategori tersebut sudah tersedia.')
    setStore((current) => ({ ...current, categories: [...current.categories, { id: makeId('kategori'), name, slug }] }))
    event.currentTarget.reset()
    setNotice('Kategori berhasil ditambahkan.')
  }

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const phone = String(form.get('phone') ?? '').replace(/\D/g, '')
    const username = String(form.get('username') ?? '').trim()
    const password = String(form.get('password') ?? '')
    if (!/^62\d{8,13}$/.test(phone)) return setNotice('Nomor WhatsApp harus berformat 62, contoh 628123456789.')
    if (!username || password.length < 6) return setNotice('Username wajib diisi dan password minimal 6 karakter.')
    setStore((current) => ({
      ...current,
      profile: { ...current.profile, phone, address: String(form.get('address') ?? '').trim(), openingHours: String(form.get('openingHours') ?? '').trim() },
      credentials: { username, password },
    }))
    setNotice('Pengaturan studio berhasil diperbarui.')
  }

  function removeCategory(category: Category) {
    if (store.packages.some((item) => item.category === category.name)) return setNotice('Kategori masih dipakai paket. Pindahkan atau hapus paket terkait terlebih dahulu.')
    if (!window.confirm(`Hapus kategori ${category.name}?`)) return
    setStore((current) => ({ ...current, categories: current.categories.filter((entry) => entry.id !== category.id) }))
    setNotice('Kategori berhasil dihapus.')
  }

  function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!bookingPackage) return
    const form = new FormData(event.currentTarget)
    const date = String(form.get('date') ?? '')
    const time = String(form.get('time') ?? '')
    const clientName = String(form.get('clientName') ?? '').trim()
    const phone = normalizePhone(String(form.get('phone') ?? ''))
    if (!clientName || !/^62\d{8,13}$/.test(phone)) {
      setNotice('Nama dan nomor WhatsApp yang valid wajib diisi.')
      return
    }
    const booking: Schedule = {
      id: makeId('booking'), clientName, whatsapp: phone, packageName: bookingPackage.name,
      eventDate: date, eventTime: time, session: sessionForTime(time), location: '', notes: '', status: 'Menunggu Konfirmasi',
    }
    setStore((current) => ({ ...current, schedules: [booking, ...current.schedules] }))
    const message = [
      `Halo ${store.profile.name}, saya ingin melanjutkan konfirmasi booking.`, '',
      `Nama: ${clientName}`, `Nomor WhatsApp: +${phone}`, `Paket: ${bookingPackage.name}`,
      `Tanggal: ${formatDate(date)}`, `Waktu: ${time}`, '', 'Mohon konfirmasi ketersediaan jadwal ini. Terima kasih.',
    ].join('\n')
    window.open(`${whatsappLink(store.profile.phone)}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
    setBookingPackage(null)
    setNotice('Booking tersimpan dan menunggu konfirmasi melalui WhatsApp.')
  }

  function beginBooking(item: Package) {
    setBookingPackage(item)
  }

  function loginOwner() {
    setPage('admin')
    setNotice('Selamat datang kembali, Desy.')
  }

  function logout() {
    setPage('public')
    setActiveTab('Katalog')
    navigatePublic('/')
  }

  if (page === 'login') return <LoginPage
    store={store}
    onOwnerLogin={loginOwner}
  />

  if (page === 'admin') return <>
    <AdminDashboard store={store} activeTab={activeTab} setActiveTab={setActiveTab} onOpen={openEditor} onDelete={deleteEntity} onCategoryAdd={submitCategory} onCategoryRemove={removeCategory} onSettingsSave={saveSettings} onLogout={logout} />
    {editor && <EntityModal editor={editor} store={store} onClose={() => setEditor(null)} onSave={saveEntity} />}
    {notice && <Toast message={notice} onClose={() => setNotice('')} />}
  </>

  return <div className="min-h-screen bg-white text-slate-900">
    <PublicNavbar
      profileName={store.profile.name}
      activeRoute={publicRoute}
      menuOpen={menuOpen}
      setMenuOpen={setMenuOpen}
      onNavigate={navigatePublic}
    />
    <main>
      {publicRoute === '/' && <section id="beranda" className="hero-wash relative flex min-h-[620px] items-center overflow-hidden border-b border-rose-100/60 sm:min-h-[680px]">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-rose-50/40" />
        <div className="relative mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:px-12">
          <div className="max-w-[610px] reveal">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white/80 px-3.5 py-2 text-xs font-semibold text-rose-700 shadow-sm backdrop-blur">
              <Sparkles size={15} className="text-amber-500" /> Membingkai hari paling berhargamu dengan riasan yang mempesona
            </div>
            <h1 className="font-display text-5xl font-semibold leading-[1.1] tracking-tight text-slate-900 sm:text-6xl lg:text-[68px]">Hari istimewamu,<br /><span className="italic text-rose-600">secantik ceritamu.</span></h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:text-lg">Riasan yang terasa seperti dirimu, dibuat dengan cinta untuk momen yang akan selalu kamu kenang.</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="/paket" onClick={(event) => { event.preventDefault(); navigatePublic('/paket') }} className="btn-primary focus-ring">Temukan paket impian <ArrowRight size={17} /></a>
              <a href="/paket" onClick={(event) => { event.preventDefault(); navigatePublic('/paket') }} className="btn-secondary bg-white/80 backdrop-blur">Lihat katalog & karya</a>
            </div>
          </div>
        </div>
        <div className="absolute bottom-8 right-8 hidden rounded-2xl border border-white/70 bg-white/80 p-4 shadow-lg backdrop-blur sm:block lg:right-[9%]">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600"><Heart size={19} fill="currentColor" /></span><div><p className="text-xs text-slate-500">Dibuat dengan penuh cinta</p><p className="text-sm font-semibold text-slate-800">Untuk cerita indahmu</p></div></div>
        </div>
      </section>}

      {publicRoute === '/paket' && <section id="paket" className="min-h-[70vh] bg-rose-50/40 px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="Pilih yang paling kamu" title="Paket rias penuh cerita" description="Setiap detail kami siapkan dengan sepenuh hati, agar kamu bisa menikmati setiap momen." />
          <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {['Semua', ...store.categories.map((category) => category.name)].map((category) => <button key={category} onClick={() => setSelectedCategory(category)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${selectedCategory === category ? 'bg-rose-500 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:text-rose-600'}`}>{category}</button>)}
            </div>
            <label className="relative block w-full lg:max-w-xs"><Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="field rounded-full py-2.5 pl-10" placeholder="Cari paket atau layanan..." /></label>
          </div>
          {visiblePackages.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {visiblePackages.map((item) => <PackageCard key={item.id} item={item} onBook={() => beginBooking(item)} />)}
          </div> : <div className="rounded-2xl border border-dashed border-rose-200 bg-white py-14 text-center"><Search className="mx-auto mb-3 text-rose-300" /><p className="font-semibold text-slate-700">Paket belum ditemukan</p><p className="mt-1 text-sm text-slate-500">Coba kata kunci atau kategori lainnya.</p></div>}
          <p className="mt-7 text-center text-xs text-slate-500">Setiap paket dapat disesuaikan. Ceritakan kebutuhanmu saat berkonsultasi.</p>
          <PortfolioCarousel items={store.gallery} />
        </div>
      </section>}

    </main>
    <PublicFooter store={store} onNavigate={navigatePublic} />
    {bookingPackage && <BookingModal item={bookingPackage} onClose={() => setBookingPackage(null)} onSubmit={submitBooking} />}
    {notice && <Toast message={notice} onClose={() => setNotice('')} />}
  </div>
}

function PublicNavbar({ profileName, activeRoute, menuOpen, setMenuOpen, onNavigate }: {
  profileName: string
  activeRoute: PublicRoute
  menuOpen: boolean
  setMenuOpen: (value: boolean) => void
  onNavigate: (route: PublicRoute) => void
}) {
  const links: { name: string; href: PublicRoute }[] = [
    { name: 'Beranda', href: '/' }, { name: 'Katalog', href: '/paket' },
  ]
  return <header className="sticky top-0 z-40 border-b border-rose-100/70 bg-white/85 backdrop-blur-xl">
    <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
      <a href="/" onClick={(event) => { event.preventDefault(); onNavigate('/') }} className="flex shrink-0 items-center"><img src={brandLogo} alt={profileName} className="h-10 w-auto max-w-[190px] object-contain" /></a>
      <nav className="hidden items-center gap-5 md:flex">{links.map(({ name, href }) => <a key={name} href={href} onClick={(event) => { event.preventDefault(); onNavigate(href) }} aria-current={activeRoute === href ? 'page' : undefined} className={`text-sm font-medium transition hover:text-rose-600 ${activeRoute === href ? 'text-rose-600' : 'text-slate-600'}`}>{name}</a>)}</nav>
      <button aria-label="Buka menu" onClick={() => setMenuOpen(!menuOpen)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-rose-50 md:hidden">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
    </div>
    {menuOpen && <nav className="border-t border-rose-100 bg-white px-5 py-3 md:hidden">{links.map(({ name, href }) => <a onClick={(event) => { event.preventDefault(); onNavigate(href) }} key={name} href={href} aria-current={activeRoute === href ? 'page' : undefined} className={`block py-2.5 text-sm font-semibold ${activeRoute === href ? 'text-rose-600' : 'text-slate-700'}`}>{name}</a>)}</nav>}
  </header>
}

function PackageCard({ item, onBook }: { item: Package; onBook: () => void }) {
  const showPrice = item.category.toLowerCase() === 'perawatan'
  return <article className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
    <div className="relative h-64 overflow-hidden sm:h-72"><img src={item.image} alt={item.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" />{item.badge && <span className="absolute left-4 top-4 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-700"><Sparkles size={12} className="mr-1 inline" />{item.badge}</span>}<span className="absolute bottom-4 right-4 rounded-full bg-white/90 px-3 py-1 text-sm font-bold text-slate-700 backdrop-blur">{item.category}</span></div>
    <div className="p-6"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-2xl font-bold text-slate-900">{item.name}</h3><p className="mt-2 text-base font-medium leading-6 text-slate-600">{item.description}</p></div></div>
      <div className="my-5 border-t border-slate-100" /><ul className="space-y-2.5">{item.features.slice(0, 4).map((feature) => <li key={feature} className="flex items-center gap-2 text-base font-medium text-slate-700"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check size={12} strokeWidth={3} /></span>{feature}</li>)}</ul>
      <div className="mt-6 flex min-h-12 items-center justify-between gap-3">{showPrice ? <div>{item.originalPrice && <p className="text-sm font-medium text-slate-500 line-through">{rupiah(item.originalPrice)}</p>}<p className="text-xl font-bold text-rose-600">{rupiah(item.price)}<span className="ml-1 text-sm font-semibold text-slate-600">/ layanan</span></p></div> : <span className="text-sm font-semibold text-slate-500">Harga melalui konsultasi</span>}<button onClick={onBook} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700"><MessageCircle size={17} /> Pesan</button></div>
    </div>
  </article>
}

function PortfolioCarousel({ items }: { items: GalleryItem[] }) {
  const track = useRef<HTMLDivElement>(null)
  function scroll(direction: -1 | 1) {
    track.current?.scrollBy({ left: direction * track.current.clientWidth * 0.8, behavior: 'smooth' })
  }
  return <section className="mt-16 border-t border-rose-100 pt-12">
    <div className="mb-6 flex items-end justify-between gap-4">
      <SectionHeading eyebrow="Portofolio rias" title="Inspirasi dari karya kami" description="Geser untuk melihat berbagai hasil riasan Desy Salon." align="left" />
      <div className="mb-9 hidden gap-2 sm:flex">
        <button aria-label="Foto sebelumnya" onClick={() => scroll(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"><ChevronLeft size={19} /></button>
        <button aria-label="Foto berikutnya" onClick={() => scroll(1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"><ChevronRight size={19} /></button>
      </div>
    </div>
    {items.length ? <div ref={track} className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-4">
      {items.map((item) => <article key={item.id} className="group relative h-72 w-[82%] shrink-0 snap-start overflow-hidden rounded-2xl bg-slate-200 sm:h-80 sm:w-[48%] lg:w-[32%]">
        <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/5 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <div className="mb-2 flex gap-2"><span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-semibold backdrop-blur">{item.eventType}</span><span className="rounded-full bg-rose-400/90 px-2.5 py-1 text-[10px] font-semibold">{item.tag}</span></div>
          <h3 className="font-display text-xl font-semibold">{item.title}</h3>
          <p className="mt-1 max-w-sm text-xs leading-5 text-white/80">{item.description}</p>
        </div>
      </article>)}
    </div> : <EmptyState label="Foto portofolio akan segera ditambahkan." />}
  </section>
}

function PublicFooter({ store, onNavigate }: { store: SalonStore; onNavigate: (route: PublicRoute) => void }) {
  const links: { name: string; href: PublicRoute }[] = [
    { name: 'Beranda', href: '/' }, { name: 'Katalog rias', href: '/paket' },
  ]
  return <footer className="border-t border-slate-200 bg-slate-50 px-5 py-12 sm:px-8 lg:px-12">
    <div className="mx-auto grid max-w-7xl gap-8 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.65fr)_minmax(0,0.85fr)_minmax(0,1.45fr)] lg:gap-7">
      <div>
        <a href="/" onClick={(event) => { event.preventDefault(); onNavigate('/') }} className="inline-flex items-center"><img src={brandLogo} alt={store.profile.name} className="h-12 w-auto max-w-[220px] object-contain" /></a>
        <p className="mt-4 max-w-[230px] text-sm font-medium leading-6 text-slate-700">Riasan penuh rasa, untuk hari-hari yang penuh makna. Mari siapkan momen terbaikmu bersama kami.</p>
        <a href={whatsappLink(store.profile.phone)} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"><MessageCircle size={16} /> Hubungi via WhatsApp</a>
      </div>
      <div><h3 className="mb-4 text-sm font-bold text-slate-900">Kunjungi studio</h3><p className="flex gap-2 text-sm leading-6 text-slate-600"><MapPin size={17} className="mt-0.5 shrink-0 text-rose-500" />{store.profile.address}</p><p className="mt-3 flex gap-2 text-sm text-slate-600"><Clock3 size={16} className="shrink-0 text-rose-500" />{store.profile.openingHours}</p></div>
      <div><h3 className="mb-4 text-sm font-bold text-slate-900">Jelajahi</h3><div className="grid gap-2 text-sm font-medium text-slate-700">{links.map(({ name, href }) => <a key={href} href={href} onClick={(event) => { event.preventDefault(); onNavigate(href) }} className="hover:text-rose-600">{name}</a>)}</div></div>
      <div><h3 className="mb-4 text-sm font-bold text-slate-900">Media Sosial</h3><div className="grid gap-3"><a href="https://www.instagram.com/desyana_77/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-rose-600"><Instagram size={18} className="shrink-0 text-rose-500" /> @desyana_77</a><a href="https://www.tiktok.com/@desyana.s" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-rose-600"><Music2 size={18} className="shrink-0 text-rose-500" /> @desyana.s</a></div></div>
      <div><h3 className="mb-4 text-sm font-bold text-slate-900">Peta studio</h3><div className="h-[180px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm"><iframe title={`Peta lokasi ${store.profile.name}`} src={`https://www.google.com/maps?q=${encodeURIComponent(store.profile.address)}&output=embed`} className="h-full w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /></div></div>
    </div>
    <div className="mx-auto mt-10 max-w-7xl border-t border-slate-200 pt-5 text-xs text-slate-600"><span>© {new Date().getFullYear()} {store.profile.name}. Dibuat dengan sepenuh hati.</span></div>
  </footer>
}

function BookingModal({ item, onClose, onSubmit }: { item: Package; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <ModalFrame onClose={onClose}><div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-rose-500">Form booking</p><h2 className="mt-1 font-display text-2xl font-semibold text-slate-900">Lengkapi detail reservasi</h2></div><button aria-label="Tutup" onClick={onClose} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button></div><div className="mb-5 flex items-center gap-3 rounded-xl bg-rose-50 p-3"><img src={item.image} alt="" className="h-14 w-14 rounded-lg object-cover" /><div><p className="text-xs font-semibold text-slate-600">Paket pilihan</p><p className="font-bold text-slate-900">{item.name}</p></div></div><form onSubmit={onSubmit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div><label className="label" htmlFor="booking-name">Nama lengkap</label><input required id="booking-name" name="clientName" autoComplete="name" className="field" placeholder="Nama yang bisa kami hubungi" /></div><div><label className="label" htmlFor="booking-phone">Nomor WhatsApp</label><input required id="booking-phone" name="phone" type="tel" inputMode="tel" pattern="[+]?[0-9() -]{9,18}" autoComplete="tel" className="field" placeholder="08xxxxxxxxxx" /></div><div><label className="label" htmlFor="booking-date">Tanggal acara</label><input required id="booking-date" name="date" type="date" min={new Date().toISOString().slice(0, 10)} className="field" /></div><div><label className="label" htmlFor="booking-time">Waktu acara</label><input required id="booking-time" name="time" type="time" className="field" /></div></div><button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700"><MessageCircle size={17} /> Lanjutkan & konfirmasi via WA</button><p className="text-center text-xs font-medium text-slate-600">Booking tersimpan di dashboard admin dan menunggu konfirmasi.</p></form></ModalFrame>
}

function LoginPage({ store, onOwnerLogin }: { store: SalonStore; onOwnerLogin: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (username.trim() === store.credentials.username && password === store.credentials.password) onOwnerLogin()
    else setError('Username atau password belum sesuai.')
  }

  return <main className="flex min-h-screen items-center justify-center bg-rose-50/50 px-5 py-10">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg sm:p-9">
      <img src={brandLogo} alt={store.profile.name} className="mb-8 h-12 w-auto max-w-[220px] object-contain object-left" />
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Login Admin</h1>
      <form onSubmit={submit} className="mt-7 space-y-5">
        <div><label className="label" htmlFor="auth-username">Username</label><input required autoComplete="username" id="auth-username" value={username} onChange={(event) => setUsername(event.target.value)} className="field py-3" placeholder="Masukkan username admin" /></div>
        <div><label className="label" htmlFor="auth-password">Password</label><input required autoComplete="current-password" id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="field py-3" placeholder="Masukkan password" /></div>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
        <button type="submit" className="btn-primary w-full py-3">Masuk</button>
      </form>
    </div>
  </main>
}

function AdminDashboard({ store, activeTab, setActiveTab, onOpen, onDelete, onCategoryAdd, onCategoryRemove, onSettingsSave, onLogout }: {
  store: SalonStore; activeTab: AdminTab; setActiveTab: (tab: AdminTab) => void;
  onOpen: (kind: EditorKind, item?: Package | Schedule | GalleryItem) => void;
  onDelete: (collection: 'packages' | 'schedules' | 'gallery', id: string) => void;
  onCategoryAdd: (event: FormEvent<HTMLFormElement>) => void; onCategoryRemove: (category: Category) => void;
  onSettingsSave: (event: FormEvent<HTMLFormElement>) => void; onLogout: () => void;
}) {
  const tabs: { name: AdminTab; icon: typeof PackageCheck }[] = [
    { name: 'Katalog', icon: PackageCheck }, { name: 'Kategori', icon: LayoutDashboard }, { name: 'Jadwal', icon: CalendarDays },
    { name: 'Portfolio', icon: Image }, { name: 'Pengaturan', icon: Settings },
  ]
  return <div className="min-h-screen min-w-0 overflow-x-hidden bg-slate-50">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <a href="/" className="flex h-[76px] items-center border-b border-slate-100 px-6"><img src={brandLogo} alt="Desy Salon" className="h-11 w-auto max-w-[190px] object-contain" /></a>
      <nav className="flex-1 space-y-1 px-3 py-5">{tabs.map(({ name, icon: Icon }) => <button key={name} onClick={() => setActiveTab(name)} className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${activeTab === name ? 'bg-rose-50 text-rose-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Icon size={18} />{name}</button>)}</nav>
      <div className="border-t border-slate-100 p-4"><div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-rose-700"><Settings size={17} /></span><div className="min-w-0"><p className="text-sm font-semibold text-slate-800">Desy</p><p className="text-xs text-slate-500">Pemilik studio</p></div></div></div>
    </aside>
    <div className="min-w-0 lg:pl-64">
      <header className="sticky top-0 z-20 flex min-h-[76px] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:flex-nowrap sm:px-8">
        <div className="min-w-0 flex-1"><p className="text-xs text-slate-500">Studio Manager <span className="mx-1 text-slate-300">/</span> <span className="font-semibold text-slate-800">{activeTab}</span></p><h1 className="mt-1 text-base font-semibold tracking-tight text-slate-900 sm:text-lg">Dashboard Pengelola</h1></div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">Admin · Desy</span>
          <button type="button" onClick={onLogout} className="btn-secondary !px-3 !py-2 text-xs sm:!px-4 sm:text-sm"><LogOut size={15} />Keluar</button>
        </div>
      </header>
      <main className="mx-auto min-w-0 max-w-[1440px] px-3 py-5 sm:px-8 sm:py-7 lg:px-9">
        <section className="mb-5 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:mb-7 sm:gap-3 xl:grid-cols-3"><StatCard title="Paket Katalog" count={store.packages.length} detail="Pilihan layanan" icon={PackageCheck} color="rose" /><StatCard title="Foto Portofolio" count={store.gallery.length} detail="Karya pilihan" icon={Image} color="amber" /><StatCard title="Booking Mendatang" count={store.schedules.filter((item) => item.status !== 'Lunas').length} detail="Perlu ditangani" icon={CalendarDays} color="sky" /></section>
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex max-w-full gap-1 overflow-x-auto border-b border-slate-200 px-2 pt-3 sm:px-5">{tabs.map(({ name, icon: Icon }) => <button key={name} onClick={() => setActiveTab(name)} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-semibold transition sm:px-4 sm:text-sm ${activeTab === name ? 'border-rose-500 text-rose-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><Icon size={16} />{name}</button>)}</div><div className="min-w-0 p-3 sm:p-6">{activeTab === 'Katalog' && <PackagesManager store={store} onOpen={onOpen} onDelete={onDelete} />}{activeTab === 'Kategori' && <CategoriesManager store={store} onAdd={onCategoryAdd} onRemove={onCategoryRemove} />}{activeTab === 'Jadwal' && <SchedulesManager store={store} onOpen={onOpen} onDelete={onDelete} />}{activeTab === 'Portfolio' && <GalleryManager store={store} onOpen={onOpen} onDelete={onDelete} />}{activeTab === 'Pengaturan' && <SettingsManager store={store} onSave={onSettingsSave} onLogout={onLogout} />}</div></section>
        <p className="mt-5 flex items-center gap-1.5 text-xs text-slate-400"><BadgeCheck size={14} /> Data tersimpan otomatis di perangkat ini.</p>
      </main>
    </div>
  </div>
}

function StatCard({ title, count, detail, icon: Icon, color }: { title: string; count: number; detail: string; icon: typeof PackageCheck; color: string }) {
  const styles: Record<string, string> = { rose: 'bg-rose-50 text-rose-600', amber: 'bg-amber-50 text-amber-600', emerald: 'bg-emerald-50 text-emerald-600', sky: 'bg-sky-50 text-sky-600' }
  return <article className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-2xl sm:p-5"><div className="min-w-0"><p className="text-[11px] font-semibold leading-4 text-slate-500 sm:text-xs">{title}</p><p className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{count}</p><p className="mt-1 text-[10px] text-slate-400 sm:text-[11px]">{detail}</p></div><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11 sm:rounded-xl ${styles[color]}`}><Icon size={19} /></span></article>
}

function PanelHeading({ title, description, onAdd, addLabel = 'Tambah data' }: { title: string; description: string; onAdd?: () => void; addLabel?: string }) {
  return <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500 sm:text-sm">{description}</p></div>{onAdd && <button onClick={onAdd} className="btn-primary !px-4 !py-2.5"><Plus size={16} />{addLabel}</button>}</div>
}

function EmptyState({ label }: { label: string }) { return <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">{label}</div> }
function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) { return <div className="flex items-center justify-end gap-2"><button type="button" aria-label="Edit" title="Edit" onClick={onEdit} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"><Edit3 size={17} /></button><button type="button" aria-label="Hapus" title="Hapus" onClick={onDelete} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={17} /></button></div> }

function PackagesManager({ store, onOpen, onDelete }: { store: SalonStore; onOpen: (kind: EditorKind, item?: Package | Schedule | GalleryItem) => void; onDelete: (collection: 'packages' | 'schedules' | 'gallery', id: string) => void }) {
  return <>
    <PanelHeading title="Kelola Paket" description="Atur layanan, harga, dan informasi katalog publik." onAdd={() => onOpen('package')} addLabel="Tambah paket" />
    {store.packages.length ? <>
      <div className="grid gap-3 sm:hidden">
        {store.packages.map((item) => <article key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex min-w-0 items-start gap-3">
            <img src={item.image} alt="" className="h-16 w-20 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1"><h3 className="break-words text-sm font-bold text-slate-900">{item.name}</h3><p className="mt-1 text-xs font-semibold text-slate-600">{item.category}</p><p className="mt-1 break-words text-xs text-slate-600">{rupiah(item.price)}</p>{item.badge && <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{item.badge}</span>}</div>
          </div>
          <p className="mt-3 break-words text-xs leading-5 text-slate-600">{item.description}</p>
          <div className="mt-3 border-t border-slate-100 pt-3"><RowActions onEdit={() => onOpen('package', item)} onDelete={() => onDelete('packages', item.id)} /></div>
        </article>)}
      </div>
      <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[720px] text-left"><thead><tr className="border-y border-slate-100 text-[11px] uppercase tracking-wider text-slate-500"><th className="py-3 pr-4 font-semibold">Paket</th><th className="px-4 py-3 font-semibold">Kategori</th><th className="px-4 py-3 font-semibold">Harga</th><th className="px-4 py-3 font-semibold">Label</th><th className="py-3 pl-4 text-right font-semibold">Aksi</th></tr></thead><tbody>{store.packages.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="py-3 pr-4"><div className="flex items-center gap-3"><img src={item.image} alt="" className="h-11 w-14 rounded-lg object-cover" /><div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{item.name}</p><p className="max-w-xs truncate text-xs text-slate-500">{item.description}</p></div></div></td><td className="px-4 py-3 text-sm text-slate-700">{item.category}</td><td className="px-4 py-3 text-sm font-semibold text-slate-800">{rupiah(item.price)}</td><td className="px-4 py-3">{item.badge ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{item.badge}</span> : <span className="text-xs text-slate-500">-</span>}</td><td className="py-3 pl-4"><RowActions onEdit={() => onOpen('package', item)} onDelete={() => onDelete('packages', item.id)} /></td></tr>)}</tbody></table></div>
    </> : <EmptyState label="Belum ada paket. Tambahkan paket pertama." />}
  </>
}

function CategoriesManager({ store, onAdd, onRemove }: { store: SalonStore; onAdd: (event: FormEvent<HTMLFormElement>) => void; onRemove: (category: Category) => void }) {
  return <><PanelHeading title="Kelola Kategori" description="Kategori digunakan sebagai filter paket di halaman pengunjung." /><form onSubmit={onAdd} className="mb-6 flex flex-col gap-2 sm:flex-row"><input required name="categoryName" className="field sm:max-w-sm" placeholder="Nama kategori baru" /><button className="btn-primary !py-2.5"><Plus size={16} />Tambah kategori</button></form><div className="divide-y divide-slate-100 rounded-xl border border-slate-100">{store.categories.map((category) => <div key={category.id} className="flex items-center justify-between px-4 py-3"><div><p className="text-sm font-semibold text-slate-800">{category.name}</p><p className="text-xs text-slate-500">/{category.slug} · {store.packages.filter((item) => item.category === category.name).length} paket</p></div><button type="button" onClick={() => onRemove(category)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700" aria-label={`Hapus kategori ${category.name}`}><Trash2 size={16} /></button></div>)}</div></>
}

function SchedulesManager({ store, onOpen, onDelete }: { store: SalonStore; onOpen: (kind: EditorKind, item?: Package | Schedule | GalleryItem) => void; onDelete: (collection: 'packages' | 'schedules' | 'gallery', id: string) => void }) {
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null)
  const ordered = [...store.schedules].sort((a, b) => a.eventDate.localeCompare(b.eventDate))
  function editSchedule(schedule: Schedule) {
    setSelectedSchedule(null)
    onOpen('schedule', schedule)
  }
  return <>
    <PanelHeading title="Jadwal Booking" description="Berikut booking pelanggan" onAdd={() => onOpen('schedule')} addLabel="Tambah jadwal" />
    {ordered.length ? <>
      <div className="grid gap-3 md:hidden">
        {ordered.map((item) => {
          const collisions = store.schedules.filter((other) => other.id !== item.id && hasScheduleCollision(other, item))
          return <article key={item.id} role="button" tabIndex={0} onClick={() => setSelectedSchedule(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedSchedule(item) } }} className="min-w-0 cursor-pointer rounded-xl border border-slate-200 bg-white p-3 transition hover:border-rose-200 hover:bg-rose-50/30 focus:outline-none focus:ring-2 focus:ring-rose-200 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-sm font-bold text-slate-900">{item.clientName}</h3>{collisions.length > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">Bentrok</span>}</div><p className="mt-1 break-words text-xs font-semibold text-slate-700">{item.packageName}</p></div>
              <div onClick={(event) => event.stopPropagation()}><RowActions onEdit={() => editSchedule(item)} onDelete={() => onDelete('schedules', item.id)} /></div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 min-[380px]:grid-cols-2">
              <div><p className="text-[11px] font-bold uppercase text-slate-500">Pelaksanaan</p><p className="mt-1 text-xs font-semibold text-slate-800">{formatDate(item.eventDate)}{item.eventTime ? ` · ${item.eventTime} WIB` : ''}</p></div>
              <div><p className="text-[11px] font-bold uppercase text-slate-500">Status</p><div className="mt-1"><StatusBadge status={item.status} /></div></div>
              <div className="min-w-0 min-[380px]:col-span-2"><p className="text-[11px] font-bold uppercase text-slate-500">Lokasi</p><p className="mt-1 flex items-start gap-1 break-words text-xs font-medium text-slate-700"><MapPin size={14} className="mt-0.5 shrink-0 text-rose-500" />{item.location || 'Lokasi belum diisi'}</p></div>
            </div>
            {item.notes && <p className="mt-3 break-words border-t border-slate-100 pt-3 text-xs leading-5 text-slate-700"><span className="font-bold">Catatan:</span> {item.notes}</p>}
          </article>
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[720px] text-left">
        <thead><tr className="border-y border-slate-100 text-[11px] uppercase tracking-wider text-slate-500">
            <th className="py-3 pr-4 font-semibold">Nama pelanggan</th>
            <th className="px-4 py-3 font-semibold">Pelaksanaan</th>
            <th className="px-4 py-3 font-semibold">Paket</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="py-3 pl-4 text-right font-semibold">Aksi</th>
          </tr>
        </thead>
        <tbody>{ordered.map((item) => {
            const collisions = store.schedules.filter((other) => other.id !== item.id && hasScheduleCollision(other, item))
            return <tr key={item.id} tabIndex={0} onClick={() => setSelectedSchedule(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedSchedule(item) } }} className="cursor-pointer border-b border-slate-100 bg-white transition last:border-0 hover:bg-rose-50/50 focus:bg-rose-50/50 focus:outline-none">
              <td className="py-3 pr-4 align-top">
                <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-slate-800">{item.clientName}</span>{collisions.length > 0 && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">Bentrok</span>}</div>
                {item.notes && <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500"><span className="font-semibold text-slate-600">Catatan:</span> {item.notes}</p>}
              </td>
              <td className="px-4 py-3 align-top"><p className="text-sm font-semibold text-slate-800">{formatDate(item.eventDate)}</p>{item.eventTime && <p className="mt-1 text-xs text-slate-500">{item.eventTime} WIB</p>}<p className="mt-1.5 flex items-start gap-1 text-xs leading-5 text-slate-600"><MapPin size={14} className="mt-0.5 shrink-0 text-rose-500" />{item.location || 'Lokasi belum diisi'}</p></td>
              <td className="px-4 py-3 align-top text-sm font-semibold text-slate-700">{item.packageName}</td>
              <td className="px-4 py-3 align-top"><StatusBadge status={item.status} /></td>
              <td className="py-3 pl-4 text-right align-top" onClick={(event) => event.stopPropagation()}><RowActions onEdit={() => editSchedule(item)} onDelete={() => onDelete('schedules', item.id)} /></td>
            </tr>
          })}</tbody>
      </table>
      </div>
    </> : <EmptyState label="Belum ada booking tercatat." />}
    {selectedSchedule && <ScheduleDetailsModal schedule={selectedSchedule} collisions={store.schedules.filter((item) => item.id !== selectedSchedule.id && hasScheduleCollision(item, selectedSchedule))} onClose={() => setSelectedSchedule(null)} onEdit={() => editSchedule(selectedSchedule)} />}
  </>
}

function StatusBadge({ status }: { status: Schedule['status'] }) {
  const cls = status === 'Terkonfirmasi' || status === 'Lunas' ? 'bg-emerald-50 text-emerald-700' : status === 'Menunggu Konfirmasi' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-800'
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${cls}`}>{status}</span>
}

function ScheduleDetailsModal({ schedule, collisions, onClose, onEdit }: { schedule: Schedule; collisions: Schedule[]; onClose: () => void; onEdit: () => void }) {
  return <ModalFrame onClose={onClose}>
    <div className="mb-5 flex items-start justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-widest text-rose-600">Detail booking</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{schedule.clientName}</h2></div>
      <button aria-label="Tutup" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><X size={19} /></button>
    </div>
    {collisions.length > 0 && <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">Jadwal bentrok dengan {collisions.map((item) => item.clientName).join(', ')}</p>}
    <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
      <div><p className="text-xs font-semibold text-slate-500">Pelaksanaan</p><p className="mt-1 font-bold text-slate-900">{formatDate(schedule.eventDate)}</p>{schedule.eventTime && <p className="text-sm font-medium text-slate-700">{schedule.eventTime} WIB</p>}</div>
      <div><p className="text-xs font-semibold text-slate-500">Status</p><div className="mt-2"><StatusBadge status={schedule.status} /></div></div>
      <div><p className="text-xs font-semibold text-slate-500">Paket</p><p className="mt-1 font-bold text-slate-900">{schedule.packageName}</p></div>
      <div><p className="text-xs font-semibold text-slate-500">Lokasi</p><p className="mt-1 font-semibold text-slate-800">{schedule.location || 'Belum diisi'}</p></div>
      {schedule.whatsapp && <div className="sm:col-span-2"><p className="text-xs font-semibold text-slate-500">WhatsApp</p><a className="mt-1 inline-flex font-semibold text-emerald-700 hover:underline" href={`https://wa.me/${schedule.whatsapp}`} target="_blank" rel="noreferrer">+{schedule.whatsapp}</a></div>}
      <div className="sm:col-span-2"><p className="text-xs font-semibold text-slate-500">Catatan</p><p className="mt-1 whitespace-pre-wrap font-medium text-slate-800">{schedule.notes || 'Tidak ada catatan.'}</p></div>
    </div>
    <div className="mt-5 flex justify-end"><button type="button" onClick={onEdit} className="btn-primary"><Edit3 size={16} />Edit jadwal</button></div>
  </ModalFrame>
}

function GalleryManager({ store, onOpen, onDelete }: { store: SalonStore; onOpen: (kind: EditorKind, item?: Package | Schedule | GalleryItem) => void; onDelete: (collection: 'packages' | 'schedules' | 'gallery', id: string) => void }) {
  return <><PanelHeading title="Kelola Foto Portfolio" description="Foto ini tampil sebagai slider di dalam katalog publik." onAdd={() => onOpen('gallery')} addLabel="Tambah foto" />{store.gallery.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{store.gallery.map((item) => <article key={item.id} className="overflow-hidden rounded-xl border border-slate-200"><div className="relative h-40"><img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" /><span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-700">{item.eventType}</span></div><div className="flex items-center justify-between p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{item.title}</p><p className="text-xs text-slate-500">{item.tag}</p></div><RowActions onEdit={() => onOpen('gallery', item)} onDelete={() => onDelete('gallery', item.id)} /></div></article>)}</div> : <EmptyState label="Belum ada foto portfolio." />}</>
}

function SettingsManager({ store, onSave, onLogout }: { store: SalonStore; onSave: (event: FormEvent<HTMLFormElement>) => void; onLogout: () => void }) {
  return <><div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-slate-900">Pengaturan Studio</h2><p className="mt-1 text-sm font-medium text-slate-600">Informasi kontak publik dan akses pengelola.</p></div><button type="button" onClick={onLogout} className="btn-secondary !px-4 !py-2.5"><LogOut size={16} />Keluar dari admin</button></div><form onSubmit={onSave} className="grid gap-x-5 gap-y-4 md:grid-cols-2"><div><label className="label" htmlFor="studio-name">Nama salon</label><input id="studio-name" className="field bg-slate-50" value={store.profile.name} readOnly /></div><div><label className="label" htmlFor="studio-tag">Tagline</label><input id="studio-tag" className="field bg-slate-50" value={store.profile.tag} readOnly /></div><div><label className="label" htmlFor="studio-phone">Nomor WhatsApp tujuan</label><input required id="studio-phone" name="phone" defaultValue={store.profile.phone} className="field" /><p className="mt-1 text-[11px] text-slate-500">Format internasional tanpa +, contoh 628123456789.</p></div><div><label className="label" htmlFor="studio-hours">Jam operasional</label><input id="studio-hours" name="openingHours" defaultValue={store.profile.openingHours} className="field" /></div><div className="md:col-span-2"><label className="label" htmlFor="studio-address">Alamat studio</label><input id="studio-address" name="address" defaultValue={store.profile.address} className="field" /></div><div className="md:col-span-2 mt-3 border-t border-slate-100 pt-5"><h3 className="text-sm font-bold text-slate-800">Kredensial login admin</h3><p className="mt-1 text-xs font-medium text-slate-600">Gunakan password minimal 6 karakter.</p></div><div><label className="label" htmlFor="admin-user">Username</label><input required id="admin-user" name="username" defaultValue={store.credentials.username} className="field" /></div><div><label className="label" htmlFor="admin-password">Password baru</label><input required minLength={6} id="admin-password" name="password" defaultValue={store.credentials.password} type="password" className="field" /></div><div className="md:col-span-2"><button className="btn-primary mt-2"><Check size={16} />Simpan pengaturan</button></div></form><div className="mt-6 rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs font-medium leading-5 text-amber-900"><strong>Catatan:</strong> booking dan pengaturan disimpan di browser ini saja. Data belum tersinkron ke perangkat lain; gunakan backend dan database sebelum dipublikasikan untuk pemakaian bersama.</div></>
}

function EntityModal({ editor, store, onClose, onSave }: { editor: { kind: EditorKind; item?: Package | Schedule | GalleryItem }; store: SalonStore; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>, kind: EditorKind, item?: Package | Schedule | GalleryItem) => void }) {
  const { kind, item } = editor
  const titles: Record<EditorKind, string> = { package: item ? 'Edit Paket' : 'Tambah Paket', schedule: item ? 'Edit Jadwal' : 'Tambah Jadwal', gallery: item ? 'Edit Foto Portfolio' : 'Tambah Foto Portfolio' }
  const packageItem = item as Package | undefined
  const scheduleItem = item as Schedule | undefined
  const galleryItem = item as GalleryItem | undefined
  const [imageData, setImageData] = useState(kind === 'package' ? packageItem?.image ?? '' : galleryItem?.imageUrl ?? '')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [imageError, setImageError] = useState('')
  const input = (label: string, name: string, value = '', props: Record<string, string> = {}) => <div><label className="label" htmlFor={`editor-${name}`}>{label}</label><input id={`editor-${name}`} name={name} defaultValue={value} className="field" {...props} /></div>
  const select = (label: string, name: string, options: readonly string[], selected = '') => <div><label className="label" htmlFor={`editor-${name}`}>{label}</label><select id={`editor-${name}`} name={name} defaultValue={selected || options[0]} className="field">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
  const textarea = (label: string, name: string, value = '', placeholder = '') => <div className="sm:col-span-2"><label className="label" htmlFor={`editor-${name}`}>{label}</label><textarea id={`editor-${name}`} name={name} defaultValue={value} placeholder={placeholder} className="field min-h-20 resize-y" /></div>
  const imageField = (name: 'image' | 'imageUrl', label: string) => <div className="sm:col-span-2"><span className="label">{label} *</span><input type="hidden" name={name} value={imageData} /><label htmlFor="editor-image-file" className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-rose-200 bg-rose-50/60 px-4 py-4 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"><Image size={17} />Pilih gambar dari perangkat<input id="editor-image-file" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" required={!imageData} className="sr-only" onChange={async (event) => { const file = event.currentTarget.files?.[0]; if (!file) return; const fileInput = event.currentTarget; setImageError(''); try { setImageData(await imageFileToDataUrl(file)); setSelectedFileName(file.name) } catch (error) { setImageError(error instanceof Error ? error.message : 'Gambar tidak dapat diproses.'); fileInput.value = '' } }} /></label><p className="mt-1.5 text-xs text-slate-400">PNG, JPG, atau JPEG. Maks. 15 MB; gambar akan diperkecil untuk penyimpanan.</p>{selectedFileName && <p className="mt-1 text-xs font-medium text-slate-600">File dipilih: {selectedFileName}</p>}{imageError && <p role="alert" className="mt-2 text-xs font-medium text-rose-600">{imageError}</p>}{imageData && <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-100 p-2.5"><img src={imageData} alt="Preview gambar" className="h-16 w-20 rounded-lg bg-slate-100 object-cover" /><span className="flex-1 text-xs font-medium text-slate-600">Preview gambar</span><button type="button" onClick={() => { setImageData(''); setSelectedFileName('') }} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50">Hapus</button></div>}</div>
  return <ModalFrame onClose={onClose}><div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-rose-500">Studio Manager</p><h2 className="mt-1 font-display text-2xl font-semibold text-slate-900">{titles[kind]}</h2></div><button aria-label="Tutup" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={19} /></button></div><form onSubmit={(event) => onSave(event, kind, item)} className="grid max-h-[70vh] gap-4 overflow-y-auto px-0.5 sm:grid-cols-2">
    {kind === 'package' && <>{input('Nama paket *', 'name', packageItem?.name, { required: 'true', placeholder: 'Contoh: Akad Istimewa' })}{select('Kategori', 'category', store.categories.map((category) => category.name), packageItem?.category)}{input('Harga (angka) *', 'price', packageItem ? String(packageItem.price) : '', { type: 'number', min: '1', required: 'true', placeholder: '1850000' })}{input('Harga sebelum diskon', 'originalPrice', packageItem?.originalPrice ? String(packageItem.originalPrice) : '', { type: 'number', min: '1', placeholder: 'Opsional' })}{input('Badge promo', 'badge', packageItem?.badge, { placeholder: 'Contoh: Favorit' })}{imageField('image', 'Foto paket')}{textarea('Deskripsi', 'description', packageItem?.description, 'Ceritakan keunggulan paket...')}{textarea('Fitur (satu fitur per baris)', 'features', packageItem?.features.join('\n'), 'Makeup premium\nHairdo')}<p className="sm:col-span-2 -mt-3 text-[11px] text-slate-400">Setiap baris akan menjadi satu fitur paket.</p></>}
    {kind === 'schedule' && <>{!scheduleItem && <>{input('Nama klien *', 'clientName', '', { required: 'true', placeholder: 'Nama lengkap' })}{input('Nomor WhatsApp', 'whatsapp', '', { type: 'tel', placeholder: '628xxxxxxxxxx' })}{select('Paket', 'packageName', store.packages.map((entry) => entry.name))}</>}{input('Tanggal acara *', 'eventDate', scheduleItem?.eventDate, { type: 'date', required: 'true' })}{input('Waktu acara', 'eventTime', scheduleItem?.eventTime, { type: 'time' })}{select('Status', 'status', scheduleStatuses, scheduleItem?.status)}{input('Lokasi rias', 'location', scheduleItem?.location, { placeholder: 'Gedung / alamat' })}{textarea('Catatan', 'notes', scheduleItem?.notes, 'Kebutuhan khusus...')}</>}
    {kind === 'gallery' && <>{input('Judul gaya *', 'title', galleryItem?.title, { required: 'true', placeholder: 'Contoh: Seruni di Pagi Akad' })}{select('Jenis momen', 'eventType', eventTypes, galleryItem?.eventType)}{input('Tag', 'tag', galleryItem?.tag, { placeholder: 'Soft glam / Adat Jawa' })}{imageField('imageUrl', 'Foto galeri')}{textarea('Deskripsi', 'description', galleryItem?.description, 'Deskripsi singkat foto...')}</>}
    <div className="sticky bottom-0 flex justify-end gap-2 bg-white pt-2 sm:col-span-2"><button type="button" onClick={onClose} className="btn-secondary">Batal</button><button type="submit" className="btn-primary"><Check size={16} />Simpan</button></div>
  </form></ModalFrame>
}

function ModalFrame({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])
  return <div onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }} className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm sm:p-4"><div role="dialog" aria-modal="true" className="my-auto max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/70 bg-white p-4 shadow-2xl sm:p-6">{children}</div></div>
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return <div role="status" className="fixed bottom-5 right-5 z-[60] flex max-w-sm items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600"><Check size={14} /></span><p className="flex-1 text-sm leading-5 text-slate-700">{message}</p><button aria-label="Tutup notifikasi" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800"><X size={16} /></button></div>
}

export default App