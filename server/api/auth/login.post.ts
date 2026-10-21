import { z } from 'zod/v3'
import { prisma } from '../../utils/db'
import { logAction } from '../../utils/audit'
import { normalizeEmail, startSession, verifyPassword } from '../../utils/password-auth'
import { enforceLoginRateLimit } from '../../utils/password-auth-rate-limit'

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(1000)
})

export default defineEventHandler(async (event) => {
  const parsed = loginSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Email o contraseña no válidos.' })
  }
  const email = normalizeEmail(parsed.data.email)

  enforceLoginRateLimit(event, email)

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, passwordHash: true, deactivatedAt: true }
  })

  const valid = await verifyPassword(parsed.data.password, user?.passwordHash)
  if (!user || !valid) {
    throw createError({ statusCode: 401, message: 'Email o contraseña incorrectos.' })
  }

  if (user.deactivatedAt) {
    throw createError({ statusCode: 403, message: 'Esta cuenta está desactivada.' })
  }

  await startSession(event, user.id)
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await logAction({
    userId: user.id,
    action: 'USER_LOGIN',
    metadata: { provider: 'password' },
    event
  })

  return { ok: true, user: { id: user.id, email: user.email, name: user.name } }
})
