import React, { useState, useCallback, useRef } from 'react'
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
  Image as ImageIcon,
  Video as VideoIcon,
  Loader2,
  FileCheck,
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
  const [photoDerivatives, setPhotoDerivatives] = useState(null)
  const [preview, setPreview] = useState(null)
  const [imageOptimizeNote, setImageOptimizeNote] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isConvertingHeic, setIsConvertingHeic] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const fileInputRef = useRef(null)
  const uploadIdRef = useRef('')
  const fileSelectOpIdRef = useRef(0)
  const { toast } = useToast()

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
    setUploadSuccess(false)
    setIsConvertingHeic(false)
    uploadIdRef.current = ''
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleClose = () => {
    if (isUploading) return
    resetForm()
    setIsOpen(false)
  }

  const getAcceptedFileTypes = () => {
    if (uploadType === 'photo') return 'image/*'
    if (uploadType === 'short-video' || uploadType === 'long-video')
      return 'video/mp4'
    return ''
  }

  const getMaxSize = () => {
    // For images: do NOT block by size except extreme cases.
    if (uploadType === 'photo') return 30 * 1024 * 1024
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
    if (type === 'short-video') return { minSeconds: 15, maxSeconds: 300, label: 'Vídeo curto' }
    if (type === 'long-video') return { minSeconds: 180, maxSeconds: 5400, label: 'Vídeo longo' }
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

    setImageOptimizeNote('')
    setPhotoDerivatives(null)

    // New correlation id for this upload attempt.
    try {
      uploadIdRef.current = crypto?.randomUUID?.() || String(Date.now())
    } catch {
      uploadIdRef.current = String(Date.now())
    }

    // Backend (Node) currently accepts only MP4.
    if (
      (uploadType === 'short-video' || uploadType === 'long-video') &&
      selectedFile.type !== 'video/mp4'
    ) {
      toast({
        title: 'Formato inválido',
        description: 'Envie apenas vídeos em MP4.',
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
            : 'vídeos longos é 200MB'
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
    if (uploadType === 'short-video' || uploadType === 'long-video') {
      const rules = getVideoRules(uploadType)
      try {
        const meta = await getVideoMeta(selectedFile)

        const durationSecRaw = meta?.duration
        const durationSeconds = Number.isFinite(durationSecRaw)
          ? Math.floor(durationSecRaw)
          : NaN

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

        if (rules) {
          if (durationSeconds < rules.minSeconds || durationSeconds > rules.maxSeconds) {
            toast({
              title: `${rules.label}: duração inválida`,
              description: `Envie um vídeo entre ${rules.minSeconds}s e ${rules.maxSeconds}s. Seu vídeo tem ${durationSeconds}s.`,
              variant: 'destructive',
            })
            return
          }
        }
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
    if (!preview && (uploadType === 'short-video' || uploadType === 'long-video')) {
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

      const result = await uploadVideoFaststart({
        videoFile: file,
        userId: user.id,
        title: title.trim(),
        description: description.trim() || '',
        uploadType,
        videoType: uploadType === 'short-video' ? 'short' : 'long',
        accessToken,
        onProgress: (percent) => {
          const mappedProgress = 30 + percent * 0.6 // 30% -> 90%
          setUploadProgress(Math.round(mappedProgress))
        },
      })

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
        type: uploadType,
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
      setIsUploading(false)
      setUploadProgress(0)
      toast({
        title: 'Erro no upload',
        description: error.message || 'Não foi possível fazer o upload. Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const dialogTitle =
    uploadType === 'photo'
      ? 'Postar Nova Foto'
      : uploadType === 'short-video'
      ? 'Postar Vídeo Curto'
      : 'Postar Vídeo Longo'

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader className="-mx-6 px-6 pb-4 border-b border-border/60">
          <DialogTitle className="text-xl font-semibold tracking-tight">{dialogTitle}</DialogTitle>
          <DialogDescription className="leading-snug">
            Compartilhe seu trabalho com a comunidade. Preencha os detalhes abaixo.
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
              <h3 className="text-xl font-semibold text-foreground">Enviando...</h3>
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
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="grid gap-4 pt-4">
                {!preview && (
                  <div
                    className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed border-muted-foreground/50 rounded-md cursor-pointer hover:border-primary transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="space-y-1 text-center">
                      {uploadType === 'photo' ? (
                        <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                      ) : (
                        <VideoIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                      )}
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
                        {uploadType === 'photo'
                          ? 'Qualquer imagem até 30MB — otimiza/normaliza automático'
                          : 'MP4 até ' +
                            (uploadType === 'short-video' ? '50MB' : '200MB')}
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
                      onClick={() => {
                        try {
                          fileSelectOpIdRef.current = (Number(fileSelectOpIdRef.current) || 0) + 1
                        } catch {
                          // ignore
                        }
                        setIsConvertingHeic(false)
                        setPreview((prev) => {
                          revokeObjectUrlIfNeeded(prev)
                          return null
                        })
                        setFile(null)
                        setImageOptimizeNote('')
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                      className="mt-2 text-destructive"
                    >
                      Remover arquivo
                    </Button>

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
