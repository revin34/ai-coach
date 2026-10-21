import bcrypt from 'bcrypt'
import { timingSafeEqual } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import type { H3Event } from 'h3'
import { prisma } from './db'

export type RegistrationMode = 'invite' | 'open' | 'closed'

export const PASSWORD_MIN_LENGTH = 10
// bcrypt ignores everything past 72 bytes, so longer passwords would silently weaken.
export const PASSWORD_MAX_BYTES = 72
export const BCRYPT_ROUNDS = 12
const SESSION_DAYS = 30

// Compared against when the email is unknown so response time doesn't reveal which emails exist.
let dummyHash: Promise<string> | undefined
const getDummyHash = () => (dummyHash ??= bcrypt.hash('unknown-user-placeholder', BCRYPT_ROUNDS))

export function getRegistrationMode(): RegistrationMode {
  const raw = (process.env.REGISTRATION_MODE || 'invite').trim().toLowerCase()
  return raw === 'open' || raw === 'closed' ? raw : 'invite'
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return 'La contraseña es demasiado larga (máximo 72 bytes).'
  }
  return null
}

export function inviteCodeMatches(provided: string | undefined) {
  const expected = process.env.REGISTRATION_INVITE_CODE
  if (!expected || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string | null | undefined) {
  const ok = await bcrypt.compare(password, hash || (await getDummyHash()))
  return Boolean(hash) && ok
}

export function getClientIp(event: H3Event) {
  const forwarded = getHeader(event, 'x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || event.node?.req?.socket?.remoteAddress || 'unknown'
}

function useSecureCookies() {
  const origin = process.env.AUTH_ORIGIN || process.env.NUXT_AUTH_ORIGIN || ''
  return origin.startsWith('https://')
}

/** Creates a database session and sets the cookie next-auth reads (same mechanics as next-auth itself). */
export async function startSession(event: H3Event, userId: string) {
  const sessionToken = uuidv4()
  const expires = new Date()
  expires.setDate(expires.getDate() + SESSION_DAYS)

  await prisma.session.create({ data: { sessionToken, userId, expires } })

  const secure = useSecureCookies()
  setCookie(event, `${secure ? '__Secure-' : ''}next-auth.session-token`, sessionToken, {
    httpOnly: true,
    secure,
    path: '/',
    expires,
    sameSite: 'lax'
  })
}
