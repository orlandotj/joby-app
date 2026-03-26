import React, { useState, useCallback, useEffect, useRef } from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  UploadCloud,
  Inbox,
  Camera,
  Image as ImageIcon,
  Video as VideoIcon,
  Loader2,
  FileCheck,
  Scissors,
  Clapperboard,
  Wand2,
  ArrowLeft,
  Pause,
} from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { safeGetSession, safeGetUser, supabase } from '@/lib/supabaseClient'
import { formatFileSize } from '@/lib/mediaCompression'
import { optimizeImageFile } from '@/lib/imageOptimize'
import { uploadVideoFaststart } from '@/services/cloudflareService'
import { generateFirstFrameThumbnailJpeg } from '@/lib/videoThumbnail'
import { log } from '@/lib/logger'
import { normalizeImage, NormalizeImageError } from '@/services/imageNormalizeService'
import { createObjectUrlPreview, revokeObjectUrlIfNeeded } from '@/lib/filePreviewUrl'
import { runHeicFlow } from '@/lib/heicClientConvert'
import { resizeImageClient } from '@/lib/imageResizeClient'
import { createImageDerivatives } from '@/lib/imageDerivatives'

const UploadDialog = ({ isOpen, setIsOpen, uploadType, onUploadComplete }) => {
  const [file, setFile] = useState(null)
  const [videoAdjust, setVideoAdjust] = useState(null)
  const [videoTrim, setVideoTrim] = useState(null) // { startSeconds, endSeconds, targetUploadType, originalDurationSeconds }
  const [detectedVideoUploadType, setDetectedVideoUploadType] = useState(null) // 'short-video' | 'long-video'
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const [photoDerivatives, setPhotoDerivatives] = useState(null)
  const [preview, setPreview] = useState(null)
  const [imageOptimizeNote, setImageOptimizeNote] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isConvertingHeic, setIsConvertingHeic] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatusTitle, setUploadStatusTitle] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const videoPreviewRef = useRef(null)
  const videoSeekGuardRef = useRef(false)
  const uploadIdRef = useRef('')
  const uploadProcessingIntervalRef = useRef(null)
  const uploadProcessingStartedAtRef = useRef(0)
  const fileSelectOpIdRef = useRef(0)
  const { toast } = useToast()

  const formatUploadError = useCallback((err) => {
    const status = Number(err?.status)
    const code = String(err?.code || err?.payload?.code || '')
    const msg = String(err?.message || '')
    const isDev = import.meta.env.DEV === true

    if (status === 429 || code === 'RATE_LIMIT') {
      return {
        title: 'Muitas tentativas',
        description:
          msg || 'Você fez muitos uploads em pouco tempo. Aguarde um pouco e tente novamente.',
      }
    }

    if (status === 401 || code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID') {
      return {
        title: 'Sessão expirada',
        description: 'Faça login novamente e tente de novo.',
      }
    }

    if (code === 'CORS_NOT_ALLOWED') {
      return {
        title: 'Acesso bloqueado',
        description: isDev
          ? 'Esta origem não está autorizada a acessar o servidor de upload (CORS). Verifique CORS_ORIGINS no backend e a URL do app.'
          : 'Não foi possível continuar a partir deste endereço. Tente novamente.',
      }
    }

    if (code === 'AUTH_USER_MISMATCH') {
      return {
        title: 'Sessão inconsistente',
        description:
          'Sua sessão não corresponde ao usuário do upload. Faça logout/login e tente novamente.',
      }
    }

    if (status === 403) {
      return {
        title: 'Acesso bloqueado',
        description:
          'O servidor bloqueou esta solicitação (403). Verifique sua sessão e tente novamente.',
      }
    }

    if (code === 'VIDEO_RULES') {
      return {
        title: 'Vídeo fora do padrão',
        description:
          msg || 'O vídeo não atende às regras de duração/resolução. Ajuste e tente novamente.',
      }
    }

    if (status === 413) {
      return {
        title: 'Arquivo muito grande',
        description: 'O vídeo excede o tamanho máximo permitido. Se possível, reduza e tente novamente.',
      }
    }

    if (code === 'NETWORK' || /erro de rede/i.test(msg)) {
      return {
        title: 'Falha de conexão',
        description: isDev
          ? msg
          : 'Não foi possível conectar ao servidor de upload. Verifique sua conexão e tente novamente.',
      }
    }

    if (/VITE_FASTSTART_API_URL|VARIÁVEL DE AMBIENTE FALTANDO/i.test(msg)) {
      return {
        title: 'Configuração de upload',
        description: isDev
          ? msg
          : 'O upload não está disponível no momento. Tente novamente mais tarde.',
      }
    }

    return {
      title: 'Não foi possível enviar',
      description: msg || 'Tente novamente em alguns instantes.',
    }
  }, [])

  const clearSelectedFile = useCallback(() => {
    try {
      fileSelectOpIdRef.current = (Number(fileSelectOpIdRef.current) || 0) + 1
    } catch {
      // ignore
    }
    setIsConvertingHeic(false)
    setVideoAdjust(null)
    setVideoTrim(null)
    setDetectedVideoUploadType(null)
    setPreview((prev) => {
      revokeObjectUrlIfNeeded(prev)
      return null
    })
    setFile(null)
    setPhotoDerivatives(null)
    setImageOptimizeNote('')
    try {
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch {
      // ignore
    }
    try {
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    } catch {
      // ignore
    }
  }, [])

  const getUploadTrace = ({ userId = null, bookingId = null, fileNameOverride = null } = {}) => {
    const uploadId = String(uploadIdRef.current || '').trim() || null
    const fileName = String(fileNameOverride || file?.name || '').trim() || null
    const traceId = uploadId ? `upload:${uploadId}:${fileName || 'unknown'}` : null
    return {
      traceId,
      userId: userId || null,
      bookingId: bookingId || null,
      uploadId,
      fileName,
    }
  }

  const resetForm = useCallback(() => {
    // Cancel any pending HEIC conversion.
    try {
      fileSelectOpIdRef.current = (Number(fileSelectOpIdRef.current) || 0) + 1
    } catch {
      // ignore
    }
    setFile(null)
    setVideoAdjust(null)
    setVideoTrim(null)
    setDetectedVideoUploadType(null)
    setPhotoDerivatives(null)
    setPreview((prev) => {
      revokeObjectUrlIfNeeded(prev)
      return null
    })
    setImageOptimizeNote('')
    setTitle('')
    setDescription('')
    setTags('')
    setUploadProgress(0)
    setUploadStatusTitle('')
    setUploadSuccess(false)
    setIsConvertingHeic(false)
    uploadIdRef.current = ''
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = ''
    }
  }, [])

  const stopUploadProcessingTicker = useCallback(() => {
    try {
      if (uploadProcessingIntervalRef.current) {
        clearInterval(uploadProcessingIntervalRef.current)
      }
    } catch {
      // ignore
    }
    uploadProcessingIntervalRef.current = null
    uploadProcessingStartedAtRef.current = 0
  }, [])

  const startUploadProcessingTicker = useCallback(() => {
    stopUploadProcessingTicker()
    uploadProcessingStartedAtRef.current = Date.now()

    uploadProcessingIntervalRef.current = setInterval(() => {
      const startedAt = Number(uploadProcessingStartedAtRef.current) || Date.now()
      const elapsedMs = Math.max(0, Date.now() - startedAt)

      // Rotate copy to reassure user during backend processing.
      if (elapsedMs < 6000) setUploadStatusTitle('Processando vídeo...')
      else if (elapsedMs < 14000) setUploadStatusTitle('Preparando publicação...')
      else setUploadStatusTitle('Finalizando upload...')

      // Gentle, bounded smoothing: never jump past 94% before backend responds.
      setUploadProgress((prev) => {
        const current = Number(prev) || 0
        const floor = Math.max(90, current)
        const cap = 94
        const p = Math.min(1, elapsedMs / 12000) // ~12s to reach cap
        const target = Math.min(cap, 90 + Math.floor(p * (cap - 90)))
        return Math.max(floor, target)
      })
    }, 900)
  }, [stopUploadProcessingTicker])

  useEffect(() => {
    return () => {
      stopUploadProcessingTicker()
    }
  }, [stopUploadProcessingTicker])

  const handleClose = () => {
    if (isUploading) return
    resetForm()
    setIsOpen(false)
  }

  const getAcceptedFileTypes = () => {
    if (uploadType === 'photo') return 'image/*'
    if (uploadType === 'video' || uploadType === 'short-video' || uploadType === 'long-video') return 'video/mp4'
    return ''
  }

  const getMaxSize = () => {
    // For images: do NOT block by size except extreme cases.
    if (uploadType === 'photo') return 30 * 1024 * 1024
    if (uploadType === 'video') return 200 * 1024 * 1024
    if (uploadType === 'short-video') return 50 * 1024 * 1024
    if (uploadType === 'long-video') return 200 * 1024 * 1024
    return 0
  }

  // Reads duration and intrinsic dimensions from browser metadata.
  // This does not upload anything; it is safe to run client-side.
  const getVideoMeta = async (file) => {
    return await new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true

      const objectUrl = URL.createObjectURL(file)
      const cleanup = () => {
        try {
          URL.revokeObjectURL(objectUrl)
        } catch {
          // ignore
        }
      }

      video.onloadedmetadata = () => {
        const duration = Number(video.duration)
        const width = Number(video.videoWidth)
        const height = Number(video.videoHeight)
        cleanup()

        resolve({
          duration: Number.isFinite(duration) ? duration : null,
          width: Number.isFinite(width) && width > 0 ? Math.round(width) : null,
          height: Number.isFinite(height) && height > 0 ? Math.round(height) : null,
        })
      }

      video.onerror = () => {
        cleanup()
        reject(new Error('Não foi possível ler os metadados do vídeo.'))
      }

      video.src = objectUrl
    })
  }

  const getVideoRules = (type) => {
    // Produto:
    // - short-video: duração >= 15 && <= 180
    // - long-video: duração > 180 && <= 600
    if (type === 'short-video') return { minSeconds: 15, maxSeconds: 180, label: 'Vídeo curto' }
    if (type === 'long-video') return { minSeconds: 180, minExclusive: true, maxSeconds: 600, label: 'Vídeo longo' }
    return null
  }

  const isWithin1080p = ({ width, height }) => {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return false
    const w = Math.round(width)
    const h = Math.round(height)
    const maxDim = Math.max(w, h)
    const minDim = Math.min(w, h)
    return maxDim <= 1920 && minDim <= 1080
  }

  const isMissingColumnError = (error) => {
    const msg = String(error?.message || error || '').toLowerCase()
    return msg.includes('column') && msg.includes('does not exist')
  }

  const handleFileChange = async (event) => {
    const selectedFile = event.target.files[0]
    if (!selectedFile) return

    const inputSource = String(event?.target?.dataset?.source || '').toLowerCase()
    const cameFromCamera = inputSource === 'camera'

    setImageOptimizeNote('')
    setPhotoDerivatives(null)
    setVideoAdjust(null)
    setVideoTrim(null)
    setDetectedVideoUploadType(null)

    // New correlation id for this upload attempt.
    try {
      uploadIdRef.current = crypto?.randomUUID?.() || String(Date.now())
    } catch {
      uploadIdRef.current = String(Date.now())
    }

    // Backend (Node) currently accepts only MP4.
    if (
      (uploadType === 'video' || uploadType === 'short-video' || uploadType === 'long-video') &&
      selectedFile.type !== 'video/mp4'
    ) {
      toast({
        title: 'Formato inválido',
        description: cameFromCamera
          ? 'Seu dispositivo gravou em um formato ainda não suportado pelo JOBY. Tente selecionar um vídeo da galeria/arquivo (MP4).'
          : 'Envie apenas vídeos em MP4.',
        variant: 'destructive',
      })
      return
    }

    const maxSize = getMaxSize()

    if (selectedFile.size > maxSize) {
      toast({
        title: 'Arquivo muito grande!',
        description: `O tamanho máximo para ${
          uploadType === 'photo'
            ? 'fotos é 30MB'
            : uploadType === 'short-video'
            ? 'vídeos curtos é 50MB'
            : 'vídeos é 200MB'
        }.`,
        variant: 'destructive',
      })
      return
    }

    const isPhoto = uploadType === 'photo'

    // Preview ASAP (Windows/mobile friendly) and, for HEIC, convert client-first.
    // Only applies to photo uploads.
    let clientSelectedFile = selectedFile
    if (isPhoto) {
      try {
        // Guard the whole pipeline (resize + HEIC flow) against rapid re-selections.
        const pipelineOpId = (Number(fileSelectOpIdRef.current) || 0) + 1
        fileSelectOpIdRef.current = pipelineOpId

        let resizedFile = selectedFile
        try {
          resizedFile = await resizeImageClient(selectedFile, { maxDimension: 2048 })
        } catch {
          // Best-effort: if resize fails, continue with the original file.
          resizedFile = selectedFile
        }

        if (fileSelectOpIdRef.current !== pipelineOpId) return

        const heicResult = await runHeicFlow(resizedFile, {
          opIdRef: fileSelectOpIdRef,
          previousPreviewUrl: preview || '',
          setPreviewUrl: (url) => setPreview(url || null),
          setIsConverting: setIsConvertingHeic,
        })

        // If user selected another file while converting, ignore this selection.
        if (!heicResult) return
        clientSelectedFile = heicResult.file
      } catch (e) {
        toast({
          title: 'Formato não suportado',
          description: 'Não foi possível converter HEIC neste dispositivo. Tente JPG/PNG/WEBP.',
          variant: 'destructive',
        })
        return
      }
    } else {
      // Videos: keep existing behavior.
      try {
        const previewUrl = createObjectUrlPreview(selectedFile, preview)
        if (previewUrl) setPreview(previewUrl)
      } catch {
        // ignore
      }
    }

    // Optimize image (WEBP) if it's a photo. If it fails for decode/canvas issues,
    // fallback to server-side normalize (Worker) instead of denying.
    let fileToUse = clientSelectedFile
    if (isPhoto) {
      try {
        const opId = Number(fileSelectOpIdRef.current) || 0

        setImageOptimizeNote('Gerando versões…')

        const derivatives = await createImageDerivatives(clientSelectedFile, {
          thumbMaxDim: 400,
          fullMaxDim: 2048,
          thumbTargetBytes: 80 * 1024,
          thumbHardMaxBytes: 120 * 1024,
          fullTargetBytes: 700 * 1024,
          fullHardMaxBytes: 1200 * 1024,
          maxAttempts: 6,
        })

        if ((Number(fileSelectOpIdRef.current) || 0) !== opId) return

        setPhotoDerivatives(derivatives)
        fileToUse = derivatives?.full?.file || clientSelectedFile

        try {
          const thumbPreviewUrl = createObjectUrlPreview(derivatives?.thumb?.file, preview)
          if (thumbPreviewUrl) setPreview(thumbPreviewUrl)
        } catch {
          // ignore
        }

        setImageOptimizeNote(
          `Thumb: ${formatFileSize(derivatives?.thumb?.bytes || 0)} • Full: ${formatFileSize(
            derivatives?.full?.bytes || 0
          )}`
        )
      } catch (error) {
        setPhotoDerivatives(null)
        const isUnsupportedClient =
          error?.code === 'IMAGE_TYPE_NOT_ALLOWED' || error?.code === 'GIF_NOT_SUPPORTED'

        const errMsg = String(error?.message || '')
        const isCanvasOrDecode =
          /canvas|carregar imagem|toBlob|dimens(\u00f5|o)es/i.test(errMsg)

        if (isUnsupportedClient || isCanvasOrDecode) {
          setImageOptimizeNote('Convertendo no servidor…')
          try {
            const normalized = await normalizeImage({
              file: clientSelectedFile,
              context: 'post_photo',
              target: 'webp',
            })

            const url = normalized?.result?.url
            if (!url || !String(url).startsWith('storage://')) {
              throw new Error('Resposta inválida do servidor ao normalizar imagem.')
            }

            fileToUse = String(url)
            setImageOptimizeNote('Imagem convertida no servidor')
          } catch (e) {
            const status = e instanceof NormalizeImageError ? e.status : 0
            const msg =
              status === 415
                ? 'Esse formato não pode ser convertido no servidor no momento. Tente JPG/PNG/WEBP.'
                : e?.message || 'Não foi possível converter a imagem no servidor.'

            toast({
              title: 'Formato não suportado',
              description: msg,
              variant: 'destructive',
            })

            // Clear selection; avoid posting an image that may not render.
            setFile(null)
            setPhotoDerivatives(null)
            setPreview((prev) => {
              revokeObjectUrlIfNeeded(prev)
              return null
            })
            setImageOptimizeNote('')
            try {
              if (fileInputRef.current) fileInputRef.current.value = ''
            } catch {}
            return
          }

        } else {
          try {
            if (import.meta.env.DEV) {
              log.warn('UPLOAD', 'image_optimize_failed', {
                ...getUploadTrace({ fileNameOverride: clientSelectedFile?.name || null }),
                error,
              })
            }
          } catch {
            // ignore
          }

          toast({
            title: 'Aviso',
            description: 'Não foi possível otimizar a imagem. Enviando o arquivo original.',
            variant: 'default',
          })

          fileToUse = clientSelectedFile
        }
      }
    }

    // JOBY rules (blocking): validate duration + resolution before accepting.
    // For uploadType === 'video', infer short/long automatically.
    if (uploadType === 'video' || uploadType === 'short-video' || uploadType === 'long-video') {
      try {
        const meta = await getVideoMeta(selectedFile)

        const durationSecRaw = meta?.duration
        const durationSeconds = Number.isFinite(durationSecRaw) ? Number(durationSecRaw) : NaN

        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
          toast({
            title: 'Vídeo inválido',
            description: 'Não foi possível ler a duração do vídeo.',
            variant: 'destructive',
          })
          return
        }

        if (!meta?.width || !meta?.height) {
          toast({
            title: 'Vídeo inválido',
            description: 'Não foi possível ler a resolução do vídeo.',
            variant: 'destructive',
          })
          return
        }

        if (!isWithin1080p({ width: meta.width, height: meta.height })) {
          toast({
            title: 'Resolução não permitida',
            description:
              `Seu vídeo tem ${meta.width}x${meta.height}. O máximo permitido é 1080p (até 1920x1080, incluindo 1080x1920).`,
            variant: 'destructive',
          })
          return
        }

        // Decision logic:
        // - never open adjust if < 15s
        // - ALWAYS open adjust for any video selection
        // - auto-pick target type by duration (short <=180, long >180)

        if (durationSeconds < 15) {
          toast({
            title: 'Vídeo muito curto',
            description: `Seu vídeo tem ${Math.floor(durationSeconds)}s. Escolha outro vídeo (mínimo 15s).`,
            variant: 'destructive',
          })
          return
        }

        const targetUploadType = durationSeconds > 180 ? 'long-video' : 'short-video'

        if (uploadType === 'video') {
          setDetectedVideoUploadType(targetUploadType)
        }

        const openAdjust = (targetUploadType) => {
          const targetRules = getVideoRules(targetUploadType)
          if (!targetRules) return

          setFile(null)
          setVideoTrim(null)

          const startSeconds = 0
          const endSeconds = Math.min(targetRules.maxSeconds, durationSeconds)

          setVideoAdjust({
            file: selectedFile,
            durationSeconds,
            originalUploadType: uploadType === 'video' ? targetUploadType : uploadType,
            targetUploadType,
            rules: targetRules,
            startSeconds,
            endSeconds,
          })
        }

        openAdjust(targetUploadType)
        return
      } catch (e) {
        toast({
          title: 'Vídeo inválido',
          description: e?.message || 'Não foi possível validar o vídeo.',
          variant: 'destructive',
        })
        return
      }
    }

    setFile(fileToUse)

    // For videos, ensure preview exists.
    if (!preview && (uploadType === 'video' || uploadType === 'short-video' || uploadType === 'long-video')) {
      try {
        const videoPreviewUrl = createObjectUrlPreview(selectedFile, preview)
        if (videoPreviewUrl) setPreview(videoPreviewUrl)
      } catch {
        // ignore
      }
    }
  }

  const handleSubmit = async () => {
    if (!file) {
      toast({
        title: 'Nenhum arquivo selecionado!',
        description: 'Por favor, escolha um arquivo para enviar.',
        variant: 'destructive',
      })
      return
    }

    if (!title.trim()) {
      toast({
        title: 'Título obrigatório!',
        description: 'Por favor, adicione um título.',
        variant: 'destructive',
      })
      return
    }

    setIsUploading(true)
    setUploadProgress(10)
    setUploadStatusTitle(uploadType === 'photo' ? 'Enviando foto…' : 'Enviando vídeo…')

    try {
      try {
        if (import.meta.env.DEV) {
          log.debug('UPLOAD', 'submit_begin', {
            ...getUploadTrace(),
            uploadType,
            fileSize: file.size,
          })
        }
      } catch {
        // ignore
      }

      const {
        data: { user },
      } = await safeGetUser()

      try {
        if (import.meta.env.DEV) {
          log.debug('UPLOAD', 'user_loaded', {
            ...getUploadTrace({ userId: user?.id || null }),
          })
        }
      } catch {
        // ignore
      }

      if (!user) throw new Error('Usuário não autenticado')

      setUploadProgress(25)

      const isPhoto = uploadType === 'photo'

      // =========================
      // FOTOS (Supabase Storage)
      // =========================
      if (isPhoto) {
        // If the selected file was already normalized and stored by the Worker,
        // we receive a stable storage:// reference and should NOT upload again.
        if (typeof file === 'string' && String(file).startsWith('storage://')) {
          setUploadProgress(60)
          const storageRef = String(file)

          const legacyRow = {
            user_id: user.id,
            caption: title.trim(),
            url: storageRef,
            is_public: true,
          }

          const richRow = {
            ...legacyRow,
            image_full_url: storageRef,
            image_thumb_url: storageRef,
            width_full: null,
            height_full: null,
            width_thumb: null,
            height_thumb: null,
          }

          let insertRes = await supabase.from('photos').insert([richRow]).select().single()
          if (insertRes?.error && isMissingColumnError(insertRes.error)) {
            insertRes = await supabase.from('photos').insert([legacyRow]).select().single()
          }

          const { data: insertData, error: insertError } = insertRes

          if (insertError) {
            log.error('UPLOAD', 'photo_insert_failed', {
              ...getUploadTrace({ userId: user?.id || null }),
              table: 'photos',
              error: insertError,
            })
            throw new Error(
              `Erro ao salvar: ${insertError.message || insertError.hint || 'Erro desconhecido'}`
            )
          }

          setUploadProgress(100)
          setIsUploading(false)
          setUploadSuccess(true)

          toast({
            title: 'Upload Concluído!',
            description: `${title} foi enviado com sucesso.`,
          })

          onUploadComplete?.({
            ...insertData,
            type: uploadType,
            url: storageRef,
            title,
            description,
            tags: tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
          })

          setTimeout(handleClose, 1500)
          return
        }

        const bucket = 'photos'
        const uploadId = String(uploadIdRef.current || crypto?.randomUUID?.() || Date.now())
        const baseDir = `posts/${user.id}/${uploadId}`

        const fullUploadBody = photoDerivatives?.full?.file || file
        const thumbUploadBody = photoDerivatives?.thumb?.file || null

        const inferExt = (body) => {
          const type = String(body?.type || '').toLowerCase()
          if (type.includes('webp')) return 'webp'
          if (type.includes('jpeg') || type.includes('jpg')) return 'jpg'
          if (type.includes('png')) return 'png'
          const name = String(body?.name || '')
          const ext = name.includes('.') ? name.split('.').pop() : ''
          return ext || 'jpg'
        }

        const fullExt = inferExt(fullUploadBody)
        const fullPath = `${baseDir}/full.${fullExt}`
        const thumbExt = thumbUploadBody ? inferExt(thumbUploadBody) : null
        const thumbPath = thumbExt ? `${baseDir}/thumb.${thumbExt}` : null

        setUploadProgress(40)

        const { error: uploadFullError } = await supabase.storage
          .from(bucket)
          .upload(fullPath, fullUploadBody, {
            contentType: fullUploadBody?.type || undefined,
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadFullError) {
          log.error('UPLOAD', 'photo_upload_failed', {
            ...getUploadTrace({ userId: user?.id || null, fileNameOverride: fullPath }),
            bucket,
            storagePath: fullPath,
            error: uploadFullError,
          })
          throw new Error(`Erro no upload: ${uploadFullError.message}`)
        }

        if (thumbUploadBody && thumbPath) {
          setUploadProgress(55)

          const { error: uploadThumbError } = await supabase.storage
            .from(bucket)
            .upload(thumbPath, thumbUploadBody, {
              contentType: thumbUploadBody?.type || undefined,
              cacheControl: '3600',
              upsert: false,
            })

          if (uploadThumbError) {
            log.error('UPLOAD', 'photo_upload_failed', {
              ...getUploadTrace({ userId: user?.id || null, fileNameOverride: thumbPath }),
              bucket,
              storagePath: thumbPath,
              error: uploadThumbError,
            })
            throw new Error(`Erro no upload: ${uploadThumbError.message}`)
          }
        }

        setUploadProgress(70)

        const storageRef = `storage://${bucket}/${fullPath}`
        const thumbRef = thumbPath ? `storage://${bucket}/${thumbPath}` : ''

        setUploadProgress(85)

        const legacyRow = {
          user_id: user.id,
          caption: title.trim(),
          url: storageRef,
          is_public: true,
        }

        const richRow = {
          ...legacyRow,
          image_full_url: storageRef,
          image_thumb_url: thumbRef || storageRef,
          width_full: photoDerivatives?.full?.width ?? null,
          height_full: photoDerivatives?.full?.height ?? null,
          width_thumb: photoDerivatives?.thumb?.width ?? null,
          height_thumb: photoDerivatives?.thumb?.height ?? null,
        }

        let insertRes = await supabase.from('photos').insert([richRow]).select().single()
        if (insertRes?.error && isMissingColumnError(insertRes.error)) {
          insertRes = await supabase.from('photos').insert([legacyRow]).select().single()
        }

        const { data: insertData, error: insertError } = insertRes

        if (insertError) {
          log.error('UPLOAD', 'photo_insert_failed', {
            ...getUploadTrace({ userId: user?.id || null, fileNameOverride: fullPath }),
            table: 'photos',
            error: insertError,
          })
          throw new Error(
            `Erro ao salvar: ${
              insertError.message || insertError.hint || 'Erro desconhecido'
            }`
          )
        }

        setUploadProgress(100)
        setIsUploading(false)
        setUploadSuccess(true)

        toast({
          title: 'Upload Concluído!',
          description: `${title} foi enviado com sucesso.`,
        })

        onUploadComplete?.({
          ...insertData,
          type: uploadType,
          url: storageRef,
          title,
          description,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        })

        setTimeout(handleClose, 1500)
        return
      }

      // =========================
      // VÍDEOS (Cloudflare Worker + R2)
      // =========================
      // Generate thumbnail in parallel so it doesn't add extra wait time.
      const thumbPromise = (async () => {
        try {
          return await generateFirstFrameThumbnailJpeg(file, {
            seekSeconds: 0.1,
            maxWidth: 640,
            quality: 0.8,
          })
        } catch (e) {
          try {
            if (import.meta.env.DEV) {
              log.warn('UPLOAD', 'thumbnail_generate_failed', {
                ...getUploadTrace({ userId: user?.id || null }),
                error: e,
              })
            }
          } catch {
            // ignore
          }
          return null
        }
      })()

      setUploadProgress(30)
      setUploadStatusTitle('Enviando vídeo…')
      try {
        if (import.meta.env.DEV) {
          log.debug('UPLOAD', 'video_faststart_begin', {
            ...getUploadTrace({ userId: user?.id || null }),
            uploadType,
          })
        }
      } catch {
        // ignore
      }

      let accessToken = null
      try {
        const { data: sessionData } = await safeGetSession(8000)
        accessToken = sessionData?.session?.access_token || null
      } catch {
        accessToken = null
      }
      if (!accessToken) {
        throw new Error('Sessão expirada. Faça login novamente.')
      }

      const legacyVideoType =
        uploadType === 'short-video' || uploadType === 'long-video' ? uploadType : null
      const effectiveUploadType = videoTrim?.targetUploadType || detectedVideoUploadType || legacyVideoType
      if ((uploadType === 'video' || legacyVideoType) && !effectiveUploadType) {
        throw new Error('Não foi possível determinar o tipo do vídeo. Selecione o arquivo novamente.')
      }

      const trimStart = videoTrim?.startSeconds
      const trimEnd = videoTrim?.endSeconds
      const originalDuration = videoTrim?.originalDurationSeconds

      const hasTrimValues = Number.isFinite(Number(trimStart)) && Number.isFinite(Number(trimEnd))
      const hasOriginalDuration =
        Number.isFinite(Number(originalDuration)) && Number(originalDuration) > 0

      const isNoopTrim = (() => {
        if (!hasTrimValues || !hasOriginalDuration) return false
        const EPS = 0.05
        const s = Number(trimStart)
        const e = Number(trimEnd)
        const od = Number(originalDuration)
        if (!Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(od)) return false
        return Math.abs(s - 0) <= EPS && Math.abs(e - od) <= EPS
      })()

      const shouldSendTrim = hasTrimValues && !isNoopTrim

      const result = await uploadVideoFaststart({
        videoFile: file,
        userId: user.id,
        title: title.trim(),
        description: description.trim() || '',
        uploadType: effectiveUploadType,
        videoType: effectiveUploadType === 'short-video' ? 'short' : 'long',
        trimStartSeconds: shouldSendTrim ? Number(trimStart) : null,
        trimEndSeconds: shouldSendTrim ? Number(trimEnd) : null,
        accessToken,
        onProgress: (percent) => {
          const mappedProgress = 30 + percent * 0.6 // 30% -> 90%
          setUploadProgress(Math.round(mappedProgress))
          if (Number(percent) < 100) {
            setUploadStatusTitle('Enviando vídeo...')
          }
        },
        onUploadDone: () => {
          // Request body finished uploading; backend may take time to process.
          setUploadStatusTitle('Processando vídeo…')
          startUploadProcessingTicker()
        },
      })

      stopUploadProcessingTicker()

      try {
        if (import.meta.env.DEV) {
          log.debug('UPLOAD', 'video_faststart_done', {
            ...getUploadTrace({ userId: user?.id || null }),
            result,
          })
        }
      } catch {
        // ignore
      }

      // ✅ aceitar os dois formatos: {ok:true} ou {success:true}
      const isOk = result?.ok === true || result?.success === true
      if (!isOk) {
        throw new Error(result?.error || result?.message || 'Erro ao fazer upload do vídeo')
      }

      setUploadProgress(95)
      setUploadStatusTitle('Preparando publicação...')

      // Worker já inseriu no Supabase — pegar o row retornado
      const insertedRow = Array.isArray(result?.inserted) ? result.inserted[0] : null

      // URL que vamos salvar/usar no app para vídeos:
      // ✅ NUNCA storage:// para vídeo
      // ✅ Melhor: r2Key (o player resolve via Worker)
      const videoUrlKey = result?.r2Key || insertedRow?.url || ''

      // 1) Upload thumbnail to Supabase Storage (bucket: thumbnails, PUBLIC)
      // 2) Save public URL in videos.thumbnail_url
      let thumbnailUrl = insertedRow?.thumbnail_url || null
      if (insertedRow?.id) {
        try {
          const thumbBlob = await thumbPromise
          if (thumbBlob) {
            setUploadProgress(96)
            setUploadStatusTitle('Finalizando upload...')

            let thumbPath = `thumbnails/${user.id}/${insertedRow.id}.jpg`
            let thumbUploadBody = thumbBlob
            let thumbContentType = 'image/jpeg'

            // Try optimizing to WEBP (smaller/faster). Fallback to original blob.
            try {
              const thumbFile = new File([thumbBlob], `thumb-${insertedRow.id}.jpg`, {
                type: thumbBlob.type || 'image/jpeg',
                lastModified: Date.now(),
              })
              const { file: optimizedThumbFile } = await optimizeImageFile(thumbFile, {
                kind: 'photo',
              })

              if (optimizedThumbFile?.size && optimizedThumbFile.size > 0) {
                thumbPath = `thumbnails/${user.id}/${insertedRow.id}.webp`
                thumbUploadBody = optimizedThumbFile
                thumbContentType = 'image/webp'
              }
            } catch (e) {
              try {
                if (import.meta.env.DEV) {
                  log.warn('UPLOAD', 'thumbnail_optimize_failed', {
                    ...getUploadTrace({ userId: user?.id || null }),
                    error: e,
                  })
                }
              } catch {
                // ignore
              }
            }

            const { error: thumbUploadError } = await supabase.storage
              .from('thumbnails')
              .upload(thumbPath, thumbUploadBody, {
                contentType: thumbContentType,
                cacheControl: '31536000',
                upsert: true,
              })

            if (thumbUploadError) throw thumbUploadError

            const publicUrl = supabase.storage
              .from('thumbnails')
              .getPublicUrl(thumbPath)?.data?.publicUrl

            if (publicUrl) {
              setUploadProgress(98)
              setUploadStatusTitle('Finalizando upload...')
              const { error: updateError } = await supabase
                .from('videos')
                .update({ thumbnail_url: publicUrl })
                .eq('id', insertedRow.id)

              if (updateError) {
                // Fallback for older schemas
                const msg = String(updateError?.message || '').toLowerCase()
                const missingColumn = msg.includes('column') && msg.includes('does not exist')
                if (missingColumn) {
                  await supabase
                    .from('videos')
                    .update({ thumbnail: publicUrl })
                    .eq('id', insertedRow.id)
                } else {
                  throw updateError
                }
              }

              thumbnailUrl = publicUrl
            }
          }
        } catch (e) {
          try {
            if (import.meta.env.DEV) {
              log.warn('UPLOAD', 'thumbnail_upload_or_save_failed', {
                ...getUploadTrace({ userId: user?.id || null }),
                error: e,
              })
            }
          } catch {
            // ignore
          }
        }
      }

      setUploadProgress(100)
      setIsUploading(false)
      setUploadSuccess(true)

      toast({
        title: 'Upload Concluído!',
        description: `${title} foi enviado com sucesso.`,
      })

      onUploadComplete?.({
        ...(insertedRow || {}),
        type: effectiveUploadType,
        // 👇 isso é o que deve ir pra tabela / UI
        url: videoUrlKey,
        thumbnail_url: thumbnailUrl,
        provider: insertedRow?.provider || 'cloudflare_r2',
        // opcional: útil pro debug/preview local
        playbackUrl: result?.playbackUrl || insertedRow?.playback_url || null,
        title,
        description,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      })

      setTimeout(handleClose, 1500)
    } catch (error) {
      log.error('UPLOAD', 'submit_failed', {
        ...getUploadTrace(),
        error,
      })
      stopUploadProcessingTicker()
      setIsUploading(false)
      setUploadProgress(0)
      setUploadStatusTitle('')
      toast({
        ...formatUploadError(error),
        variant: 'destructive',
      })
    }
  }

  const dialogTitle = uploadType === 'photo' ? 'Postar Nova Foto' : 'Postar Vídeo'

  const isAdjustMode = Boolean(videoAdjust)
  const headerTitle = isAdjustMode ? 'Ajustar Seu Vídeo' : dialogTitle
  const headerDescription = isAdjustMode
    ? 'Se o vídeo estiver muito curto ou longo, ajuste o corte para caber nas regras da plataforma.'
    : 'Compartilhe seu trabalho com a comunidade. Preencha os detalhes abaixo.'

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={isAdjustMode ? 'sm:max-w-[760px]' : 'sm:max-w-[525px]'}>
        <DialogHeader
          className={
            isAdjustMode
              ? '-mx-6 px-6 pt-5 pb-3 text-center relative'
              : '-mx-6 px-6 pb-4 border-b border-border/60'
          }
        >
          {isAdjustMode ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                setIsPreviewPlaying(false)
                clearSelectedFile()
              }}
              className="absolute left-3 top-4 h-10 w-10 rounded-full"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : null}
          <DialogTitle
            className={
              isAdjustMode
                ? 'text-2xl font-semibold tracking-tight'
                : 'text-xl font-semibold tracking-tight'
            }
          >
            {headerTitle}
          </DialogTitle>
          <DialogDescription
            className={
              isAdjustMode
                ? 'mx-auto max-w-[28rem] leading-snug'
                : 'leading-snug'
            }
          >
            {headerDescription}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {uploadSuccess ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center py-10 text-center"
            >
              <FileCheck className="h-16 w-16 text-green-500 mb-4" />
              <h3 className="text-xl font-semibold text-foreground">
                Upload Concluído!
              </h3>
              <p className="text-muted-foreground mt-1">{title} foi enviado.</p>
              <Button onClick={handleClose} className="mt-6">
                Fechar
              </Button>
            </motion.div>
          ) : isUploading ? (
            <motion.div
              key="uploading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center py-10 text-center"
            >
              <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
              <h3 className="text-xl font-semibold text-foreground">
                {uploadStatusTitle || 'Enviando...'}
              </h3>
              <p className="text-muted-foreground mt-1">{uploadProgress}%</p>
              <div className="w-full bg-muted rounded-full h-2.5 mt-3">
                <motion.div
                  className="bg-primary h-2.5 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                />
              </div>
            </motion.div>
          ) : videoAdjust ? (
            <motion.div
              key="adjust"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {(() => {
                const clamp = (n, min, max) => Math.min(max, Math.max(min, n))
                const EPS = 0.05
                const releaseSeekGuard = () =>
                  Promise.resolve().then(() => {
                    videoSeekGuardRef.current = false
                  })
                const safeSeek = (videoEl, seconds) => {
                  if (!videoEl) return
                  try {
                    videoSeekGuardRef.current = true
                    videoEl.currentTime = Math.max(0, Number(seconds) || 0)
                  } finally {
                    releaseSeekGuard()
                  }
                }

                const fmt = (totalSeconds) => {
                  const n = Math.max(0, Math.floor(Number(totalSeconds) || 0))
                  const mm = Math.floor(n / 60)
                  const ss = n % 60
                  if (mm >= 60) {
                    const hh = Math.floor(mm / 60)
                    const m2 = mm % 60
                    return `${hh}:${String(m2).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
                  }
                  return `${mm}:${String(ss).padStart(2, '0')}`
                }

                const durationSafe = Math.max(1, Number(videoAdjust.durationSeconds) || 1)
                const startPct = Math.max(
                  0,
                  Math.min(100, (Number(videoAdjust.startSeconds) / durationSafe) * 100)
                )
                const endPct = Math.max(
                  0,
                  Math.min(100, (Number(videoAdjust.endSeconds) / durationSafe) * 100)
                )
                const selSeconds = Math.max(
                  0,
                  Number(videoAdjust.endSeconds) - Number(videoAdjust.startSeconds)
                )
                const segWidth = Math.max(0, endPct - startPct)
                const midPct = Math.max(0, Math.min(100, (startPct + endPct) / 2))

                const normalizeRange = (nextValues, prev) => {
                  const STEP = 0.1
                  const snap = (n) => Math.round((Number(n) || 0) / STEP) * STEP

                  const duration = Math.max(0, Number(prev?.durationSeconds) || 0)
                  const minSecondsBase = Math.max(0, Number(prev?.rules?.minSeconds) || 0)
                  const minExclusive = Boolean(prev?.rules?.minExclusive)
                  const minSeconds = minExclusive ? minSecondsBase + STEP : minSecondsBase
                  const maxSecondsRaw = Number(prev?.rules?.maxSeconds) || 0
                  const maxSeconds = Math.max(minSeconds, maxSecondsRaw)

                  const prevStart = snap(prev?.startSeconds ?? 0)
                  const prevEnd = snap(prev?.endSeconds ?? 0)

                  let nextStart = snap(nextValues?.[0] ?? prevStart)
                  let nextEnd = snap(nextValues?.[1] ?? prevEnd)

                  const deltaStart = Math.abs(nextStart - prevStart)
                  const deltaEnd = Math.abs(nextEnd - prevEnd)
                  const active = deltaStart >= deltaEnd ? 'start' : 'end'

                  nextStart = clamp(nextStart, 0, duration)
                  nextEnd = clamp(nextEnd, 0, duration)

                  // Ensure order by prioritizing the active thumb.
                  if (nextStart > nextEnd) {
                    if (active === 'start') nextEnd = nextStart
                    else nextStart = nextEnd
                  }

                  if (active === 'start') {
                    const minEnd = nextStart + minSeconds
                    const maxEnd = Math.min(duration, nextStart + maxSeconds)
                    nextEnd = clamp(nextEnd, minEnd, maxEnd)
                  } else {
                    const maxStart = nextEnd - minSeconds
                    const minStart = Math.max(0, nextEnd - maxSeconds)
                    nextStart = clamp(nextStart, minStart, maxStart)
                  }

                  // Final safety: keep within bounds + enforce min/max by moving the opposite thumb.
                  nextStart = clamp(nextStart, 0, duration)
                  nextEnd = clamp(nextEnd, 0, duration)

                  // Enforce min/max with edge-aware shifting (trimmer behavior).
                  let len = nextEnd - nextStart
                  if (len < minSeconds) {
                    if (active === 'start') {
                      nextEnd = nextStart + minSeconds
                      if (nextEnd > duration) {
                        nextEnd = duration
                        nextStart = Math.max(0, nextEnd - minSeconds)
                      }
                    } else {
                      nextStart = nextEnd - minSeconds
                      if (nextStart < 0) {
                        nextStart = 0
                        nextEnd = Math.min(duration, nextStart + minSeconds)
                      }
                    }
                  }

                  len = nextEnd - nextStart
                  if (len > maxSeconds) {
                    if (active === 'start') {
                      nextEnd = nextStart + maxSeconds
                      if (nextEnd > duration) {
                        nextEnd = duration
                        nextStart = Math.max(0, nextEnd - maxSeconds)
                      }
                    } else {
                      nextStart = nextEnd - maxSeconds
                      if (nextStart < 0) {
                        nextStart = 0
                        nextEnd = Math.min(duration, nextStart + maxSeconds)
                      }
                    }
                  }

                  // Re-ensure order after clamps.
                  if (nextStart > nextEnd) nextStart = nextEnd

                  return [snap(nextStart), snap(nextEnd)]
                }

                const clampVideoToSelection = (videoEl, sel) => {
                  if (!videoEl || !sel) return
                  const start = Number(sel.startSeconds) || 0
                  const end = Number(sel.endSeconds) || 0
                  const t = Number(videoEl.currentTime) || 0

                  if (t < start) {
                    safeSeek(videoEl, start)
                    return
                  }
                  if (t >= end) {
                    safeSeek(videoEl, start)
                  }
                }

                const stopAtEndAndReset = (videoEl, sel) => {
                  if (!videoEl || !sel) return
                  const start = Number(sel.startSeconds) || 0
                  const end = Number(sel.endSeconds) || 0
                  const t = Number(videoEl.currentTime) || 0
                  if (t >= end - EPS) {
                    try {
                      videoEl.pause()
                    } catch {
                      // ignore
                    }
                    safeSeek(videoEl, start)
                  }
                }

                const applyPresetMode = (targetUploadType) => {
                  const nextRules = getVideoRules(targetUploadType)
                  if (!nextRules) return

                  const duration = Math.max(0, Number(videoAdjust.durationSeconds) || 0)
                  const min = Number(nextRules.minSeconds) || 0
                  const minOk = nextRules.minExclusive ? duration > min : duration >= min
                  if (!minOk) {
                    toast({
                      title: 'Não é possível usar este modo',
                      description: `Este vídeo tem ${fmt(duration)} e não comporta o mínimo ${
                        nextRules.minExclusive ? 'maior que ' : ''
                      }${fmt(min)}.`,
                      variant: 'destructive',
                    })
                    return
                  }

                  let nextSel = null
                  setVideoAdjust((prev) => {
                    if (!prev) return prev
                    const draft = { ...prev, targetUploadType, rules: nextRules }
                    const [ns, ne] = normalizeRange([draft.startSeconds, draft.endSeconds], draft)
                    nextSel = { startSeconds: ns, endSeconds: ne }
                    return { ...draft, startSeconds: ns, endSeconds: ne }
                  })

                  try {
                    if (videoPreviewRef.current && nextSel) {
                      clampVideoToSelection(videoPreviewRef.current, nextSel)
                    }
                  } catch {
                    // ignore
                  }
                }

                return (
                  <div className="grid gap-3 pt-3">
                    <div className="overflow-hidden rounded-3xl border bg-muted/10">
                      <div className="relative aspect-video w-full bg-muted">
                        {preview ? (
                          <video
                            ref={videoPreviewRef}
                            src={preview}
                            playsInline
                            controlsList="nodownload noplaybackrate noremoteplayback"
                            disablePictureInPicture
                            onPlay={() => {
                              const el = videoPreviewRef.current
                              if (!el) return
                              safeSeek(el, videoAdjust.startSeconds)
                              setIsPreviewPlaying(true)
                            }}
                            onPause={() => setIsPreviewPlaying(false)}
                            onTimeUpdate={() => {
                              const el = videoPreviewRef.current
                              if (!el) return
                              stopAtEndAndReset(el, videoAdjust)
                            }}
                            onSeeking={() => {
                              if (videoSeekGuardRef.current) return
                              const el = videoPreviewRef.current
                              if (!el) return
                              clampVideoToSelection(el, videoAdjust)
                            }}
                            className="h-full w-full object-cover"
                          />
                        ) : null}

                        {preview ? (
                          <button
                            type="button"
                            aria-label="Play/Pause"
                            className="absolute left-1/2 top-1/2 z-20 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              const el = videoPreviewRef.current
                              if (!el) return

                              if (el.paused) {
                                try {
                                  clampVideoToSelection(el, videoAdjust)
                                } catch {
                                  // ignore
                                }
                                el.play().catch(() => {})
                              } else {
                                el.pause()
                              }
                            }}
                          >
                            {!isPreviewPlaying ? (
                              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm border border-white/15">
                                  <Pause className="h-6 w-6" />
                                </span>
                              </span>
                            ) : null}
                          </button>
                        ) : null}

                        <div className="absolute inset-x-0 bottom-0 z-10 px-2 pb-2 pt-2">
                          <div className="rounded-lg bg-foreground/15 backdrop-blur-sm border border-border/20 px-2 py-1.5">
                            <div className="flex items-center gap-2">
                              <div className="rounded-full bg-background/50 px-1.5 py-0.5 text-[10px] text-foreground tabular-nums border border-border/30 leading-none">
                                0:00
                              </div>
                              <div className="relative h-8 flex-1">
                              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-background/25" />

                              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between opacity-60">
                                {Array.from({ length: 32 }).map((_, i) => (
                                  <div key={i} className="h-2 w-px bg-background/20" />
                                ))}
                              </div>

                              <div
                                className="absolute top-1/2 -translate-y-1/2 h-6 rounded-md border border-primary/80 bg-primary/10"
                                style={{ left: `${startPct}%`, width: `${segWidth}%` }}
                              />

                              <div
                                className="absolute top-1/2 translate-y-3 h-2 w-2 rotate-45 rounded-sm bg-primary/90"
                                style={{ left: `calc(${midPct}% - 4px)` }}
                              />

                              <div className="absolute inset-0">
                                <SliderPrimitive.Root
                                  className="absolute inset-0 flex h-8 w-full touch-none select-none items-center"
                                  min={0}
                                  max={Math.max(0, Number(videoAdjust.durationSeconds) || 0)}
                                  step={0.1}
                                  value={[
                                    Number(videoAdjust.startSeconds) || 0,
                                    Number(videoAdjust.endSeconds) || 0,
                                  ]}
                                  onValueChange={(values) => {
                                    let seekTo = null
                                    let nextSel = null
                                    let didStartChange = false
                                    setVideoAdjust((prev) => {
                                      if (!prev) return prev
                                      const [nextStart, nextEnd] = normalizeRange(values, prev)
                                      didStartChange = nextStart !== prev.startSeconds
                                      seekTo = nextStart
                                      nextSel = { startSeconds: nextStart, endSeconds: nextEnd }
                                      return {
                                        ...prev,
                                        startSeconds: nextStart,
                                        endSeconds: nextEnd,
                                      }
                                    })
                                    try {
                                      const el = videoPreviewRef.current
                                      if (!el || !nextSel) return
                                      if (didStartChange && seekTo != null) safeSeek(el, seekTo)
                                      clampVideoToSelection(el, nextSel)
                                    } catch {
                                      // ignore
                                    }
                                  }}
                                >
                                  <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-transparent">
                                    <SliderPrimitive.Range className="absolute h-full bg-transparent" />
                                  </SliderPrimitive.Track>
                                  <SliderPrimitive.Thumb
                                    aria-label="Início"
                                    className="relative block h-10 w-2.5 rounded-full border-2 border-primary bg-background shadow-md ring-2 ring-primary/10 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  >
                                    <span className="absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full border-2 border-primary bg-background shadow" />
                                  </SliderPrimitive.Thumb>
                                  <SliderPrimitive.Thumb
                                    aria-label="Fim"
                                    className="relative block h-10 w-2.5 rounded-full border-2 border-primary bg-background shadow-md ring-2 ring-primary/10 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  >
                                    <span className="absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full border-2 border-primary bg-background shadow" />
                                  </SliderPrimitive.Thumb>
                                </SliderPrimitive.Root>
                              </div>
                              </div>
                              <div className="rounded-full bg-background/50 px-1.5 py-0.5 text-[10px] text-foreground tabular-nums border border-border/30 leading-none">
                                {fmt(videoAdjust.durationSeconds)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="px-4 pb-2 pt-2">
                        <div className="flex flex-wrap items-center justify-center gap-2 text-xs tabular-nums">
                          <span className="rounded-full border bg-background/60 px-3 py-1 text-foreground">
                            Trecho {fmt(selSeconds)}
                          </span>
                          <span className="rounded-full border bg-background/40 px-3 py-1 text-muted-foreground">
                            {videoAdjust.rules.minExclusive
                              ? `> ${fmt(videoAdjust.rules.minSeconds)}`
                              : `Mín ${fmt(videoAdjust.rules.minSeconds)}`}
                          </span>
                          <span className="rounded-full border bg-background/40 px-3 py-1 text-muted-foreground">
                            Máx {fmt(videoAdjust.rules.maxSeconds)}
                          </span>
                        </div>

                        {videoAdjust.targetUploadType !== videoAdjust.originalUploadType ? (
                          <p className="mt-2 text-center text-xs text-muted-foreground">
                            Será postado como{' '}
                            <span className="font-medium text-foreground">
                              {videoAdjust.targetUploadType === 'short-video' ? 'Vídeo curto' : 'Vídeo longo'}
                            </span>
                            .
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          type="button"
                          variant={videoAdjust.targetUploadType === 'short-video' ? 'default' : 'outline'}
                          onClick={() => applyPresetMode('short-video')}
                          className="h-16 rounded-2xl justify-start gap-3 px-4"
                        >
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Scissors className="h-5 w-5" />
                          </span>
                          <span className="text-left">
                            <span className="block text-sm font-semibold">Cortar vídeo até 3:00</span>
                            <span className="block text-xs text-muted-foreground">Até 3:00</span>
                          </span>
                        </Button>
                        <Button
                          type="button"
                          variant={videoAdjust.targetUploadType === 'long-video' ? 'default' : 'outline'}
                          onClick={() => applyPresetMode('long-video')}
                          className="h-16 rounded-2xl justify-start gap-3 px-4"
                        >
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Clapperboard className="h-5 w-5" />
                          </span>
                          <span className="text-left">
                            <span className="block text-sm font-semibold">Cortar vídeo até 10:00</span>
                            <span className="block text-xs text-muted-foreground">Até 10:00</span>
                          </span>
                        </Button>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        className="h-14 rounded-2xl justify-start gap-3 px-4 disabled:opacity-100"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Wand2 className="h-5 w-5" />
                        </span>
                        <span className="text-left">
                          <span className="block text-sm font-semibold text-foreground">Ajustar automaticamente</span>
                          <span className="block text-xs text-muted-foreground">Em breve</span>
                        </span>
                      </Button>
                    </div>
                  </div>
                )
              })()}

              <DialogFooter className="-mx-6 px-6 pt-5 border-t border-border/60 mt-2 flex-col gap-2 sm:flex-col">
                <Button
                  className="h-12 w-full text-base"
                  onClick={() => {
                    const seg = Math.max(0, videoAdjust.endSeconds - videoAdjust.startSeconds)
                    const { minSeconds, maxSeconds } = videoAdjust.rules
                    const minOk = videoAdjust.rules.minExclusive ? seg > minSeconds : seg >= minSeconds
                    if (!minOk || seg > maxSeconds) {
                      toast({
                        title: 'Trecho inválido',
                        description: videoAdjust.rules.minExclusive
                          ? `Selecione um trecho maior que ${fmt(minSeconds)} e até ${fmt(maxSeconds)}.`
                          : `Selecione um trecho entre ${fmt(minSeconds)} e ${fmt(maxSeconds)}.`,
                        variant: 'destructive',
                      })
                      return
                    }
                    setVideoTrim({
                      startSeconds: videoAdjust.startSeconds,
                      endSeconds: videoAdjust.endSeconds,
                      targetUploadType: videoAdjust.targetUploadType,
                      originalDurationSeconds: Number(videoAdjust.durationSeconds) || 0,
                    })
                    setFile(videoAdjust.file)
                    setVideoAdjust(null)
                  }}
                >
                  Cortar e continuar
                </Button>
                <Button variant="outline" onClick={clearSelectedFile} className="h-12 w-full">
                  Cancelar
                </Button>
              </DialogFooter>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="grid gap-4 pt-4">
                {!preview && (
                  uploadType === 'photo' ? (
                    <div
                      className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed border-muted-foreground/50 rounded-md cursor-pointer hover:border-primary transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="space-y-1 text-center">
                        <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                        <div className="flex text-sm text-muted-foreground">
                          <Label
                            htmlFor="file-upload"
                            className="relative cursor-pointer rounded-md font-medium text-primary hover:text-primary/80 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
                          >
                            <span>Clique para enviar</span>
                          </Label>
                          <p className="pl-1">ou arraste e solte</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Qualquer imagem até 30MB — otimiza/normaliza automático
                        </p>
                      </div>
                      <Input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        className="sr-only"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept={getAcceptedFileTypes()}
                      />
                    </div>
                  ) : (
                    <div className="mt-2 flex justify-center rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-8 transition-colors sm:px-6">
                      <div className="w-full space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-36 w-full rounded-2xl border border-primary/20 bg-primary/5 shadow-sm hover:bg-primary/10 hover:shadow-md transition-all flex flex-col items-center justify-center gap-2 px-5 py-3 text-center"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <span className="h-16 w-16 rounded-2xl border border-primary/25 bg-primary/12 flex items-center justify-center">
                              <Inbox className="h-8 w-8 text-primary" />
                            </span>
                            <span className="text-center">
                              <span className="flex min-h-8 items-center justify-center text-base font-semibold leading-tight text-foreground">
                                Abrir arquivo
                              </span>
                              <span className="mt-1 flex min-h-8 items-start justify-center text-xs leading-snug text-muted-foreground">
                                Galeria ou arquivos
                              </span>
                            </span>
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-36 w-full rounded-2xl border border-primary/20 bg-primary/5 shadow-sm hover:bg-primary/10 hover:shadow-md transition-all flex flex-col items-center justify-center gap-2 px-5 py-3 text-center"
                            onClick={() => cameraInputRef.current?.click()}
                          >
                            <span className="h-16 w-16 rounded-2xl border border-primary/25 bg-primary/12 flex items-center justify-center">
                              <Camera className="h-8 w-8 text-primary" />
                            </span>
                            <span className="text-center">
                              <span className="flex min-h-8 items-center justify-center text-base font-semibold leading-tight text-foreground">
                                Abrir câmera
                              </span>
                              <span className="mt-1 flex min-h-8 items-start justify-center text-xs leading-snug text-muted-foreground">
                                Usar câmera do celular
                              </span>
                            </span>
                          </Button>
                        </div>

                        <div className="flex justify-center pt-1">
                          <span className="inline-flex items-center rounded-full border border-border/60 bg-background/60 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                            MP4 até {uploadType === 'short-video' ? '50MB' : '200MB'}
                          </span>
                        </div>

                        <Input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          className="sr-only"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept={getAcceptedFileTypes()}
                          data-source="file"
                        />
                        <Input
                          id="camera-upload"
                          name="camera-upload"
                          type="file"
                          className="sr-only"
                          ref={cameraInputRef}
                          onChange={handleFileChange}
                          accept="video/*"
                          capture="environment"
                          data-source="camera"
                        />
                      </div>
                    </div>
                  )
                )}

                {preview && (
                  <div className="mt-2 text-center">
                    {uploadType === 'photo' ? (
                      <div className="relative inline-block">
                        <img
                          src={preview}
                          alt="Prévia da foto"
                          className="max-h-48 w-auto mx-auto rounded-md border shadow-sm"
                        />
                        {isConvertingHeic && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-md">
                            <span className="text-[11px] text-white/90">Convertendo HEIC…</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <video
                        src={preview}
                        controls
                        className="max-h-48 w-auto mx-auto rounded-md border shadow-sm"
                      >
                        <source src={preview} type={file?.type} />
                        Seu navegador não suporta a tag de vídeo.
                      </video>
                    )}
                    <Button
                      variant="link"
                      size="sm"
                      onClick={clearSelectedFile}
                      className="mt-2 text-destructive"
                    >
                      Remover arquivo
                    </Button>

                    {(uploadType === 'short-video' || uploadType === 'long-video') && videoTrim ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Trecho selecionado: {videoTrim.startSeconds}s – {videoTrim.endSeconds}s • Será postado
                        como {videoTrim.targetUploadType === 'short-video' ? 'Vídeo curto' : 'Vídeo longo'}
                      </p>
                    ) : null}

                    {uploadType === 'photo' && imageOptimizeNote ? (
                      <p className="mt-2 text-xs text-muted-foreground">{imageOptimizeNote}</p>
                    ) : null}
                  </div>
                )}

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="title" className="text-right">
                    Título
                  </Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="col-span-3"
                    placeholder="Ex: Pintura de Fachada Moderna"
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="description" className="text-right">
                    Descrição
                  </Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="col-span-3"
                    placeholder="Detalhes do serviço, técnicas usadas, etc. (opcional)"
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="tags" className="text-right">
                    Tags
                  </Label>
                  <Input
                    id="tags"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="col-span-3"
                    placeholder="Ex: #pintura, #reforma, #eletricista (separadas por vírgula)"
                  />
                </div>
              </div>

              <DialogFooter className="-mx-6 px-6 pt-4 border-t border-border/60">
                <Button variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={!file || !title.trim()}>
                  <UploadCloud size={16} className="mr-2" />
                  Postar
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}

export default UploadDialog
