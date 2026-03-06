import pino from 'pino'

const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production'

// Default behavior:
// - DEV: info
// - PROD: warn (keep production quieter by default)
// Override via LOG_LEVEL.
const level =
  String(process.env.LOG_LEVEL || '').trim() || (isProd ? 'warn' : 'info')

const transport =
  !isProd
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: false,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      })
    : undefined

export const logger = pino(
  {
    level,
    base: { service: 'joby-upload-server' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.apikey',
        'req.headers["x-api-key"]',
        'req.headers["x-supabase-api-key"]',
        'req.headers["x-amz-security-token"]',
        'req.headers["x-amz-signature"]',
        'req.headers["x-amz-credential"]',
        'req.headers["x-amz-date"]',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
  },
  transport
)
