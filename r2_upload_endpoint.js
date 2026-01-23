// Endpoint Express para upload seguro no Cloudflare R2
// Instale: npm install express multer @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

const express = require('express')
const multer = require('multer')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_ENDPOINT =
  'https://d527e6bb0b0350f8dc39481ebdc27398.r2.cloudflarestorage.com'
const R2_BUCKET = 'joby-videos'

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

const upload = multer({
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'video/mp4' || file.mimetype === 'video/webm') {
      cb(null, true)
    } else {
      cb(new Error('Apenas mp4 ou webm permitidos'))
    }
  },
})

const app = express()

app.post('/upload-video', upload.single('video'), async (req, res) => {
  try {
    const { userId, postId } = req.body
    if (!userId || !postId || !req.file) {
      return res.status(400).json({ error: 'Dados obrigatórios faltando' })
    }
    const key = `feed/${userId}/${postId}.mp4`
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ACL: 'public-read',
      })
    )
    const publicUrl = `${R2_ENDPOINT}/${R2_BUCKET}/${key}`
    res.json({ video_url: publicUrl })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Exemplo de uso: POST /upload-video com form-data: video (arquivo), userId, postId

module.exports = app
