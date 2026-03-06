import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import pinoHttp from 'pino-http'
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

import { logger } from './logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load env ONLY from server/ (never from repo root).
// Priority:
// 1) server/.env.local (if exists)
// 2) server/.env
const serverDir = path.resolve(__dirname, '..')
const envLocalPath = path.join(serverDir, '.env.local')
const envPath = path.join(serverDir, '.env')

const NOT_CONFIGURED_MSG =
  'Server not configured: create server/.env from server/.env.example and fill R2_* and SUPABASE_*'

let loadedEnvFile = null
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true })
  loadedEnvFile = envLocalPath
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true })
  loadedEnvFile = envPath
}

const loadedEnvLabel =
  loadedEnvFile === envLocalPath
    ? 'server/.env.local'
    : loadedEnvFile === envPath
      ? 'server/.env'
      : null

logger.info(
  {
    tag: 'SERVER',
    action: 'env_file',
    envFile: loadedEnvLabel ?? 'none',
  },
  'env_file'
)
logger.info(
  {
    tag: 'SERVER',
    action: 'env_present',
    envFile: loadedEnvLabel ?? 'none',
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ? 'yes' : 'no',
    SUPABASE_URL: process.env.SUPABASE_URL ? 'yes' : 'no',
  },
  'env_present'
)

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'unhandledRejection')
})

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException')
  process.exit(1)
})

function maskUserId(userId) {
  const s = String(userId || '').trim()
  if (!s) return ''
  if (s.length <= 12) return `${s.slice(0, 6)}…${s.slice(-2)}`
  return `${s.slice(0, 8)}…${s.slice(-4)}`
}

function genReqId(_req, _res) {
  try {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    // ignore
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}

function envString(name, { required = false, defaultValue = '' } = {}) {
  const v = String(process.env[name] ?? defaultValue).trim()
  if (required && !v) {
    if (!loadedEnvFile) {
      throw new Error(NOT_CONFIGURED_MSG)
    }
    throw new Error(
      `Missing env: ${name}. Check ${loadedEnvFile}. ` +
        `Tip: after editing server/.env, save the file and restart the server (node --watch doesn't reload env changes).`
    )
  }
  return v
}

function envInt(name, { required = false, defaultValue } = {}) {
  const raw = process.env[name]
  const v = raw == null || raw === '' ? defaultValue : Number(raw)
  if (!Number.isFinite(v)) {
    if (required) throw new Error(`Invalid env: ${name}`)
    return defaultValue
  }
  return v
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '')
  )
}

function sanitizeText(input, { maxLen }) {
  const raw = String(input ?? '')
  const trimmed = raw.trim()
  const noCtl = trimmed.replace(/[\u0000-\u001F\u007F]/g, '')
  if (!maxLen) return noCtl
  return noCtl.slice(0, maxLen)
}

function safeExtFromName(filename) {
  const ext = String(filename || '')
    .split('.')
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  return ext || 'mp4'
}

function normalizeUploadType({ uploadTypeRaw, videoTypeLegacy }) {
  const raw = String(uploadTypeRaw || '').trim().toLowerCase()
  const legacy = String(videoTypeLegacy || '').trim().toLowerCase()

  if (raw === 'short-video' || raw === 'long-video') return raw
  if (raw === 'short' || raw === 'shorts') return 'short-video'
  if (raw === 'long') return 'long-video'

  if (legacy === 'short' || legacy === 'shorts') return 'short-video'
  if (legacy === 'long') return 'long-video'

  // Backward compatibility default.
  if (!raw && !legacy) return 'short-video'

  return ''
}

function getVideoRules(uploadType) {
  if (uploadType === 'short-video') return { minSeconds: 15, maxSeconds: 300 }
  if (uploadType === 'long-video') return { minSeconds: 180, maxSeconds: 5400 }
  return null
}

function isWithin1080p({ width, height }) {
  const w = Number(width)
  const h = Number(height)
  if (!Number.isFinite(w) || !Number.isFinite(h)) return false
  if (w <= 0 || h <= 0) return false
  const maxDim = Math.max(w, h)
  const minDim = Math.min(w, h)
  return maxDim <= 1920 && minDim <= 1080
}

function deriveFfprobePath(ffmpegPath) {
  const raw = String(ffmpegPath || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  // Common patterns: ffmpeg / ffmpeg.exe
  if (lower.endsWith('ffmpeg.exe')) return raw.slice(0, -'ffmpeg.exe'.length) + 'ffprobe.exe'
  if (lower.endsWith('ffmpeg')) return raw.slice(0, -'ffmpeg'.length) + 'ffprobe'
  return ''
}

function buildR2Key({ userId, ext }) {
  const videoId = crypto.randomUUID()
  return `videos/${userId}/${videoId}.${ext}`
}

function runFfmpegFaststart({ inputPath, outputPath, ffmpegPath }) {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-i', inputPath, '-c', 'copy', '-movflags', '+faststart', outputPath]

    const child = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += String(d)
      if (stderr.length > 64_000) stderr = stderr.slice(-64_000)
    })

    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0) return resolve({ ok: true })
      reject(new Error(`ffmpeg failed (code ${code}): ${stderr || 'no stderr'}`))
    })
  })
}

function ffmpegSafeErrorDetails(err, ffmpegPath) {
  const name = String(err?.name || '')
  const code = String(err?.code || '')
  const message = String(err?.message || '')
  const low = `${name} ${code} ${message}`.toLowerCase()

  const notFound =
    code === 'ENOENT' ||
    low.includes('enoent') ||
    low.includes('not found') ||
    low.includes('is not recognized as an internal or external command')

  if (notFound) {
    return {
      kind: 'ffmpeg_not_found',
      ffmpegPath,
      message: 'ffmpeg not found. Install ffmpeg and ensure it is available in PATH, or set FFMPEG_PATH in server/.env.',
    }
  }

  return {
    kind: 'ffmpeg_failed',
    ffmpegPath,
    message: message || name || 'ffmpeg failed',
  }
}

function ffprobeSafeErrorDetails(err) {
  const name = String(err?.name || '')
  const code = String(err?.code || '')
  const message = String(err?.message || '')
  const low = `${name} ${code} ${message}`.toLowerCase()

  const notFound =
    code === 'ENOENT' ||
    low.includes('enoent') ||
    low.includes('not found') ||
    low.includes('is not recognized as an internal or external command')

  if (notFound) {
    return {
      kind: 'ffprobe_not_found',
      message: 'ffprobe not found. Install ffmpeg/ffprobe or set FFPROBE_PATH in server/.env.',
    }
  }

  return {
    kind: 'ffprobe_failed',
    message: message || name || 'ffprobe failed',
  }
}

function runFfprobe({ inputPath, ffprobePath }) {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', inputPath]

    const child = spawn(ffprobePath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (d) => {
      stdout += String(d)
      if (stdout.length > 128_000) stdout = stdout.slice(-128_000)
    })

    child.stderr.on('data', (d) => {
      stderr += String(d)
      if (stderr.length > 64_000) stderr = stderr.slice(-64_000)
    })

    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0) return resolve({ ok: true, stdout })
      reject(new Error(`ffprobe failed (code ${code}): ${stderr || 'no stderr'}`))
    })
  })
}

function parseFfprobeMeta(jsonText) {
  let parsed
  try {
    parsed = jsonText ? JSON.parse(jsonText) : null
  } catch {
    parsed = null
  }

  const streams = Array.isArray(parsed?.streams) ? parsed.streams : []
  const videoStream = streams.find((s) => String(s?.codec_type || '') === 'video') || null

  const width = videoStream?.width
  const height = videoStream?.height

  const fmtDur = parsed?.format?.duration
  const streamDur = videoStream?.duration

  const duration = Number(fmtDur ?? streamDur)

  return {
    duration: Number.isFinite(duration) ? duration : null,
    width: Number.isFinite(Number(width)) ? Math.round(Number(width)) : null,
    height: Number.isFinite(Number(height)) ? Math.round(Number(height)) : null,
  }
}

function runFfmpegDownscaleTo1080p({ inputPath, outputPath, ffmpegPath }) {
  return new Promise((resolve, reject) => {
    // Cap the *largest* dimension to 1920, preserving aspect ratio.
    // This covers both 1920x1080 (landscape) and 1080x1920 (portrait).
    const scaleFilter =
      "scale='if(gte(iw,ih),min(1920,iw),-2)':'if(gte(iw,ih),-2,min(1920,ih))'"

    const args = [
      '-y',
      '-i',
      inputPath,
      '-vf',
      scaleFilter,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-c:a',
      'copy',
      outputPath,
    ]

    const child = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += String(d)
      if (stderr.length > 128_000) stderr = stderr.slice(-128_000)
    })

    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0) return resolve({ ok: true })
      reject(new Error(`ffmpeg downscale failed (code ${code}): ${stderr || 'no stderr'}`))
    })
  })
}

async function uploadFileToR2({ s3, bucket, key, filePath, contentType }) {
  const body = fs.createReadStream(filePath)
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  )
}

async function r2SanityTest({ s3, bucket }) {
  const key = `healthcheck/faststart-selftest-${Date.now()}.txt`
  const body = 'ok'

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'text/plain',
      CacheControl: 'no-store',
    })
  )

  await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))

  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))

  return { ok: true, key }
}

function awsSafeErrorDetails(err) {
  const name = String(err?.name || '')
  const code = String(err?.Code || err?.code || '')
  const message = String(err?.message || '')
  const httpStatusCode = err?.$metadata?.httpStatusCode
  const requestId = err?.$metadata?.requestId
  const extendedRequestId = err?.$metadata?.extendedRequestId
  const cfId = err?.$metadata?.cfId

  const normalized = (code || name || message || '').toLowerCase()
  const isAccessDenied = normalized.includes('accessdenied') || normalized.includes('access denied')

  const hint = isAccessDenied
    ? 'R2 Access Denied: verify the R2 API token has WRITE access to this bucket (PutObject). Also confirm bucket name and endpoint belong to the same Cloudflare account.'
    : ''

  const userMessage = isAccessDenied
    ? 'Access Denied (R2): your R2 keys/token do not have permission to upload to this bucket. Create a new R2 API token with Read+Write for this bucket (or fix bucket/endpoint mismatch) and update server/.env.'
    : ''

  return {
    name: name || undefined,
    code: code || undefined,
    message: message || undefined,
    userMessage: userMessage || undefined,
    httpStatusCode: typeof httpStatusCode === 'number' ? httpStatusCode : undefined,
    requestId: requestId || undefined,
    extendedRequestId: extendedRequestId || undefined,
    cfId: cfId || undefined,
    hint: hint || undefined,
  }
}

function jsonError(res, status, error, extra = {}) {
  return res.status(status).json({ ok: false, error, ...extra })
}

const app = express()

app.use(
  pinoHttp({
    logger,
    genReqId,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error'
      return 'info'
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.socket?.remoteAddress,
        }
      },
      res(res) {
        return { statusCode: res.statusCode }
      },
    },
  })
)

const corsOrigin = envString('CORS_ORIGIN', { defaultValue: '' })
app.use(
  cors({
    origin: corsOrigin || true,
    credentials: false,
  })
)

app.get('/health', (req, res) => {
  const uptimeSec = Number(process.uptime?.() || 0)
  const mem = process.memoryUsage?.() || {}

  req.log.info(
    {
      tag: 'SERVER',
      action: 'health',
      uptimeSec,
    },
    'health'
  )

  res.json({
    ok: true,
    status: 'ok',
    service: 'joby-upload-server',
    time: new Date().toISOString(),
    uptimeSec,
    memory: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
    },
  })
})

const maxVideoBytes = envInt('MAX_VIDEO_BYTES', {
  defaultValue: 200 * 1024 * 1024,
})

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, os.tmpdir())
    },
    filename: (_req, file, cb) => {
      const id = crypto.randomUUID()
      const ext = safeExtFromName(file?.originalname)
      cb(null, `joby-upload-${id}.${ext}`)
    },
  }),
  limits: {
    fileSize: maxVideoBytes,
  },
})

app.post('/api/upload-video-faststart', upload.single('file'), async (req, res) => {
  const tmpInputPath = req.file?.path
  let tmpOutputPath = ''
  let tmpDownscaledPath = ''

  try {
    const file = req.file
    if (!file) return jsonError(res, 400, 'Missing file')

    const userId = String(req.body?.user_id ?? req.body?.userId ?? '').trim()
    if (!userId) return jsonError(res, 400, 'Missing user_id')
    if (!isUuid(userId)) return jsonError(res, 400, 'Invalid user_id')

    const title = sanitizeText(req.body?.title, { maxLen: 120 })
    if (!title) return jsonError(res, 400, 'Missing title')

    const description = sanitizeText(req.body?.description, { maxLen: 2000 })

    const uploadTypeRaw = sanitizeText(req.body?.upload_type ?? req.body?.uploadType ?? '', { maxLen: 20 })
    const videoTypeLegacy = sanitizeText(req.body?.videoType ?? '', { maxLen: 20 })
    const uploadType = normalizeUploadType({ uploadTypeRaw, videoTypeLegacy })
    if (!uploadType) {
      return jsonError(res, 400, 'Tipo de upload inválido.', {
        code: 'VIDEO_RULES',
        details: { upload_type: uploadTypeRaw || null, videoType: videoTypeLegacy || null },
      })
    }
    const videoType = uploadType === 'long-video' ? 'long' : 'short'

    const dryRunRaw = String(req.query?.dryRun ?? req.body?.dryRun ?? '').trim().toLowerCase()
    const dryRun = dryRunRaw === '1' || dryRunRaw === 'true' || dryRunRaw === 'yes'

    if (!Number.isFinite(file.size) || file.size <= 0) return jsonError(res, 400, 'Empty file')
    if (file.size > maxVideoBytes) {
      return jsonError(res, 413, 'File too large', { maxBytes: maxVideoBytes })
    }

    const mime = String(file.mimetype || '').toLowerCase()
    if (mime !== 'video/mp4') {
      return jsonError(res, 400, 'Invalid mime type (expected video/mp4)', { mime })
    }

    const userIdMasked = maskUserId(userId)
    req.log.info(
      {
        tag: 'UPLOAD',
        action: 'start',
        route: '/api/upload-video-faststart',
        userIdMasked,
        fileSize: file.size,
        mime,
      },
      'upload started'
    )

    const ffmpegPath = envString('FFMPEG_PATH', { defaultValue: 'ffmpeg' })

    // Validate video rules via ffprobe BEFORE doing any heavy work (faststart / R2 upload).
    const ffprobePath =
      envString('FFPROBE_PATH', { defaultValue: '' }) ||
      deriveFfprobePath(ffmpegPath) ||
      'ffprobe'

    let meta = null
    try {
      const ffprobeStart = Date.now()
      const out = await runFfprobe({ inputPath: tmpInputPath, ffprobePath })
      meta = parseFfprobeMeta(out?.stdout || '')

      req.log.info(
        {
          tag: 'UPLOAD',
          action: 'ffprobe_ok',
          userIdMasked,
          durationMs: Date.now() - ffprobeStart,
          duration: meta?.duration ?? null,
          width: meta?.width ?? null,
          height: meta?.height ?? null,
          uploadType,
        },
        'ffprobe ok'
      )
    } catch (e) {
      const details = ffprobeSafeErrorDetails(e)

      req.log.error(
        {
          tag: 'UPLOAD',
          action: 'ffprobe_failed',
          userIdMasked,
          kind: details.kind,
        },
        'ffprobe failed'
      )

      if (details.kind === 'ffprobe_not_found') {
        return jsonError(res, 500, 'ffprobe não está disponível no servidor.', {
          code: 'FFPROBE_MISSING',
          details: { message: 'ffprobe is required to validate video rules.' },
        })
      }

      return jsonError(res, 400, 'Não foi possível ler os metadados do vídeo.', {
        code: 'VIDEO_RULES',
        details: { message: 'Failed to read duration/size from video file.' },
      })
    }

    const devLogs = String(process.env.NODE_ENV || '').toLowerCase() !== 'production'

    let durationSeconds = meta?.duration != null ? Math.floor(Number(meta.duration)) : NaN
    let width = meta?.width != null ? Math.floor(Number(meta.width)) : NaN
    let height = meta?.height != null ? Math.floor(Number(meta.height)) : NaN

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return jsonError(res, 400, 'Duração do vídeo inválida.', {
        code: 'VIDEO_RULES',
        details: { uploadType, durationSeconds: meta?.duration ?? null, width: meta?.width ?? null, height: meta?.height ?? null },
      })
    }

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return jsonError(res, 400, 'Resolução do vídeo inválida.', {
        code: 'VIDEO_RULES',
        details: { uploadType, durationSeconds, width: meta?.width ?? null, height: meta?.height ?? null },
      })
    }

    // If above 1080p, downscale before faststart/upload.
    // Keep aspect ratio, don't cut, keep audio as-is.
    const maxDim = Math.max(width, height)
    let effectiveInputPath = tmpInputPath

    if (devLogs) {
      req.log.info(
        { tag: 'VIDEO', action: 'original_resolution', userIdMasked, width, height, durationSeconds },
        `[VIDEO] Original resolution: ${width}x${height}`
      )
    }

    if (maxDim > 1920) {
      try {
        if (devLogs) {
          req.log.info(
            { tag: 'VIDEO', action: 'downscale_begin', userIdMasked, width, height },
            '[VIDEO] Downscaling to 1080p'
          )
        }

        const outName = `joby-downscaled-${crypto.randomUUID()}.mp4`
        tmpDownscaledPath = path.join(os.tmpdir(), outName)

        await runFfmpegDownscaleTo1080p({
          inputPath: tmpInputPath,
          outputPath: tmpDownscaledPath,
          ffmpegPath,
        })

        effectiveInputPath = tmpDownscaledPath

        // Re-probe metadata from the final file.
        const out2 = await runFfprobe({ inputPath: effectiveInputPath, ffprobePath })
        const meta2 = parseFfprobeMeta(out2?.stdout || '')

        durationSeconds = meta2?.duration != null ? Math.floor(Number(meta2.duration)) : durationSeconds
        width = meta2?.width != null ? Math.floor(Number(meta2.width)) : width
        height = meta2?.height != null ? Math.floor(Number(meta2.height)) : height

        if (devLogs) {
          req.log.info(
            { tag: 'VIDEO', action: 'downscale_done', userIdMasked, width, height, durationSeconds },
            `[VIDEO] Final resolution: ${width}x${height}`
          )
        }
      } catch (e) {
        const details = ffmpegSafeErrorDetails(e, ffmpegPath)
        req.log.error(
          {
            tag: 'VIDEO',
            action: 'downscale_failed',
            userIdMasked,
            kind: details.kind,
          },
          'ffmpeg downscale failed'
        )

        if (details.kind === 'ffmpeg_not_found') {
          return jsonError(res, 500, 'ffmpeg não está disponível no servidor.', {
            code: 'FFMPEG_MISSING',
            details: { message: 'ffmpeg is required to downscale videos above 1080p.' },
          })
        }

        return jsonError(res, 500, 'Falha ao converter o vídeo para 1080p.', {
          code: 'VIDEO_DOWNSCALE_FAILED',
          details: { message: String(e?.message || e) },
        })
      }
    }

    // Ensure final file is within the project 1080p envelope.
    if (!isWithin1080p({ width, height })) {
      return jsonError(res, 400, 'Resolução acima do máximo permitido (1080p).', {
        code: 'VIDEO_RULES',
        details: {
          uploadType,
          durationSeconds,
          width,
          height,
          rule: { maxMaxDim: 1920, maxMinDim: 1080 },
        },
      })
    }

    const rules = getVideoRules(uploadType)
    if (!rules) {
      return jsonError(res, 400, 'Tipo de upload inválido.', {
        code: 'VIDEO_RULES',
        details: { uploadType },
      })
    }

    if (durationSeconds < rules.minSeconds || durationSeconds > rules.maxSeconds) {
      return jsonError(res, 400, 'Duração fora do permitido para este tipo de vídeo.', {
        code: 'VIDEO_RULES',
        details: {
          uploadType,
          durationSeconds,
          width,
          height,
          rule: rules,
        },
      })
    }

    // Try faststart remux (no side effects)
    let optimized = true
    let optimizeError = null
    const ffmpegStart = Date.now()
    try {
      req.log.info(
        {
          tag: 'UPLOAD',
          action: 'ffmpeg_faststart_begin',
          userIdMasked,
        },
        'ffmpeg faststart begin'
      )

      const outName = `joby-faststart-${crypto.randomUUID()}.mp4`
      tmpOutputPath = path.join(os.tmpdir(), outName)
      await runFfmpegFaststart({ inputPath: effectiveInputPath, outputPath: tmpOutputPath, ffmpegPath })

      req.log.info(
        {
          tag: 'UPLOAD',
          action: 'ffmpeg_faststart_done',
          userIdMasked,
          durationMs: Date.now() - ffmpegStart,
        },
        'ffmpeg faststart done'
      )
    } catch (e) {
      optimized = false
      tmpOutputPath = ''
      optimizeError = ffmpegSafeErrorDetails(e, ffmpegPath)
      req.log.warn(
        {
          tag: 'UPLOAD',
          action: 'ffmpeg_faststart_skipped',
          userIdMasked,
          durationMs: Date.now() - ffmpegStart,
          optimizeError,
        },
        'ffmpeg faststart skipped'
      )
    }

    if (dryRun) {
      let inputBytes = null
      let outputBytes = null
      try {
        const stIn = tmpInputPath ? await fsp.stat(tmpInputPath) : null
        inputBytes = stIn?.size ?? null
      } catch {
        // ignore
      }
      try {
        const stOut = tmpOutputPath ? await fsp.stat(tmpOutputPath) : null
        outputBytes = stOut?.size ?? null
      } catch {
        // ignore
      }

      return res.status(200).json({
        ok: true,
        dryRun: true,
        optimized,
        ...(optimized ? null : { optimizeError }),
        ffmpegPath,
        uploadType,
        videoType,
        meta: {
          durationSeconds,
          width,
          height,
        },
        inputBytes,
        outputBytes,
        title,
        description: description || '',
      })
    }

    const r2AccessKeyId = envString('R2_ACCESS_KEY_ID', { required: true })
    const r2SecretAccessKey = envString('R2_SECRET_ACCESS_KEY', { required: true })
    const r2Endpoint = envString('R2_ENDPOINT', { required: true })
    const r2Bucket = envString('R2_BUCKET_NAME', { required: true })

    const supabaseUrl = envString('SUPABASE_URL', { required: true })
    const supabaseServiceRoleKey = envString('SUPABASE_SERVICE_ROLE_KEY', { required: true })

    const workerBaseUrl = envString('WORKER_BASE_URL', { defaultValue: '' }).replace(/\/+$/, '')

    const ext = 'mp4'
    const r2Key = buildR2Key({ userId, ext })

    const s3 = new S3Client({
      region: 'auto',
      endpoint: r2Endpoint,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
      forcePathStyle: true,
    })

    // R2 sanity test before any heavy work (upload)
    try {
      const t = await r2SanityTest({ s3, bucket: r2Bucket })
      req.log.info(
        {
          tag: 'UPLOAD',
          action: 'r2_self_test_ok',
          key: t.key,
        },
        'r2 self-test ok'
      )
    } catch (err) {
      const details = awsSafeErrorDetails(err)
      const diag = {
        ...details,
        bucket: r2Bucket,
        endpoint: r2Endpoint,
        envFile: loadedEnvLabel || loadedEnvFile || 'none',
      }
      req.log.error(
        {
          tag: 'UPLOAD',
          action: 'r2_self_test_failed',
          ...diag,
        },
        'r2 self-test failed'
      )
      return jsonError(res, 502, 'R2 self-test failed', {
        ...diag,
        message: details.userMessage || details.message || 'R2 self-test failed',
      })
    }

  const uploadPath = tmpOutputPath || effectiveInputPath

    const r2UploadStart = Date.now()
    req.log.info(
      {
        tag: 'UPLOAD',
        action: 'r2_upload_begin',
        userIdMasked,
        key: r2Key,
        fileSize: file.size,
      },
      'r2 upload begin'
    )

    try {
      await uploadFileToR2({
        s3,
        bucket: r2Bucket,
        key: r2Key,
        filePath: uploadPath,
        contentType: 'video/mp4',
      })

      req.log.info(
        {
          tag: 'UPLOAD',
          action: 'r2_upload_done',
          userIdMasked,
          key: r2Key,
          fileSize: file.size,
          durationMs: Date.now() - r2UploadStart,
        },
        'r2 upload done'
      )
    } catch (err) {
      const details = awsSafeErrorDetails(err)
      const diag = {
        ...details,
        bucket: r2Bucket,
        endpoint: r2Endpoint,
        envFile: loadedEnvLabel || loadedEnvFile || 'none',
      }
      req.log.error(
        {
          tag: 'UPLOAD',
          action: 'r2_upload_failed',
          userIdMasked,
          key: r2Key,
          durationMs: Date.now() - r2UploadStart,
          ...diag,
        },
        'r2 upload failed'
      )
      return jsonError(res, 502, 'R2 upload failed', {
        ...diag,
        message: details.userMessage || details.message || 'R2 upload failed',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    })

    // Insert only fields required by the current schema.
    const row = {
      user_id: userId,
      title,
      description: description || '',
      url: r2Key,
      provider: 'cloudflare_r2',
      upload_type: uploadType,
      video_type: videoType,
      duration_seconds: durationSeconds,
      width,
      height,
      // Legacy compatibility
      duration: durationSeconds,
    }

    const { data, error } = await supabase.from('videos').insert([row]).select()
    if (error) {
      req.log.error(
        {
          tag: 'UPLOAD',
          action: 'supabase_insert_failed',
          userIdMasked,
          code: error.code,
          message: error.message,
        },
        'supabase insert failed'
      )
      return jsonError(res, 500, 'Supabase insert failed', { message: error.message })
    }

    req.log.info(
      {
        tag: 'UPLOAD',
        action: 'supabase_insert_ok',
        userIdMasked,
      },
      'supabase insert ok'
    )

    const playbackUrl = workerBaseUrl ? `${workerBaseUrl}/video/${r2Key}` : null

    return res.status(200).json({
      ok: true,
      optimized,
      ...(optimized ? null : { optimizeError }),
      r2Key,
      playbackUrl,
      inserted: data,
    })
  } catch (e) {
    const msg = String(e?.message || e)

    req.log.error(
      {
        tag: 'UPLOAD',
        action: 'handler_failed',
        err: e,
      },
      'upload handler failed'
    )

    if (msg.toLowerCase().includes('ffmpeg') && msg.toLowerCase().includes('not found')) {
      return jsonError(res, 500, 'ffmpeg not available', { message: msg })
    }

    return jsonError(res, 500, 'Internal server error', { message: msg })
  } finally {
    try {
      if (tmpInputPath) await fsp.unlink(tmpInputPath)
    } catch {
      // ignore
    }
    try {
      if (tmpDownscaledPath) await fsp.unlink(tmpDownscaledPath)
    } catch {
      // ignore
    }
    try {
      if (tmpOutputPath) await fsp.unlink(tmpOutputPath)
    } catch {
      // ignore
    }
  }
})

// Multer error handler (size limit, etc.)
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return jsonError(res, 413, 'File too large', { maxBytes: maxVideoBytes })
  }
  return jsonError(res, 500, 'Upload error', { message: String(err?.message || err) })
})

const port = envInt('PORT', { defaultValue: 8788 })
app.listen(port, () => {
  logger.info(
    {
      tag: 'SERVER',
      action: 'listening',
      url: `http://localhost:${port}`,
      envFile: loadedEnvLabel || '(missing: server/.env.local or server/.env)',
    },
    'listening'
  )
})
