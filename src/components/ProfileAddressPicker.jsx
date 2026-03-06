import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronDown, LocateFixed, MapPin, Search } from 'lucide-react'

import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// Fix default marker icons in bundlers
// (Leaflet expects these files to exist at specific URLs)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const UF_OPTIONS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]

const digitsOnly = (v) => String(v || '').replace(/\D/g, '')

const normalizeBrazilStateToUF = (stateName) => {
  const s = String(stateName || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (!s) return ''

  const map = {
    acre: 'AC',
    alagoas: 'AL',
    amapa: 'AP',
    amazonas: 'AM',
    bahia: 'BA',
    ceara: 'CE',
    'distrito federal': 'DF',
    'espirito santo': 'ES',
    goias: 'GO',
    maranhao: 'MA',
    'mato grosso': 'MT',
    'mato grosso do sul': 'MS',
    'minas gerais': 'MG',
    para: 'PA',
    paraiba: 'PB',
    parana: 'PR',
    pernambuco: 'PE',
    piaui: 'PI',
    'rio de janeiro': 'RJ',
    'rio grande do norte': 'RN',
    'rio grande do sul': 'RS',
    rondonia: 'RO',
    roraima: 'RR',
    'santa catarina': 'SC',
    'sao paulo': 'SP',
    sergipe: 'SE',
    tocantins: 'TO',
  }

  return map[s] || ''
}

const maskCep = (v) => {
  const d = digitsOnly(v).slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

const buildAddressLabel = (a) => {
  const parts = []

  const street = String(a.street || '').trim()
  const number = String(a.number || '').trim()
  const neighborhood = String(a.neighborhood || '').trim()
  const city = String(a.city || '').trim()
  const state = String(a.state || '').trim()
  const cep = maskCep(a.cep || '')

  if (street) {
    parts.push(number ? `${street}, ${number}` : street)
  }

  const middle = []
  if (neighborhood) middle.push(neighborhood)
  if (city) middle.push(city)
  if (state) middle.push(state)

  if (middle.length) parts.push(middle.join(', '))
  if (cep) parts.push(cep)

  return parts.join(' - ')
}

const reverseGeocodeNominatim = async ({ lat, lng, signal }) => {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      // Nominatim pede um user-agent identificável; no browser isso é limitado,
      // mas pelo menos enviamos Accept.
      Accept: 'application/json',
    },
    signal,
  })

  if (!res.ok) throw new Error('Falha ao obter endereço pela localização.')
  const data = await res.json()

  const addr = data?.address || {}
  const street = addr.road || addr.pedestrian || addr.street || ''
  const neighborhood = addr.suburb || addr.neighbourhood || ''
  const city = addr.city || addr.town || addr.village || ''
  const state = addr.state || ''
  const stateCode = addr.state_code || ''
  const postcode = addr.postcode || ''

  const uf =
    String(stateCode || '').trim().toUpperCase() ||
    normalizeBrazilStateToUF(state) ||
    ''

  return {
    formatted: data?.display_name || '',
    street,
    neighborhood,
    city,
    state: uf,
    cep: postcode ? maskCep(postcode) : '',
    // número normalmente não vem, então deixamos em branco
  }
}

const fetchViaCep = async ({ cepDigits, signal }) => {
  const url = `https://viacep.com.br/ws/${cepDigits}/json/`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) throw new Error('Falha ao consultar CEP.')
  const data = await res.json()
  if (data?.erro) throw new Error('CEP não encontrado.')

  return {
    street: data?.logradouro || '',
    neighborhood: data?.bairro || '',
    city: data?.localidade || '',
    state: data?.uf || '',
  }
}

function InvalidateSizeOnMount() {
  const map = useMap()
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 0)
    const t2 = setTimeout(() => map.invalidateSize(), 250)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [map])
  return null
}

function InvalidateOnShow({ active }) {
  const map = useMap()
  useEffect(() => {
    if (!active) return
    const t1 = setTimeout(() => map.invalidateSize(), 120)
    const t2 = setTimeout(() => map.invalidateSize(), 500)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [active, map])
  return null
}

function RecenterOnPosition({ lat, lng }) {
  const map = useMap()
  const skipNextRef = useRef(false)
  // allow parent to mark updates coming from map interactions
  // by setting map.__JOBY_SKIP_RECENTER__ = true
  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

    // If the last position update came from the map itself (moveend),
    // don't immediately setView again (prevents loop/jitter).
    // We clear the flag after one skip.
    if (map && map.__JOBY_SKIP_RECENTER__ === true) {
      map.__JOBY_SKIP_RECENTER__ = false
      skipNextRef.current = true
      return
    }

    if (skipNextRef.current) {
      skipNextRef.current = false
      return
    }

    map.setView([lat, lng], map.getZoom(), { animate: false })
  }, [map, lat, lng])
  return null
}

function SyncCenterToValue({ onPick }) {
  const map = useMapEvents({
    moveend() {
      const c = map.getCenter()
      // mark that this update is coming from user interaction
      map.__JOBY_SKIP_RECENTER__ = true
      onPick?.({ lat: c.lat, lng: c.lng })
    },
    click(e) {
      map.__JOBY_SKIP_RECENTER__ = true
      map.panTo(e.latlng)
      onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

export default function ProfileAddressPicker({ value, onChange, toast }) {
  const [geoLoading, setGeoLoading] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [confirmedLabel, setConfirmedLabel] = useState('')
  const [tilesOk, setTilesOk] = useState(false)
  const [tileErr, setTileErr] = useState(false)
  const [open, setOpen] = useState(() => {
    const v = value || {}
    const hasAny =
      !!String(v.cep || '').trim() ||
      !!String(v.street || '').trim() ||
      !!String(v.city || '').trim() ||
      !!String(v.state || '').trim() ||
      Number.isFinite(Number(v.lat)) ||
      Number.isFinite(Number(v.lng))
    return !hasAny
  })

  const position = useMemo(() => {
    const lat = Number(value?.lat)
    const lng = Number(value?.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
    return { lat: -23.55052, lng: -46.633308 } // fallback: SP
  }, [value?.lat, value?.lng])

  useEffect(() => {
    setConfirmedLabel(value?.formatted || buildAddressLabel(value || {}))
  }, [value])

  const cepDigits = useMemo(() => digitsOnly(value?.cep), [value?.cep])

  const shouldShowDetails = useMemo(() => {
    const v = value || {}
    const hasAnyDetails =
      !!String(v.street || '').trim() ||
      !!String(v.number || '').trim() ||
      !!String(v.neighborhood || '').trim() ||
      !!String(v.city || '').trim() ||
      !!String(v.state || '').trim() ||
      Number.isFinite(Number(v.lat)) ||
      Number.isFinite(Number(v.lng))

    return cepDigits.length === 8 || hasAnyDetails
  }, [cepDigits.length, value])

  const prevOpenRef = useRef(open)
  const prevDetailsRef = useRef(shouldShowDetails)
  useEffect(() => {
    const wasOpen = prevOpenRef.current
    const wasDetails = prevDetailsRef.current

    // Reset loading state only when the map section becomes visible
    // (not on every lat/lng change while user moves the map).
    if ((!wasOpen && open) || (!wasDetails && shouldShowDetails)) {
      setTilesOk(false)
      setTileErr(false)
    }

    prevOpenRef.current = open
    prevDetailsRef.current = shouldShowDetails
  }, [open, shouldShowDetails])

  useEffect(() => {
    if (!open || !shouldShowDetails) return
    if (tilesOk || tileErr) return

    const t = setTimeout(() => {
      // Se nada carregou em alguns segundos, tratamos como erro para não parecer "cinza quebrado".
      setTileErr(true)
    }, 8000)

    return () => clearTimeout(t)
  }, [open, shouldShowDetails, tilesOk, tileErr])

  const mapPreviewLabel = useMemo(() => {
    const raw = confirmedLabel || buildAddressLabel(value || {})
    if (!raw) return ''
    const idx = raw.lastIndexOf(' - ')
    if (idx === -1) return raw
    return `${raw.slice(0, idx)} • ${raw.slice(idx + 3)}`
  }, [confirmedLabel, value])

  const canConfirm = useMemo(() => {
    const city = String(value?.city || '').trim()
    const uf = String(value?.state || '').trim().toUpperCase()
    const lat = Number(value?.lat)
    const lng = Number(value?.lng)
    return !!city && uf.length === 2 && Number.isFinite(lat) && Number.isFinite(lng)
  }, [value?.city, value?.state, value?.lat, value?.lng])

  const setField = (patch) => {
    onChange?.({
      ...value,
      ...patch,
    })
  }

  const handleUseMyLocation = async () => {
    if (!('geolocation' in navigator)) {
      toast?.({
        title: 'Localização indisponível',
        description: 'Seu dispositivo não suporta geolocalização.',
        variant: 'destructive',
      })
      return
    }

    setGeoLoading(true)
    try {
      const coords = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        )
      })

      const lat = coords.latitude
      const lng = coords.longitude
      setField({ lat, lng })

      try {
        const controller = new AbortController()
        const r = await reverseGeocodeNominatim({ lat, lng, signal: controller.signal })
        setField({
          street: r.street || value.street,
          neighborhood: r.neighborhood || value.neighborhood,
          city: r.city || value.city,
          state: r.state || value.state,
          cep: r.cep || value.cep,
        })
      } catch {
        // ok: sem reverse geocode, mantemos só lat/lng
      }
    } catch (e) {
      const msg = String(e?.message || e || '')
      toast?.({
        title: 'Não foi possível usar sua localização',
        description:
          msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')
            ? 'Permita o acesso à localização para preencher automaticamente.'
            : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setGeoLoading(false)
    }
  }

  const handleCepLookup = async () => {
    if (cepDigits.length !== 8) {
      toast?.({
        title: 'CEP inválido',
        description: 'Informe um CEP com 8 dígitos.',
        variant: 'destructive',
      })
      return
    }

    setCepLoading(true)
    const controller = new AbortController()
    try {
      const r = await fetchViaCep({ cepDigits, signal: controller.signal })
      setField({
        cep: maskCep(cepDigits),
        street: r.street,
        neighborhood: r.neighborhood,
        city: r.city,
        state: r.state,
      })
    } catch (e) {
      toast?.({
        title: 'Falha ao buscar CEP',
        description: e?.message || 'Não foi possível buscar esse CEP agora.',
        variant: 'destructive',
      })
    } finally {
      setCepLoading(false)
    }
  }

  const handleConfirmAddress = () => {
    if (!canConfirm) {
      toast?.({
        title: 'Endereço incompleto',
        description: 'Confirme apenas quando tiver Cidade, UF e o ponto no mapa.',
        variant: 'destructive',
      })
      return
    }

    const formatted = buildAddressLabel(value || {})

    setField({ formatted })
    setConfirmedLabel(formatted)
    toast?.({
      title: 'Endereço confirmado',
      description: 'Agora é só salvar o perfil para concluir.',
      variant: 'success',
      duration: 2500,
    })
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-md border bg-background px-3 text-sm"
        aria-label={open ? 'Recolher endereço' : 'Editar endereço'}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {confirmedLabel || buildAddressLabel(value || {}) || 'Adicionar endereço'}
          </span>
        </span>

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <>
          <Button
            type="button"
            className="w-full justify-center"
            onClick={handleUseMyLocation}
            disabled={geoLoading}
          >
            <LocateFixed className="w-4 h-4 mr-2" />
            {geoLoading ? 'Obtendo localização…' : 'Usar minha localização'}
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">ou</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <p className="text-sm text-muted-foreground">Digite o CEP para preencher automaticamente</p>

          <div className="space-y-2">
            <Label htmlFor="address_cep">
              CEP <span className="text-destructive">*</span>
            </Label>
            <div className="relative h-10 w-full overflow-hidden rounded-md border border-input bg-background">
              <Input
                id="address_cep"
                value={value?.cep || ''}
                onChange={(e) => setField({ cep: maskCep(e.target.value) })}
                placeholder="00000-000"
                inputMode="numeric"
                autoComplete="postal-code"
                className="h-10 border-0 pr-12 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <div className="pointer-events-none absolute right-12 top-1/2 h-6 -translate-y-1/2 border-l border-input" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCepLookup}
                disabled={cepLoading}
                className="absolute right-0 top-0 h-10 w-12 rounded-none"
                aria-label="Buscar CEP"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {shouldShowDetails ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2 min-w-0">
                  <Label htmlFor="address_street">
                    Rua <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="address_street"
                    value={value?.street || ''}
                    onChange={(e) => setField({ street: e.target.value })}
                    placeholder="Rua"
                    autoComplete="address-line1"
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  <Label htmlFor="address_number">
                    Número <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="address_number"
                    value={value?.number || ''}
                    onChange={(e) => setField({ number: e.target.value })}
                    placeholder="Número"
                    inputMode="numeric"
                    autoComplete="address-line2"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address_complement">Complemento</Label>
                <Input
                  id="address_complement"
                  value={value?.complement || ''}
                  onChange={(e) => setField({ complement: e.target.value })}
                  placeholder="Complemento"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2 min-w-0">
                  <Label htmlFor="address_neighborhood">
                    Bairro <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="address_neighborhood"
                    value={value?.neighborhood || ''}
                    onChange={(e) => setField({ neighborhood: e.target.value })}
                    placeholder="Bairro"
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  <Label htmlFor="address_city">
                    Cidade <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="address_city"
                    value={value?.city || ''}
                    onChange={(e) => setField({ city: e.target.value })}
                    placeholder="Cidade"
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  <Label>
                    UF <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={String(value?.state || '').toUpperCase()}
                    onValueChange={(v) => setField({ state: String(v || '').toUpperCase() })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {UF_OPTIONS.map((uf) => (
                        <SelectItem key={uf} value={uf}>
                          {uf}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Isso aparece no seu perfil e ajuda clientes perto de você.
              </p>

              <div className="space-y-2">
                <div className="rounded-xl border bg-background overflow-hidden">
                  <div className="px-3 py-3 border-b">
                    <p className="text-sm font-medium">Confirme o ponto exato</p>
                    <p className="text-xs text-muted-foreground">Mova o mapa para ajustar o ponto</p>
                  </div>

                  <div className="relative h-[220px] w-full bg-muted/30">
                    <MapContainer
                      center={[position.lat, position.lng]}
                      zoom={15}
                      scrollWheelZoom={false}
                      className="h-full w-full"
                    >
                      <InvalidateSizeOnMount />
                      <InvalidateOnShow active={open && shouldShowDetails} />
                      <RecenterOnPosition lat={position.lat} lng={position.lng} />

                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                        eventHandlers={{
                          load: () => setTilesOk(true),
                          tileload: () => setTilesOk(true),
                          tileerror: () => setTileErr(true),
                        }}
                      />

                      <SyncCenterToValue
                        onPick={({ lat, lng }) => {
                          setField({ lat, lng })
                        }}
                      />
                    </MapContainer>

                    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
                      <div className="grid place-items-center">
                        <MapPin className="h-8 w-8 text-primary drop-shadow-sm" />
                      </div>
                    </div>

                    {!tilesOk ? (
                      <div className="absolute inset-0 grid place-items-center">
                        <div className="absolute inset-0 bg-muted/40 animate-pulse" />
                        <div className="relative rounded-md border bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                          {tileErr
                            ? 'Não foi possível carregar o mapa. Verifique sua rede ou bloqueador.'
                            : 'Carregando mapa…'}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {mapPreviewLabel ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground border-t">
                      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span className="truncate">{mapPreviewLabel}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={handleConfirmAddress}
                disabled={!canConfirm}
              >
                Confirmar endereço
              </Button>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
