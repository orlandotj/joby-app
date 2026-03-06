import React from 'react'
import { Link } from 'react-router-dom'
import { Bell, Briefcase } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount'
import { useUnreadMessagesCount } from '@/hooks/useUnreadMessagesCount'
import { usePendingWorkRequestsCount } from '@/hooks/usePendingWorkRequestsCount'
import { cn } from '@/lib/utils'

const MobileTopHeader = ({ className } = {}) => {
  const { user } = useAuth()
  const avatarSrc = useResolvedStorageUrl(user?.avatar)

  const unreadNotifications = useUnreadNotificationsCount(user?.id)
  const unreadMessages = useUnreadMessagesCount(user?.id)
  const pendingWorkRequests = usePendingWorkRequestsCount(user?.id)

  const alertCount =
    (unreadNotifications || 0) + (unreadMessages || 0) + (pendingWorkRequests || 0)

  const getBadgeLabel = (value) => (value > 10 ? '10+' : String(value))
  const renderBadge = (value) => {
    if (!value || value <= 0) return null
    return (
      <span className="absolute top-0 right-0 translate-x-[65%] -translate-y-[65%] min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-md ring-2 ring-background pointer-events-none">
        {getBadgeLabel(value)}
      </span>
    )
  }

  return (
    <div
      className={cn(
        'safeHeader md:hidden w-full bg-background border-b border-border flex items-center justify-between px-4 pb-2 shadow-sm',
        className
      )}
    >
      <Link to="/" className="flex items-center gap-1.5">
        <div className="w-8 h-8 rounded-full joby-gradient flex items-center justify-center">
          <Briefcase size={16} className="text-primary-foreground" />
        </div>
        <h1 className="text-base font-bold text-foreground">JOBY</h1>
      </Link>

      <div className="flex items-center gap-2">
        <Link
          to="/notifications"
          className="relative h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Notificações"
        >
          <span className="relative inline-flex translate-y-[1px]">
            <Bell size={18} />
            {renderBadge(alertCount)}
          </span>
        </Link>

        <Link
          to={`/profile/${user?.id || '1'}`}
          className="h-9 w-9 cursor-pointer rounded-full overflow-hidden bg-primary flex items-center justify-center"
          aria-label="Meu perfil"
        >
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt={user?.name}
              className="h-full w-full object-cover"
              loading="eager"
            />
          ) : (
            <span className="text-xs font-bold text-primary-foreground">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </span>
          )}
        </Link>
      </div>
    </div>
  )
}

export default MobileTopHeader
