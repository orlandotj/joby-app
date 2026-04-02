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

const isValidLatitude = (lat) => Number.isFinite(lat) && lat >= -90 && lat <= 90
const isValidLongitude = (lng) => Number.isFinite(lng) && lng >= -180 && lng <= 180
const isValidLatLng = (lat, lng) => isValidLatitude(lat) && isValidLongitude(lng)

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
  const street =
    addr.road ||
    addr.pedestrian ||
    addr.residential ||
    addr.footway ||
    addr.path ||
    addr.street ||
    ''
  const neighborhood =
    addr.suburb ||
    addr.neighbourhood ||
    addr.city_district ||
    addr.quarter ||
    addr.borough ||
    ''
  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.county ||
    ''
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

export default function ProfileAddressPicker({ value, onChange, toast }) {
  const [geoLoading, setGeoLoading] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const latestValueRef = useRef(value)
  const [open, setOpen] = useState(() => {
    const v = value || {}
    const lat = Number(v.lat)
    const lng = Number(v.lng)
    const hasAny =
      !!String(v.cep || '').trim() ||
      !!String(v.street || '').trim() ||
      !!String(v.city || '').trim() ||
      !!String(v.state || '').trim() ||
      isValidLatLng(lat, lng)
    return !hasAny
  })

  useEffect(() => {
    latestValueRef.current = value
  }, [value])

  const cepDigits = useMemo(() => digitsOnly(value?.cep), [value?.cep])

  const shouldShowDetails = useMemo(() => {
    const v = value || {}
    const lat = Number(v.lat)
    const lng = Number(v.lng)
    const hasAnyDetails =
      !!String(v.street || '').trim() ||
      !!String(v.number || '').trim() ||
      !!String(v.neighborhood || '').trim() ||
      !!String(v.city || '').trim() ||
      !!String(v.state || '').trim() ||
      isValidLatLng(lat, lng)

    return cepDigits.length === 8 || hasAnyDetails
  }, [cepDigits.length, value])

  const canConfirm = useMemo(() => {
    const street = String(value?.street || '').trim()
    const city = String(value?.city || '').trim()
    const uf = String(value?.state || '').trim().toUpperCase()
    return !!street && !!city && uf.length === 2
  }, [value?.street, value?.city, value?.state])

  const setField = (patch) => {
    onChange?.({
      ...(latestValueRef.current || {}),
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

      const accuracy = Number(coords.accuracy)
      if (Number.isFinite(accuracy) && accuracy > 200) {
        toast?.({
          title: 'Precisão baixa',
          description: `Precisão aproximada de ${Math.round(accuracy)}m. Se puder, vá para uma área aberta e tente novamente.`,
        })
      }

      if (!isValidLatLng(lat, lng)) {
        throw new Error('Localização inválida.')
      }

      setField({ lat, lng })

      try {
        const controller = new AbortController()
        const r = await reverseGeocodeNominatim({ lat, lng, signal: controller.signal })

        const patch = {}
        if (
          r.street &&
          !String(latestValueRef.current?.street || '').trim() &&
          !(Number.isFinite(accuracy) && accuracy > 200)
        ) {
          patch.street = r.street
        }
        if (r.neighborhood) patch.neighborhood = r.neighborhood
        if (r.city) patch.city = r.city
        if (r.state) patch.state = r.state
        if (r.cep) patch.cep = r.cep
        if (Object.keys(patch).length) setField(patch)
      } catch {
        // ok: sem reverse geocode, mantemos só lat/lng
      }
    } catch (e) {
      const code = Number(e?.code)

      const description =
        code === 1
          ? 'Permita o acesso à localização para preencher automaticamente.'
          : code === 2
            ? 'Não foi possível obter sua localização. Verifique se o GPS/serviço de localização está ativado e tente novamente em uma área aberta.'
            : code === 3
              ? 'A solicitação de localização demorou demais. Tente novamente.'
              : 'Não foi possível obter sua localização. Verifique se o GPS/serviço de localização está ativado e tente novamente.'

      toast?.({
        title: 'Não foi possível usar sua localização',
        description,
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
        description: 'Confirme apenas quando tiver Rua, Cidade e UF.',
        variant: 'destructive',
      })
      return
    }

    const formatted = buildAddressLabel(value || {})

    setField({ formatted })
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
            {buildAddressLabel(value || {}) || 'Adicionar endereço'}
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
                    Número
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
