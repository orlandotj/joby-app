import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search,
  Send,
  Phone,
  Video,
  MoreVertical,
  MessageSquare,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ConversationList from '@/components/messages/ConversationList'
import ContactList from '@/components/messages/ContactList'
import ChatHeader from '@/components/messages/ChatHeader'
import MessageBubble from '@/components/messages/MessageBubble'
import MessageInput from '@/components/messages/MessageInput'
import EmptyChat from '@/components/messages/EmptyChat'
import LoadingSpinner from '@/components/messages/LoadingSpinner'
import TypingIndicator from '@/components/messages/TypingIndicator'
import BookingModal from '@/components/booking/BookingModal'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import {
  subscribeToMessages,
  sendTypingIndicator,
  stopTypingIndicator,
  subscribeToTyping,
} from '@/services/messageService'

const Messages = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const typingTimeoutRef = useRef(null)
  const typingChannelRef = useRef(null)
  const messagesEndRef = useRef(null)
  const activeConversationRef = useRef(null)

  useEffect(() => {
    activeConversationRef.current = activeConversation
  }, [activeConversation])

  // Detectar altura REAL do teclado usando visualViewport
  useEffect(() => {
    const handleViewportResize = () => {
      if (typeof window !== 'undefined' && window.visualViewport) {
        const currentKeyboardHeight = Math.max(
          0,
          window.innerHeight - window.visualViewport.height
        )
        setKeyboardHeight(currentKeyboardHeight)
      }
    }

    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize)
      window.visualViewport.addEventListener('scroll', handleViewportResize)
      handleViewportResize() // Calcular inicial

      return () => {
        window.visualViewport.removeEventListener(
          'resize',
          handleViewportResize
        )
        window.visualViewport.removeEventListener(
          'scroll',
          handleViewportResize
        )
      }
    }
  }, [])

  // Scroll para o topo ao montar o componente
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)
  const [selectedProfessional, setSelectedProfessional] = useState(null)

  // Verificar se foi passado um usuário para iniciar conversa
  useEffect(() => {
    if (location.state?.startConversationWith) {
      const userToMessage = location.state.startConversationWith

      // Verificar se já existe conversa com esse usuário
      const existingConversation = conversations.find(
        (conv) => conv.user.id === userToMessage.id
      )

      if (existingConversation) {
        // Se já existe, abrir a conversa
        handleSelectConversation(existingConversation)
      } else {
        // Se não existe, criar nova conversa
        const newConversation = {
          id: userToMessage.id,
          user: userToMessage,
          lastMessage: '',
          timestamp: '',
          unread: 0,
          pinned: false,
          blocked: false,
        }
        setActiveConversation(newConversation)
        setMessages([])
      }

      // Limpar o state para não repetir ao navegar de volta
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, conversations])

  useEffect(() => {
    if (user) {
      loadConversations()
    }
  }, [user])

  // Inbox realtime: atualiza lista de conversas e, se estiver no chat aberto, adiciona a mensagem sem precisar recarregar.
  useEffect(() => {
    if (!user?.id) return

    const channelName = `inbox:${user.id}`

    const existingChannel = supabase
      .getChannels()
      .find((ch) => ch.topic === `realtime:${channelName}`)
    if (existingChannel) {
      supabase.removeChannel(existingChannel)
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`,
        },
        async (payload) => {
          const msg = payload.new
          const otherUserId = msg.sender_id

          // Se o chat com esse usuário estiver aberto, adiciona a mensagem no chat
          const current = activeConversationRef.current
          if (current?.user?.id === otherUserId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev
              const formattedMsg = {
                id: msg.id,
                sender: 'them',
                text: msg.content,
                read_at: msg.read_at,
                timestamp: new Date(msg.created_at).toLocaleTimeString(
                  'pt-BR',
                  {
                    hour: '2-digit',
                    minute: '2-digit',
                  }
                ),
              }
              return [...prev, formattedMsg]
            })

            // Marca como lida imediatamente quando o chat está aberto
            supabase
              .from('messages')
              .update({ read_at: new Date().toISOString() })
              .eq('id', msg.id)
              .is('read_at', null)
          }

          // Atualiza a lista de conversas (lastMessage/unread) sem recarregar a página
          setConversations((prev) => {
            const timestamp = new Date(msg.created_at).toLocaleTimeString(
              'pt-BR',
              {
                hour: '2-digit',
                minute: '2-digit',
              }
            )

            const isChatOpen =
              activeConversationRef.current?.user?.id === otherUserId
            const incrementUnread = !isChatOpen && !msg.read_at

            const existing = prev.find((c) => c.user?.id === otherUserId)
            if (existing) {
              return prev.map((c) =>
                c.user?.id === otherUserId
                  ? {
                      ...c,
                      lastMessage: msg.content,
                      timestamp,
                      unread: incrementUnread ? (c.unread || 0) + 1 : c.unread,
                    }
                  : c
              )
            }

            // Nova conversa: busca perfil mínimo do remetente
            ;(async () => {
              const { data: profileData } = await supabase
                .from('profiles')
                .select('id, name, avatar, profession')
                .eq('id', otherUserId)
                .single()

              setConversations((curr) => {
                if (curr.some((c) => c.user?.id === otherUserId)) return curr
                return [
                  {
                    id: otherUserId,
                    user: profileData || { id: otherUserId },
                    lastMessage: msg.content,
                    timestamp,
                    unread: incrementUnread ? 1 : 0,
                    pinned: false,
                    blocked: false,
                  },
                  ...curr,
                ]
              })
            })()

            return prev
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${user.id}`,
        },
        (payload) => {
          const msg = payload.new
          const otherUserId = msg.receiver_id

          setConversations((prev) => {
            const timestamp = new Date(msg.created_at).toLocaleTimeString(
              'pt-BR',
              {
                hour: '2-digit',
                minute: '2-digit',
              }
            )
            const existing = prev.find((c) => c.user?.id === otherUserId)
            if (!existing) return prev
            return prev.map((c) =>
              c.user?.id === otherUserId
                ? { ...c, lastMessage: msg.content, timestamp }
                : c
            )
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  const loadConversations = async () => {
    setLoading(true)
    try {
      // Buscar conversas do usuário (últimas mensagens com cada contato)
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select(
          `
          *,
          sender:sender_id(id, name, profession, avatar),
          receiver:receiver_id(id, name, profession, avatar)
        `
        )
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })

      if (messagesError) throw messagesError

      // Agrupar mensagens por conversa
      const conversationsMap = new Map()

      messagesData?.forEach((msg) => {
        const otherUser = msg.sender_id === user.id ? msg.receiver : msg.sender
        const conversationId = otherUser.id

        if (!conversationsMap.has(conversationId)) {
          conversationsMap.set(conversationId, {
            id: conversationId,
            user: otherUser,
            lastMessage: msg.content,
            timestamp: new Date(msg.created_at).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            unread: msg.sender_id !== user.id && !msg.read_at ? 1 : 0,
            pinned: false,
            blocked: false,
          })
        } else {
          // Incrementar contador de não lidas
          if (msg.sender_id !== user.id && !msg.read_at) {
            conversationsMap.get(conversationId).unread++
          }
        }
      })

      setConversations(Array.from(conversationsMap.values()))
    } catch (error) {
      console.error('Erro ao carregar conversas:', error)
      setConversations([])
    } finally {
      setLoading(false)
    }
  }

  const openConversation = async (conversation, { updateUrl = true } = {}) => {
    const otherUserId = conversation?.user?.id
    if (!otherUserId) return

    setActiveConversation(conversation)
    activeConversationRef.current = conversation
    setMessages([])
    setIsTyping(false)

    if (updateUrl) {
      const params = new URLSearchParams(location.search)
      if (params.get('chat') !== otherUserId) {
        params.set('chat', otherUserId)
        navigate(
          {
            pathname: location.pathname,
            search: `?${params.toString()}`,
          },
          { replace: false }
        )
      }
    }

    try {
      // Buscar todas as mensagens dessa conversa
      const { data: conversationMessages, error } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${conversation.user.id}),and(sender_id.eq.${conversation.user.id},receiver_id.eq.${user.id})`
        )
        .order('created_at', { ascending: true })

      if (error) throw error

      // Formatar mensagens
      const formattedMessages = conversationMessages.map((msg) => ({
        id: msg.id,
        sender: msg.sender_id === user.id ? 'me' : 'them',
        text: msg.content,
        read_at: msg.read_at,
        timestamp: new Date(msg.created_at).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }))

      setMessages(formattedMessages)

      // Marcar mensagens como lidas
      const { error: updateError } = await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('receiver_id', user.id)
        .eq('sender_id', conversation.user.id)
        .is('read_at', null)

      if (updateError) console.error('Erro ao marcar como lido:', updateError)
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error)
    }
  }

  const handleSelectConversation = async (conversation) => {
    return openConversation(conversation, { updateUrl: true })
  }

  // Suporte ao botão Voltar do navegador/celular: /messages?chat=<id>
  // - Com ?chat: abre conversa
  // - Sem ?chat: mostra lista (não volta para Início)
  useEffect(() => {
    if (!user?.id) return

    const chatId = new URLSearchParams(location.search).get('chat')

    if (!chatId) {
      if (activeConversation) {
        setActiveConversation(null)
        setMessages([])
        setIsTyping(false)
      }
      return
    }

    if (activeConversation?.user?.id === chatId) return

    const existing = conversations.find((c) => c?.user?.id === chatId)
    if (existing) {
      openConversation(existing, { updateUrl: false })
      return
    }

    ;(async () => {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, name, avatar, profession')
        .eq('id', chatId)
        .single()

      const newConversation = {
        id: chatId,
        user: profileData || { id: chatId },
        lastMessage: '',
        timestamp: '',
        unread: 0,
        pinned: false,
        blocked: false,
      }

      openConversation(newConversation, { updateUrl: false })
    })()
  }, [location.search, user?.id, conversations])

  // Subscrever a mensagens + typing com cleanup correto ao trocar de conversa
  useEffect(() => {
    if (!user?.id || !activeConversation?.user?.id) return

    const otherUserId = activeConversation.user.id

    const unsubscribeMessages = subscribeToMessages(
      user.id,
      otherUserId,
      (newMessage, event) => {
        // Proteção extra: se o usuário trocou de conversa, ignore eventos antigos
        const current = activeConversationRef.current
        if (!current?.user?.id || current.user.id !== otherUserId) return

        if (event === 'UPDATE') {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === newMessage.id
                ? { ...msg, read_at: newMessage.read_at }
                : msg
            )
          )
          return
        }

        setMessages((prev) => {
          if (prev.some((msg) => msg.id === newMessage.id)) return prev

          const formattedMsg = {
            id: newMessage.id,
            sender: newMessage.sender_id === user.id ? 'me' : 'them',
            text: newMessage.content,
            read_at: newMessage.read_at,
            timestamp: new Date(newMessage.created_at).toLocaleTimeString(
              'pt-BR',
              {
                hour: '2-digit',
                minute: '2-digit',
              }
            ),
          }
          return [...prev, formattedMsg]
        })

        // Se eu recebi a mensagem, marco como lida
        if (newMessage.sender_id !== user.id) {
          supabase
            .from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('id', newMessage.id)
            .is('read_at', null)
        }
      }
    )

    const unsubscribeTyping = subscribeToTyping(user.id, (typing) => {
      setIsTyping(typing)
    })

    return () => {
      unsubscribeMessages()
      unsubscribeTyping()
    }
  }, [user?.id, activeConversation?.user?.id])

  // Auto-scroll para última mensagem
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isTyping])

  const handleTyping = async () => {
    if (!activeConversation) return

    // Limpar timeout anterior
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Enviar sinal de digitação
    if (!typingChannelRef.current) {
      typingChannelRef.current = await sendTypingIndicator(
        activeConversation.user.id
      )
    }

    // Parar de enviar após 3 segundos de inatividade
    typingTimeoutRef.current = setTimeout(async () => {
      if (typingChannelRef.current) {
        await stopTypingIndicator(typingChannelRef.current)
        typingChannelRef.current = null
      }
    }, 3000)
  }

  const handleSendMessage = async (messageText) => {
    if (messageText.trim() === '' || !activeConversation) return

    // Parar indicador de digitação
    if (typingChannelRef.current) {
      await stopTypingIndicator(typingChannelRef.current)
      typingChannelRef.current = null
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    try {
      // Inserir mensagem no banco
      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_id: activeConversation.user.id,
          content: messageText,
        })
        .select()
        .single()

      if (error) throw error

      // Adicionar mensagem localmente imediatamente
      if (data) {
        const formattedMsg = {
          id: data.id,
          sender: 'me',
          text: data.content,
          read_at: data.read_at,
          timestamp: new Date(data.created_at).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        }
        setMessages((prev) => [...prev, formattedMsg])
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
    }
  }

  const handleSendFile = (file) => {
    // Handler for file sending (mantém a função mas sem simulação)
    const newMessage = {
      id: Date.now().toString(),
      sender: 'me',
      text: `📎 ${file.name}`,
      timestamp: new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      isFile: true,
      fileName: file.name,
      fileSize: file.size,
    }

    setMessages([...messages, newMessage])
  }

  const filteredConversations = conversations
    .filter(
      (conv) =>
        !conv.blocked &&
        (conv.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          conv.lastMessage.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return 0
    })

  const openBookingModal = (professional) => {
    setSelectedProfessional(professional)
    setIsBookingModalOpen(true)
  }

  const closeBookingModal = () => {
    setIsBookingModalOpen(false)
    setSelectedProfessional(null)
  }

  const handleViewProfile = (userId) => {
    navigate(`/profile/${userId}`)
  }

  const handleBackToContacts = () => {
    setActiveConversation(null)
    setMessages([])
    navigate({ pathname: location.pathname, search: '' }, { replace: true })
  }

  const handleReportActive = () => {
    if (!activeConversation) return
    alert(
      `Denúncia enviada para ${activeConversation.user.name}. Obrigado por avisar!`
    )
  }

  const handleBlockActive = () => {
    if (!activeConversation) return
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id ? { ...c, blocked: true } : c
      )
    )
    setActiveConversation(null)
    setMessages([])
  }

  const handleTogglePinActive = () => {
    if (!activeConversation) return
    const isPinnedNext = !activeConversation.pinned
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id ? { ...c, pinned: isPinnedNext } : c
      )
    )
    setActiveConversation((prev) =>
      prev ? { ...prev, pinned: isPinnedNext } : prev
    )
  }

  const handleDeleteConversation = async () => {
    if (!activeConversation) return

    const confirmDelete = window.confirm(
      `Deseja realmente apagar todas as mensagens com ${activeConversation.user.name}? Esta ação não pode ser desfeita.`
    )

    if (!confirmDelete) return

    try {
      // Deletar todas as mensagens da conversa no Supabase
      const { error } = await supabase
        .from('messages')
        .delete()
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${activeConversation.user.id}),and(sender_id.eq.${activeConversation.user.id},receiver_id.eq.${user.id})`
        )

      if (error) throw error

      // Limpar mensagens localmente mas manter a conversa aberta
      setMessages([])

      // Atualizar a conversa na lista para remover a última mensagem
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversation.id
            ? { ...c, lastMessage: '', unread: 0 }
            : c
        )
      )

      alert('Mensagens apagadas com sucesso!')
    } catch (error) {
      console.error('Erro ao apagar mensagens:', error)
      alert('Erro ao apagar mensagens. Tente novamente.')
    }
  }

  const handleArchiveConversation = () => {
    if (!activeConversation) return

    const confirmArchive = window.confirm(
      `Deseja arquivar a conversa com ${activeConversation.user.name}?`
    )

    if (!confirmArchive) return

    // Remover conversa da lista
    setConversations((prev) =>
      prev.filter((c) => c.id !== activeConversation.id)
    )
    setActiveConversation(null)
    setMessages([])

    alert(`Conversa com ${activeConversation.user.name} arquivada!`)
  }

  const handleMuteConversation = () => {
    if (!activeConversation) return

    const isMutedNext = !activeConversation.muted
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id ? { ...c, muted: isMutedNext } : c
      )
    )
    setActiveConversation((prev) =>
      prev ? { ...prev, muted: isMutedNext } : prev
    )

    alert(isMutedNext ? 'Notificações silenciadas' : 'Notificações ativadas')
  }

  if (loading && conversations.length === 0) {
    // Initial loading state
    return <LoadingSpinner />
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* Card principal ocupa toda a tela */}
      <Card className="flex-1 border-0 md:border md:border-border/50 rounded-none md:rounded-lg shadow-none md:shadow-sm flex flex-col overflow-hidden">
        <div className="grid md:grid-cols-[320px_1fr] h-full overflow-hidden">
          {/* Sidebar - Lista de Conversas - Desktop */}
          <div className="border-r border-border/50 hidden md:flex flex-col bg-card h-full overflow-hidden">
            {/* Barra de busca - altura fixa */}
            <div className="p-3 border-b border-border/50 flex-shrink-0 h-[60px]">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
                  size={16}
                />
                <Input
                  placeholder="Buscar conversas..."
                  className="pl-9 py-2 h-9 bg-background/50 border-border/70 focus:border-primary"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Lista de conversas - área rolável */}
            <div
              className="flex-1 overflow-y-auto"
              style={{ height: 'calc(100% - 60px)' }}
            >
              <ConversationList
                conversations={filteredConversations}
                activeConversation={activeConversation}
                onSelectConversation={handleSelectConversation}
              />
            </div>
          </div>

          {/* Área de Chat Principal */}
          <div className="flex flex-col h-full w-full bg-background overflow-hidden">
            {activeConversation ? (
              <>
                {/* Header do Chat - Altura fixa 64px */}
                <div className="flex-shrink-0 z-20 bg-card border-b border-border/50 h-16">
                  <ChatHeader
                    user={activeConversation.user}
                    onHireClick={() =>
                      openBookingModal(activeConversation.user)
                    }
                    onBack={handleBackToContacts}
                    onReportClick={handleReportActive}
                    onBlockClick={handleBlockActive}
                    onTogglePin={handleTogglePinActive}
                    isPinned={!!activeConversation.pinned}
                    onDeleteConversation={handleDeleteConversation}
                    onArchiveConversation={handleArchiveConversation}
                    onMuteConversation={handleMuteConversation}
                    isMuted={!!activeConversation.muted}
                  />
                </div>

                {/* Área de Mensagens - Rolável, preenche o espaço restante */}
                <div
                  className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 sm:px-4 bg-gradient-to-b from-background to-muted/10"
                  style={{
                    WebkitOverflowScrolling: 'touch',
                    paddingTop: '8px',
                    paddingBottom:
                      keyboardHeight > 0 ? `${keyboardHeight + 80}px` : '90px',
                  }}
                >
                  {messages.length > 0 ? (
                    <div className="space-y-2 sm:space-y-3 pb-4">
                      {messages.map((msg) => (
                        <MessageBubble key={msg.id} message={msg} />
                      ))}
                      {isTyping && (
                        <TypingIndicator user={activeConversation.user} />
                      )}
                      <div ref={messagesEndRef} className="h-4" />
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                      <MessageSquare
                        size={48}
                        className="text-muted-foreground/30 mb-4"
                      />
                      <p className="text-sm text-muted-foreground font-medium mb-1">
                        Nenhuma mensagem ainda
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        Comece a conversa enviando uma mensagem
                      </p>
                    </div>
                  )}
                </div>

                {/* Input de Mensagem - Dentro da área de chat APENAS NO DESKTOP */}
                <div className="hidden md:flex flex-shrink-0 border-t border-border/50 bg-card">
                  <MessageInput
                    onSendMessage={handleSendMessage}
                    onSendFile={handleSendFile}
                    onTyping={handleTyping}
                  />
                </div>
              </>
            ) : (
              /* Tela vazia no desktop / Lista de Contatos no mobile */
              <div className="h-full overflow-y-auto">
                {/* No desktop, mostrar mensagem para selecionar conversa */}
                <div className="hidden md:flex h-full flex-col items-center justify-center text-center px-4">
                  <MessageSquare
                    size={64}
                    className="text-muted-foreground/20 mb-4"
                  />
                  <p className="text-lg text-muted-foreground font-medium mb-2">
                    Selecione uma conversa
                  </p>
                  <p className="text-sm text-muted-foreground/70">
                    Escolha uma conversa na lista ao lado para começar
                  </p>
                </div>

                {/* No mobile, mostrar lista de contatos */}
                <div className="md:hidden">
                  <ContactList
                    conversations={filteredConversations}
                    onSelectConversation={handleSelectConversation}
                    onViewProfile={handleViewProfile}
                    onHireClick={openBookingModal}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Input de Mensagem - Fixo na parte inferior APENAS NO MOBILE */}
      {activeConversation && (
        <div
          className="md:hidden"
          style={{
            position: 'fixed',
            bottom: keyboardHeight > 0 ? `${keyboardHeight}px` : '64px',
            left: 0,
            right: 0,
            zIndex: 50,
            transition: 'bottom 0.15s ease-out',
          }}
        >
          <MessageInput
            onSendMessage={handleSendMessage}
            onSendFile={handleSendFile}
            onTyping={handleTyping}
          />
        </div>
      )}

      {/* Modal de Agendamento */}
      <BookingModal
        isOpen={isBookingModalOpen}
        setIsOpen={setIsBookingModalOpen}
        professional={selectedProfessional}
      />
    </div>
  )
}

export default Messages
