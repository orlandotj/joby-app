import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MessageSquare, User, Briefcase, Search } from 'lucide-react'
import { useResolvedStorageUrl } from '@/lib/storageUrl'

const ContactRow = ({
  conversation,
  onSelectConversation,
  onViewProfile,
  onHireClick,
}) => {
  const avatarSrc = useResolvedStorageUrl(conversation?.user?.avatar)

  return (
    <div
      className={`flex items-center gap-2 px-3 py-3 hover:bg-accent/30 active:bg-accent/50 transition-colors duration-150 border-b border-border/30 last:border-b-0 group`}
    >
      {/* Avatar - clicável para perfil */}
      <div className="flex-shrink-0">
        <button
          onClick={() => onViewProfile && onViewProfile(conversation.user.id)}
          className="relative hover:scale-110 transition-transform active:scale-95"
          title="Ver perfil"
        >
          <Avatar className="h-11 w-11 sm:h-12 sm:w-12 ring-2 ring-transparent group-hover:ring-primary transition-all">
            <AvatarImage src={avatarSrc} alt={conversation.user.name} />
            <AvatarFallback className="bg-primary text-primary-foreground font-medium text-sm">
              {conversation.user.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          {conversation.user.online && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background"></span>
          )}
        </button>
      </div>

      {/* Content - clicável para chat */}
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => onSelectConversation(conversation)}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-foreground truncate text-sm sm:text-base flex-1">
            {conversation.user.name}
          </p>
          <span className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap ml-2">
            {conversation.timestamp}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground truncate mt-1">
          {conversation.lastMessage}
        </p>
      </div>

      {/* Action Buttons - Apenas em desktop */}
      <div className="hidden sm:flex flex-shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 active:bg-primary/20"
          onClick={() => onViewProfile && onViewProfile(conversation.user.id)}
          title="Ver perfil"
        >
          <User size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 active:bg-primary/20"
          onClick={() => onHireClick && onHireClick(conversation.user)}
          title="Contratar"
        >
          <Briefcase size={16} />
        </Button>
      </div>

      {/* Unread indicator */}
      {conversation.unread > 0 && (
        <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
          {conversation.unread > 9 ? '9+' : conversation.unread}
        </div>
      )}
    </div>
  )
}

const ContactList = ({
  conversations,
  onSelectConversation,
  onViewProfile,
  onHireClick,
}) => {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredConversations = conversations.filter(
    (conv) =>
      conv.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.lastMessage.toLowerCase().includes(searchTerm.toLowerCase())
  )
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="p-3 border-b border-border/50">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
              size={16}
            />
            <Input
              placeholder="Buscar contatos..."
              className="pl-9 py-2 h-9 bg-background/50 border-border/70 focus:border-primary"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 text-center">
          <div className="space-y-2">
            <MessageSquare
              className="mx-auto text-muted-foreground"
              size={32}
            />
            <p className="text-sm text-muted-foreground">
              Nenhum contato encontrado.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Search Bar */}
      <div className="p-3 border-b border-border/50 flex-shrink-0">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
            size={16}
          />
          <Input
            placeholder="Buscar contatos..."
            className="pl-9 py-2 h-9 bg-background/50 border-border/70 focus:border-primary"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Contacts List */}
      <div className="overflow-y-auto flex-1">
        {filteredConversations.map((conversation) => (
          <ContactRow
            key={conversation.id}
            conversation={conversation}
            onSelectConversation={onSelectConversation}
            onViewProfile={onViewProfile}
            onHireClick={onHireClick}
          />
        ))}
      </div>
    </div>
  )
}

export default ContactList
