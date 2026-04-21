export type WooAddressLike = {
  first_name?: string
  last_name?: string
  address_1?: string
  address_2?: string
  city?: string
  state?: string
  postcode?: string
  country?: string
} | null | undefined

export function formatAddress(a: WooAddressLike): string {
  if (!a) return ''
  const parts = [
    [a.address_1, a.address_2].filter(Boolean).join(' '),
    [a.city, a.state].filter(Boolean).join(', '),
    a.postcode,
  ].filter(Boolean)
  return parts.join(' · ')
}

export function googleMapsLink(a: WooAddressLike): string | null {
  if (!a) return null
  const full = [
    a.address_1, a.address_2, a.city, a.state, a.postcode, a.country
  ].filter(Boolean).join(', ')
  if (!full) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}`
}
