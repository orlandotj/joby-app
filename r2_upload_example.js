// Exemplo Node.js: Upload seguro para Cloudflare R2
// Instale: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

// Configure com suas credenciais (use variáveis de ambiente!)
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

// Função para upload de vídeo
async function uploadVideo({ userId, postId, fileBuffer, mimeType }) {
  const key = `feed/${userId}/${postId}.mp4`
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
    ACL: 'public-read', // Garante acesso público
  })
  await s3.send(command)
  // URL pública do vídeo
  return `${R2_ENDPOINT}/${R2_BUCKET}/${key}`
}

// Exemplo de uso:
// const videoUrl = await uploadVideo({ userId: 'abc123', postId: 'xyz789', fileBuffer, mimeType: 'video/mp4' });
// Salve videoUrl no Supabase

module.exports = { uploadVideo }
