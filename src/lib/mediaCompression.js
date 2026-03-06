/**
 * Comprime uma imagem para otimizar upload
 * @param {File} file - Arquivo de imagem original
 * @param {Object} options - Opções de compressão
 * @returns {Promise<File>} Arquivo comprimido
 */
import { log } from '@/lib/logger'

export const compressImage = async (file, options = {}) => {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.8,
    maxSizeMB = 2,
  } = options

  // Se não for imagem, retorna o arquivo original
  if (!file.type.startsWith('image/')) {
    return file
  }

  // Se já for pequeno suficiente, retorna original
  if (file.size <= maxSizeMB * 1024 * 1024) {
    return file
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)

    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target.result

      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // Calcular novas dimensões mantendo aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height
            height = maxHeight
          }
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: Date.now(),
              })
              resolve(compressedFile)
            } else {
              reject(new Error('Falha ao comprimir imagem'))
            }
          },
          file.type,
          quality
        )
      }

      img.onerror = () => {
        reject(new Error('Falha ao carregar imagem'))
      }
    }

    reader.onerror = () => {
      reject(new Error('Falha ao ler arquivo'))
    }
  })
}

/**
 * Comprime vídeo reduzindo qualidade (apenas redimensiona thumbnail por enquanto)
 * Para compressão real de vídeo, seria necessário usar biblioteca externa como ffmpeg.wasm
 * @param {File} file - Arquivo de vídeo
 * @returns {Promise<File>} Arquivo original (compressão de vídeo não implementada)
 */
export const compressVideo = async (file) => {
  // Por enquanto, apenas retorna o arquivo original
  // Compressão real de vídeo requer bibliotecas pesadas como ffmpeg.wasm
  if (import.meta.env.DEV) {
    log.debug('MEDIA', 'Video compression not implemented yet, returning original file')
  }
  return file
}

/**
 * Gera thumbnail de vídeo
 * @param {File} file - Arquivo de vídeo
 * @param {number} seekTo - Tempo em segundos para capturar (padrão: 1s)
 * @returns {Promise<string>} Data URL do thumbnail
 */
export const generateVideoThumbnail = async (file, seekTo = 1.0) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = URL.createObjectURL(file)

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(seekTo, video.duration)
    }

    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const reader = new FileReader()
            reader.readAsDataURL(blob)
            reader.onloadend = () => {
              URL.revokeObjectURL(video.src)
              resolve(reader.result)
            }
          } else {
            reject(new Error('Falha ao gerar thumbnail'))
          }
        },
        'image/jpeg',
        0.8
      )
    }

    video.onerror = () => {
      reject(new Error('Falha ao carregar vídeo'))
    }
  })
}

/**
 * Formata tamanho de arquivo para exibição
 * @param {number} bytes - Tamanho em bytes
 * @returns {string} Tamanho formatado (ex: "2.5 MB")
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
