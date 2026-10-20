export interface Package {
  id: string
  name: string
  category: string
  price: number
  originalPrice?: number
  badge?: string
  image: string
  description: string
  features: string[]
}

export interface Category {
  id: string
  name: string
  slug: string
}

export interface Schedule {
  id: string
  clientName: string
  packageName: string
  eventDate: string
  eventTime?: string
  whatsapp?: string
  session: 'Pagi' | 'Siang' | 'Sore' | 'Full Day'
  location: string
  notes: string
  status: 'Menunggu Konfirmasi' | 'Terkonfirmasi' | 'Menunggu DP' | 'Selesai'
}

export interface GalleryItem {
  id: string
  title: string
  eventType: 'Akad Nikah' | 'Resepsi Adat' | 'Wisuda & Pesta'
  tag: string
  imageUrl: string
  description: string
}

export interface SalonProfile {
  name: string
  tag: string
  phone: string
  address: string
  openingHours: string
}

export interface UserAccount {
  id: string
  name: string
  phone: string
  pinSalt: string
  pinHash: string
}

export interface SalonStore {
  packages: Package[]
  categories: Category[]
  schedules: Schedule[]
  gallery: GalleryItem[]
  profile: SalonProfile
  credentials: { username: string; password: string }
  users: UserAccount[]
}