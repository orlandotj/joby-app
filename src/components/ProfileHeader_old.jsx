import React, { useState, useEffect } from 'react'
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
  const [followingStatus, setFollowingStatus] = useState(initialIsFollowing)
  const [localFollowersCount, setLocalFollowersCount] = useState(followersCount)

  const avatarSrc = useResolvedStorageUrl(localUser?.avatar)
  const coverImageSrc = useResolvedStorageUrl(localUser?.coverImage)

  useEffect(() => {
    setFollowingStatus(initialIsFollowing)
  }, [initialIsFollowing])

  useEffect(() => {
    setLocalFollowersCount(followersCount)
  }, [followersCount])

  const handleAvatarChange = (newAvatarUrl) => {
    setLocalUser((prev) => ({ ...prev, avatar: newAvatarUrl }))
    toast({ title: 'Foto de perfil atualizada!', variant: 'success' })
  }

  const handleCoverImageChange = (newCoverImageUrl) => {
    setLocalUser((prev) => ({ ...prev, coverImage: newCoverImageUrl }))
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
      console.error('Erro ao seguir/deixar de seguir:', error)
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
    toast({
      title: 'Mensagem iniciada',
      description: `Você iniciou uma conversa com ${localUser.name}.`,
      duration: 3000,
    })
    // navigate(`/messages/${user.id}`); // Example navigation
  }

  const mockReliabilityIndex = localUser?.reliabilityIndex || 92 // Mock data

  return (
    <TooltipProvider>
      <div className="w-full">
        <div className="h-40 sm:h-48 md:h-56 w-full bg-gradient-to-r from-primary/80 to-trust-blue/80 rounded-b-3xl relative overflow-hidden group">
          {isOwnProfile ? (
            <EditableCoverImage
              initialCoverImage={localUser.coverImage}
              onCoverImageChange={handleCoverImageChange}
              userName={localUser.name}
            />
          ) : localUser.coverImage ? (
            <img
              alt={`Imagem de capa do perfil de ${localUser.name}`}
              className="w-full h-full object-cover mix-blend-overlay opacity-70"
              src={coverImageSrc}
            />
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
                  onAvatarChange={handleAvatarChange}
                  userName={localUser.name}
                />
              ) : (
                <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border-4 border-background shadow-md">
                  <AvatarImage src={avatarSrc} alt={localUser.name} />
                  <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                    {localUser.name?.charAt(0)?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
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

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-2 mt-3 text-xs sm:text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-semibold">
                      {localFollowersCount}
                    </span>
                    <span className="text-muted-foreground">seguidores</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-semibold">
                      {followingCount}
                    </span>
                    <span className="text-muted-foreground">seguindo</span>
                  </div>
                  {localUser.location && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MapPin size={14} />
                      <span>{localUser.location}</span>
                    </div>
                  )}
                </div>

                {!isOwnProfile && (
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 mt-2 text-xs sm:text-sm text-muted-foreground">
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 cursor-help">
                          <ShieldCheck
                            size={14}
                            className={
                              mockReliabilityIndex > 85
                                ? 'text-green-500'
                                : 'text-yellow-500'
                            }
                          />
                          <span>{mockReliabilityIndex}% Conf.</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          Índice de Confiabilidade: baseado no histórico de
                          presença e confirmações de agendamentos.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 mt-4 sm:mt-0 w-full sm:w-auto">
                {isOwnProfile ? (
                  <Link to="/me/edit">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 w-full"
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
                    >
                      {followingStatus ? (
                        <UserCheck size={16} />
                      ) : (
                        <UserPlus size={16} />
                      )}
                      {followingStatus ? 'Seguindo' : 'Seguir'}
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
                <TabsList className="grid w-full grid-cols-3 gap-2">
                  <TabsTrigger
                    value="videos"
                    className="flex-1 text-xs sm:text-sm"
                  >
                    Vídeos
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
