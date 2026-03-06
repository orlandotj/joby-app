import path from 'node:path'
import dotenv from 'dotenv'
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

const envPath = path.resolve(process.cwd(), '.env')
const loaded = dotenv.config({ path: envPath, override: true })
if (loaded.error) {
  console.error('[selftest] dotenv error:', loaded.error.message)
  process.exit(1)
}

function requireEnv(name) {
  const v = String(process.env[name] || '').trim()
  if (!v) {
    console.error(`[selftest] missing env: ${name}`)
    process.exit(1)
  }
  return v
}

const endpoint = requireEnv('R2_ENDPOINT')
const bucket = requireEnv('R2_BUCKET_NAME')
const accessKeyId = requireEnv('R2_ACCESS_KEY_ID')
const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY')

const key = `videos/selftest/${Date.now()}-selftest.txt`

const s3 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
})

try {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: 'ok',
      ContentType: 'text/plain',
      CacheControl: 'no-store',
    })
  )
  console.log('[selftest] PUT_OK', key)

  await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  console.log('[selftest] HEAD_OK', key)

  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  console.log('[selftest] DEL_OK', key)

  process.exit(0)
} catch (e) {
  const md = e && e.$metadata ? e.$metadata : {}
  const name = e && e.name ? String(e.name) : ''
  const code = e && (e.code || e.Code) ? String(e.code || e.Code) : ''
  const msg = e && e.message ? String(e.message) : String(e)

  console.error('[selftest] ERR', name, code, msg)
  console.error('[selftest] HTTP', md.httpStatusCode, 'REQ', md.requestId, 'CF', md.cfId)

  process.exit(1)
}
