import React from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { getProfileDisplayName, getProfileInitial } from '@/lib/profileDisplay'
import {
  MoreVertical,
  Briefcase,
  ArrowLeft,
  Pin,
  PinOff,
  ShieldAlert,
  Ban,
  Trash2,
  Archive,
  Volume2,
  VolumeX,
  UserX,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const ChatHeader = ({
  user,
  onViewProfile,
  onHireClick,
  onBack,
  onReportClick,
  onBlockClick,
  onTogglePin,
  isPinned,
  onDeleteConversation,
  onArchiveConversation,
  onMuteConversation,
  isMuted,
}) => {
  const avatarSrc = useResolvedStorageUrl(user?.avatar)
  const displayName = getProfileDisplayName(user)
  const initial = getProfileInitial(user)

  return (
    <div className="p-3 sm:p-4 border-b border-border/50 flex items-center justify-between bg-card/95 backdrop-blur-sm">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="md:hidden text-muted-foreground hover:text-primary flex-shrink-0 h-9 w-9"
            title="Voltar para contatos"
          >
            <ArrowLeft size={20} />
          </Button>
        )}
        <button
          type="button"
          onClick={() => onViewProfile && user?.id && onViewProfile(user.id)}
          className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 text-left"
          title="Ver perfil"
        >
          <Avatar className="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0 ring-2 ring-primary/10">
            <AvatarImage src={avatarSrc} alt={displayName} />
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground truncate text-sm sm:text-base">
              {displayName}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {user?.profession}
            </p>
          </div>
        </button>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <Button
          variant="default"
          size="sm"
          className="gap-2 joby-gradient text-white font-medium px-3 sm:px-4 h-9 sm:h-10 shadow-sm hover:shadow-md transition-all"
          onClick={onHireClick}
        >
          <Briefcase size={16} />
          <span>Contratar</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-primary h-9 w-9"
              title="Mais opções"
            >
              <MoreVertical size={18} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              onClick={() => onTogglePin && onTogglePin()}
              className="gap-2 cursor-pointer"
            >
              {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
              <span>{isPinned ? 'Desafixar conversa' : 'Fixar conversa'}</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => onMuteConversation && onMuteConversation()}
              className="gap-2 cursor-pointer"
            >
              {isMuted ? <Volume2 size={16} /> : <VolumeX size={16} />}
              <span>
                {isMuted ? 'Ativar notificações' : 'Silenciar notificações'}
              </span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => onArchiveConversation && onArchiveConversation()}
              className="gap-2 cursor-pointer"
            >
              <Archive size={16} />
              <span>Arquivar conversa</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => onDeleteConversation && onDeleteConversation()}
              className="gap-2 cursor-pointer text-red-600 focus:text-red-600"
            >
              <Trash2 size={16} />
              <span>Apagar conversa</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => onBlockClick && onBlockClick()}
              className="gap-2 cursor-pointer text-orange-600 focus:text-orange-600"
            >
              <Ban size={16} />
              <span>Bloquear contato</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => onReportClick && onReportClick()}
              className="gap-2 cursor-pointer text-red-600 focus:text-red-600"
            >
              <ShieldAlert size={16} />
              <span>Denunciar</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export default ChatHeader
