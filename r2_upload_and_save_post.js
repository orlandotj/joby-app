// Exemplo Node.js: Upload no R2 e salvar post no Supabase
// Instale: npm install @supabase/supabase-js @aws-sdk/client-s3 express multer

const express = require('express')
const multer = require('multer')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { createClient } = require('@supabase/supabase-js')

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_ENDPOINT =
  'https://d527e6bb0b0350f8dc39481ebdc27398.r2.cloudflarestorage.com'
const R2_BUCKET = 'joby-videos'
const R2_PUBLIC_URL = 'https://pub-xxxx.r2.dev' // ajuste para seu domínio público

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

const upload = multer({
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'video/mp4' || file.mimetype === 'video/webm') {
      cb(null, true)
    } else {
      cb(new Error('Apenas mp4 ou webm permitidos'))
    }
  },
})

const app = express()

app.post(
  '/upload-video-and-post',
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { userId, title, description } = req.body
      if (!userId || !title || !req.files.video) {
        return res.status(400).json({ error: 'Dados obrigatórios faltando' })
      }
      const postId = require('crypto').randomUUID()
      // Upload do vídeo no R2
      const videoKey = `feed/${userId}/${postId}.mp4`
      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: videoKey,
          Body: req.files.video[0].buffer,
          ContentType: req.files.video[0].mimetype,
          ACL: 'public-read',
        })
      )
      const videoUrl = `${R2_PUBLIC_URL}/feed/${userId}/${postId}.mp4`
      // Upload da thumbnail no Supabase Storage (opcional)
      let thumbnailUrl = null
      if (req.files.thumbnail) {
        const { data, error } = await supabase.storage
          .from('thumbnails')
          .upload(
            `feed/${userId}/${postId}.jpg`,
            req.files.thumbnail[0].buffer,
            {
              contentType: req.files.thumbnail[0].mimetype,
              upsert: true,
            }
          )
        if (!error && data) {
          const { publicUrl } = supabase.storage
            .from('thumbnails')
            .getPublicUrl(data.path).data
          thumbnailUrl = publicUrl
        }
      }
      // Salva o post no Supabase
      const { error: dbError } = await supabase.from('posts').insert({
        id: postId,
        user_id: userId,
        title,
        description,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
      })
      if (dbError) return res.status(500).json({ error: dbError.message })
      res.json({ postId, videoUrl, thumbnailUrl })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  }
)

// Exemplo de uso: POST /upload-video-and-post com form-data: video, thumbnail (opcional), userId, title, description

module.exports = app
