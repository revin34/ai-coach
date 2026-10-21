import type { H3Event } from 'h3'
import { checkRateLimit } from './rate-limit'
import { getClientIp } from './password-auth'

const WINDOW_MS = 15 * 60 * 1000

function reject(retryAfterMs: number) {
  throw createError({
    statusCode: 429,
    message: `Demasiados intentos. Inténtalo de nuevo en ${Math.ceil(retryAfterMs / 60000)} min.`
  })
}

export function enforceLoginRateLimit(event: H3Event, email: string) {
  const ipResult = checkRateLimit('password-login-ip', getClientIp(event), {
    windowMs: WINDOW_MS,
    maxAttempts: 30
  })
  if (!ipResult.allowed) reject(ipResult.retryAfterMs)

  const emailResult = checkRateLimit('password-login-email', email, {
    windowMs: WINDOW_MS,
    maxAttempts: 8
  })
  if (!emailResult.allowed) reject(emailResult.retryAfterMs)
}

export function enforceRegisterRateLimit(event: H3Event) {
  const result = checkRateLimit('password-register-ip', getClientIp(event), {
    windowMs: WINDOW_MS,
    maxAttempts: 10
  })
  if (!result.allowed) reject(result.retryAfterMs)
}
