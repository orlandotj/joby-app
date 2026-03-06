import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  MapPin,
  Star,
  MessageSquare,
  Edit3,
  UserPlus,
  UserCheck,
  Clock,
  CheckCircle,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { Link, useNavigate } from 'react-router-dom'
import EditableAvatar from '@/components/EditableAvatar'
import EditableCoverImage from '@/components/EditableCoverImage'
import EditableBio from '@/components/EditableBio'
import { useAuth } from '@/contexts/AuthContext'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { log } from '@/lib/logger'
import { preloadImage, isImageCached } from '@/lib/imagePreloadCache'

const ProfileHeader = ({
  user,
  activeTab,
  onTabChange,
  isOwnProfile,
  followersCount = 0,
  followingCount = 0,
  isFollowing: initialIsFollowing = false,
  onFollowChange,
}) => {
  const { toast } = useToast()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()

  const [localUser, setLocalUser] = useState(user)
  const [followingStatus, setFollowingStatus] = useState(
    initialIsFollowing == null ? null : !!initialIsFollowing
  )
  const [localFollowersCount, setLocalFollowersCount] = useState(followersCount)

  const debugOnRef = useRef(false)
  useEffect(() => {
    try {
      debugOnRef.current = !!(import.meta.env.DEV && window.__JOBY_IMAGE_DEBUG__)
    } catch {
      debugOnRef.current = false
    }
  }, [])

  const avatarSrc = useResolvedStorageUrl(localUser?.avatar, {
    preferPublic: true,
    debugLabel: `profileHeader:${localUser?.id}:avatar`,
  })
  const coverImageSrc = useResolvedStorageUrl(localUser?.coverImage || localUser?.cover_image, {
    preferPublic: true,
    debugLabel: `profileHeader:${localUser?.id}:cover`,
  })

  const [avatarRenderSrc, setAvatarRenderSrc] = useState(null)
  const [coverRenderSrc, setCoverRenderSrc] = useState(null)

  useEffect(() => {
    let mounted = true

    if (!avatarSrc) {
      setAvatarRenderSrc(null)
      return () => {
        mounted = false
      }
    }

    if (isImageCached(avatarSrc)) {
      setAvatarRenderSrc(avatarSrc)
      return () => {
        mounted = false
      }
    }

    setAvatarRenderSrc(null)
    preloadImage(avatarSrc)
      .then(() => {
        if (mounted) setAvatarRenderSrc(avatarSrc)
      })
      .catch(() => {})

    return () => {
      mounted = false
    }
  }, [avatarSrc])

  useEffect(() => {
    let mounted = true

    if (!coverImageSrc) {
      setCoverRenderSrc(null)
      return () => {
        mounted = false
      }
    }

    if (isImageCached(coverImageSrc)) {
      setCoverRenderSrc(coverImageSrc)
      return () => {
        mounted = false
      }
    }

    setCoverRenderSrc(null)
    preloadImage(coverImageSrc)
      .then(() => {
        if (mounted) setCoverRenderSrc(coverImageSrc)
      })
      .catch(() => {})

    return () => {
      mounted = false
    }
  }, [coverImageSrc])

  useEffect(() => {
    if (!debugOnRef.current) return
    log.debug(
      'IMG',
      `ProfileHeader urls user=${localUser?.id} avatar=${String(avatarSrc).substring(
        0,
        90
      )}... cover=${String(coverImageSrc).substring(0, 90)}... t=${performance
        .now()
        .toFixed(1)}`
    )
  }, [avatarSrc, coverImageSrc, localUser?.id])

  useEffect(() => {
    setLocalUser(user)
  }, [user?.id])

  useEffect(() => {
    setFollowingStatus(initialIsFollowing == null ? null : !!initialIsFollowing)
  }, [initialIsFollowing])

  useEffect(() => {
    setLocalFollowersCount(followersCount)
  }, [followersCount])

  const followLoading = !isOwnProfile && followingStatus == null

  const CounterValue = ({ value }) =>
    value == null ? (
      <span className="inline-block w-7 h-3 rounded bg-muted animate-pulse align-middle" />
    ) : (
      value
    )

  const handleAvatarChange = (newAvatarUrl) => {
    setLocalUser((prev) => ({ ...prev, avatar: newAvatarUrl }))
    toast({ title: 'Foto de perfil atualizada!', variant: 'success' })
  }

  const handleCoverImageChange = (newCoverImageUrl) => {
    setLocalUser((prev) => ({
      ...prev,
      coverImage: newCoverImageUrl,
      cover_image: newCoverImageUrl,
    }))
    toast({ title: 'Imagem de capa atualizada!', variant: 'success' })
  }

  const handleBioChange = (newBio) => {
    setLocalUser((prev) => ({ ...prev, bio: newBio }))
    toast({ title: 'Descrição atualizada!', variant: 'success' })
  }

  const handleFollowToggle = async () => {
    if (!currentUser) {
      toast({
        title: 'Login Necessário',
        description: 'Você precisa estar logado para seguir profissionais.',
        variant: 'destructive',
      })
      navigate('/login')
      return
    }

    try {
      const { supabase } = await import('@/lib/supabaseClient')

      if (followingStatus) {
        // Deixar de seguir
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', user.id)

        if (error) throw error

        setFollowingStatus(false)
        setLocalFollowersCount((prev) => Math.max(0, prev - 1))
        toast({
          title: 'Deixou de seguir',
          description: `Você não está mais seguindo ${localUser.name}.`,
        })
      } else {
        // Seguir
        const { error } = await supabase.from('follows').insert([
          {
            follower_id: currentUser.id,
            following_id: user.id,
          },
        ])

        if (error) throw error

        setFollowingStatus(true)
        setLocalFollowersCount((prev) => prev + 1)
        toast({
          title: 'Seguindo!',
          description: `Agora você está seguindo ${localUser.name}.`,
        })
      }

      // Atualizar dados do perfil
      if (onFollowChange) {
        onFollowChange()
      }
    } catch (error) {
      log.error('PROFILE', 'Erro ao seguir/deixar de seguir', error)
      toast({
        title: 'Erro',
        description: 'Não foi possível completar a ação.',
        variant: 'destructive',
      })
    }
  }

  const handleMessageClick = () => {
    if (!currentUser) {
      toast({
        title: 'Login Necessário',
        description: 'Você precisa estar logado para enviar mensagens.',
        variant: 'destructive',
      })
      navigate('/login')
      return
    }

    // Navegar para a página de mensagens passando o usuário via state
    navigate('/messages', {
      state: {
        startConversationWith: {
          id: localUser.id,
          name: localUser.name,
          profession: localUser.profession,
          avatar: localUser.avatar,
        },
      },
    })
  }

  return (
    <TooltipProvider>
      <div className="w-full">
        <div className="h-40 sm:h-48 md:h-56 w-full bg-gradient-to-r from-primary/80 to-trust-blue/80 rounded-b-3xl relative overflow-hidden group">
          {isOwnProfile ? (
            <EditableCoverImage
              initialCoverImage={localUser.coverImage || localUser.cover_image}
              coverSrc={coverRenderSrc}
              onCoverImageChange={handleCoverImageChange}
              userName={localUser.name}
            />
          ) : localUser.coverImage || localUser.cover_image ? (
            coverRenderSrc ? (
              <img
                alt={`Imagem de capa do perfil de ${localUser.name}`}
                className="w-full h-full object-cover mix-blend-overlay opacity-70"
                src={coverRenderSrc}
                loading="eager"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/30 to-accent/30" />
            )
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/30 to-accent/30" />
          )}
        </div>

        <div className="px-2 sm:px-4 pb-4 -mt-16 sm:-mt-20 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-card rounded-xl p-4 sm:p-6 shadow-xl border border-border/50"
          >
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
              {isOwnProfile ? (
                <EditableAvatar
                  initialAvatar={localUser.avatar}
                  avatarSrc={avatarRenderSrc}
                  onAvatarChange={handleAvatarChange}
                  userName={localUser.name}
                />
              ) : (
                <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-background shadow-md overflow-hidden bg-primary flex items-center justify-center">
                  {avatarRenderSrc ? (
                    <img
                      src={avatarRenderSrc}
                      alt={localUser.name}
                      className="h-full w-full object-cover"
                      loading="eager"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-primary-foreground">
                      {localUser.name?.charAt(0)?.toUpperCase()}
                    </span>
                  )}
                </div>
              )}

              <div className="flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                    {localUser.name}
                  </h1>
                </div>
                <p className="text-primary font-medium text-sm sm:text-base">
                  {localUser.profession}
                </p>

                {/* Linha de estatísticas - sempre visível */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-2 mt-3 text-xs sm:text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-foreground font-semibold">
                      <CounterValue value={localFollowersCount} />
                    </span>
                    <span className="text-muted-foreground">seguidores</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-foreground font-semibold">
                      <CounterValue value={followingCount} />
                    </span>
                    <span className="text-muted-foreground">seguindo</span>
                  </div>
                  {localUser.rating > 0 && localUser.reviews_count > 0 && (
                    <div className="flex items-center gap-1">
                      <Star
                        size={14}
                        className="text-yellow-400 fill-yellow-400"
                      />
                      <span className="text-foreground font-semibold">
                        {localUser.rating}
                      </span>
                      <span className="text-muted-foreground">
                        ({localUser.reviews_count} avaliações)
                      </span>
                    </div>
                  )}
                </div>

                {/* Linha de informações adicionais - sempre visível */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-2 mt-2 text-xs sm:text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={14} />
                    <span>
                      Área de atuação:{' '}
                      <span className="font-semibold text-foreground">
                        {localUser.location || 'Não informado'}
                      </span>
                    </span>
                  </div>
                  {localUser.completed_services > 0 && (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle size={14} />
                      <span>
                        Serviços concluídos:{' '}
                        <span className="font-semibold text-foreground">
                          {localUser.completed_services}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-4 sm:mt-0 w-full sm:w-auto">
                {isOwnProfile ? (
                  <Link to="/me/edit">
                    <Button
                      size="sm"
                      className="gap-1.5 w-full joby-gradient text-white font-semibold shadow-md hover:shadow-lg transition-all"
                    >
                      <Edit3 size={16} />
                      Editar Perfil
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Button
                      variant={followingStatus ? 'outline' : 'default'}
                      size="sm"
                      className={`gap-1.5 w-full ${
                        followingStatus
                          ? ''
                          : 'joby-gradient text-primary-foreground'
                      }`}
                      onClick={handleFollowToggle}
                      disabled={followLoading}
                    >
                      {followingStatus ? (
                        <UserCheck size={16} />
                      ) : (
                        <UserPlus size={16} />
                      )}
                      {followLoading
                        ? 'Carregando...'
                        : followingStatus
                          ? 'Seguindo'
                          : 'Seguir'}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 w-full"
                      onClick={handleMessageClick}
                    >
                      <MessageSquare size={16} />
                      Mensagem
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 sm:mt-6">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-sm font-semibold text-foreground">Sobre</h2>
                {isOwnProfile && (
                  <EditableBio
                    initialBio={localUser.bio}
                    onBioChange={handleBioChange}
                  />
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                {localUser.bio}
              </p>
            </div>

            <div className="mt-4 sm:mt-6 border-t border-border/70 pt-4">
              <Tabs
                value={activeTab}
                onValueChange={onTabChange}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-3 gap-2" data-swipe-tabs-allow="true">
                  <TabsTrigger
                    value="videos"
                    className="flex-1 text-xs sm:text-sm"
                  >
                    Publicações
                  </TabsTrigger>
                  <TabsTrigger
                    value="services"
                    className="flex-1 text-xs sm:text-sm"
                  >
                    Serviços
                  </TabsTrigger>
                  <TabsTrigger
                    value="reviews"
                    className="flex-1 text-xs sm:text-sm"
                  >
                    Avaliações
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </motion.div>
        </div>
      </div>
    </TooltipProvider>
  )
}

export default ProfileHeader
