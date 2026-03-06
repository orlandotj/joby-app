import React from 'react'
import { Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useResolvedStorageUrl } from '@/lib/storageUrl'

import './PeopleCarousel.css'


const variantForIndex = (idx) => {
  const mod = idx % 3
  if (mod === 0) return 'left'
  if (mod === 1) return 'center'
  return 'right'
}

const getUsername = (p) => {
  const u = String(p?.username || '').trim()
  if (u) return u
  const n = String(p?.name || '').trim()
  return n ? n.split(/\s+/)[0].toLowerCase() : 'usuario'
}

const getPhoto = (p) => p?.photo_url || p?.avatar || p?.photo || ''

const PeopleCard = ({ person, idx }) => {
  const navigate = useNavigate()
  const username = getUsername(person)
  const displayUser = `@${username}`
  const role = String(person?.role || person?.profession || 'Profissional').trim() || 'Profissional'
  const rating = Number(person?.rating || 0)
  const safeRating = Number.isFinite(rating) ? rating : 0
  const photo = getPhoto(person)
  const imgSrc = useResolvedStorageUrl(photo)
  const variant = variantForIndex(idx)
  const profileId = person?.id

  const handleOpen = () => {
    if (profileId) navigate(`/profile/${profileId}`)
    else navigate('/explore')
  }

  return (
    <button
      className="pCard"
      data-variant={variant}
      style={{ '--variant': variant }}
      onClick={handleOpen}
      type="button"
      aria-label={`Abrir perfil de ${displayUser}`}
    >
      <div className="pCardInner">
        {imgSrc ? (
          <img className="pImg" src={imgSrc} alt={displayUser} loading="lazy" />
        ) : (
          <div className="pFallback">
            <span>{String(username || '?').slice(0, 1).toUpperCase()}</span>
          </div>
        )}

        <div className="pOverlay" />

        <div className="pInfo">
          <div className="pUser">{displayUser}</div>
          <div className="pRole">{role}</div>

          <div className="pRating">
            <span className="pStar">★</span>
            <span>{Number(safeRating || 0).toFixed(1)}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

export default function PeopleCarousel({ people = [] }) {
  if (!people || people.length === 0) return null

  return (
    <section className="peopleSection">
      <div className="peopleHeader">
        <h3>Pessoas</h3>
      </div>

      <div className="peopleRow">
        {people.map((p, idx) => (
          <PeopleCard key={p?.id || p?.username || idx} person={p} idx={idx} />
        ))}
      </div>
    </section>
  )
}
