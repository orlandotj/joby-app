import React from 'react'
import { Link } from 'react-router-dom'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useResolvedStorageUrl } from '@/lib/storageUrl'

const ConversationRow = ({ conversation, isActive, onSelectConversation }) => {
  const avatarSrc = useResolvedStorageUrl(conversation?.user?.avatar)

  return (
    <div
      className={`p-3 flex items-start gap-3 cursor-pointer hover:bg-accent transition-colors duration-150 ${
        isActive ? 'bg-accent' : ''
      }`}
      onClick={() => onSelectConversation(conversation)}
    >
      <Link
        to={`/profile/${conversation.user.id}`}
        className="relative group"
        onClick={(e) => e.stopPropagation()}
      >
        <Avatar className="group-hover:scale-105 transition-transform">
          <AvatarImage src={avatarSrc} alt={conversation.user.name} />
          <AvatarFallback className="bg-primary text-primary-foreground">
            {conversation.user.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        {conversation.user.online && (
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-card"></span>
        )}
      </Link>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline">
          <Link
            to={`/profile/${conversation.user.id}`}
            className="font-medium truncate text-foreground hover:text-primary transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {conversation.user.name}
          </Link>
          <span className="text-xs text-muted-foreground">
            {conversation.timestamp}
          </span>
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {conversation.lastMessage}
        </p>
      </div>

      {conversation.unread > 0 && (
        <div className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center self-center">
          {conversation.unread}
        </div>
      )}
    </div>
  )
}

const ConversationList = ({
  conversations,
  activeConversation,
  onSelectConversation,
}) => {
  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhuma conversa encontrada.
        </p>
      </div>
    )
  }
  return (
    <div className="overflow-y-auto h-[calc(100%-57px)]">
      {conversations.map((conversation) => (
        <ConversationRow
          key={conversation.id}
          conversation={conversation}
          isActive={activeConversation?.id === conversation.id}
          onSelectConversation={onSelectConversation}
        />
      ))}
    </div>
  )
}

export default ConversationList
