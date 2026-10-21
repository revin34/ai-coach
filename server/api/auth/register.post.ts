import { z } from 'zod/v3'
import { prisma } from '../../utils/db'
import { logAction } from '../../utils/audit'
import { DEFAULT_TRIAL_DAYS } from '../../../shared/trial-config'
import {
  getRegistrationMode,
  hashPassword,
  inviteCodeMatches,
  normalizeEmail,
  startSession,
  validatePassword
} from '../../utils/password-auth'
import { enforceRegisterRateLimit } from '../../utils/password-auth-rate-limit'

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string(),
  name: z.string().trim().min(1).max(100).optional(),
  inviteCode: z.string().max(200).optional()
})

export default defineEventHandler(async (event) => {
  const mode = getRegistrationMode()
  if (mode === 'closed') {
    throw createError({ statusCode: 403, message: 'El registro está cerrado.' })
  }

  enforceRegisterRateLimit(event)

  const parsed = registerSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Datos de registro no válidos.' })
  }
  const { password, name, inviteCode } = parsed.data
  const email = normalizeEmail(parsed.data.email)

  if (mode === 'invite' && !inviteCodeMatches(inviteCode)) {
    throw createError({ statusCode: 403, message: 'Código de invitación no válido.' })
  }

  const passwordError = validatePassword(password)
  if (passwordError) {
    throw createError({ statusCode: 400, message: passwordError })
  }

  // Never attach a password to a pre-existing account (e.g. one created through OAuth).
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    throw createError({ statusCode: 409, message: 'Ya existe una cuenta con ese email.' })
  }

  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + DEFAULT_TRIAL_DAYS)

  let user
  try {
    user = await prisma.user.create({
      data: {
        email,
        name: name || email.split('@')[0],
        passwordHash: await hashPassword(password),
        trialEndsAt
      },
      select: { id: true, email: true, name: true }
    })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      throw createError({ statusCode: 409, message: 'Ya existe una cuenta con ese email.' })
    }
    throw error
  }

  await startSession(event, user.id)
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await logAction({
    userId: user.id,
    action: 'USER_REGISTER',
    metadata: { provider: 'password', mode },
    event
  })

  return { ok: true, user }
})
