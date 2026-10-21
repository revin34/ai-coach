import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const userFindUnique = vi.fn()
const userCreate = vi.fn()
const userUpdate = vi.fn()
const sessionCreate = vi.fn()
const setCookieMock = vi.fn()
const readBodyMock = vi.fn()

vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('readBody', (...args: unknown[]) => readBodyMock(...args))
vi.stubGlobal('setCookie', (...args: unknown[]) => setCookieMock(...args))
vi.stubGlobal('getHeader', () => undefined)
vi.stubGlobal('createError', (input: any) => Object.assign(new Error(input.message), input))

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      create: (...a: unknown[]) => userCreate(...a),
      update: (...a: unknown[]) => userUpdate(...a)
    },
    session: { create: (...a: unknown[]) => sessionCreate(...a) }
  }
}))
vi.mock('../../../../../server/utils/audit', () => ({ logAction: vi.fn() }))

let ipCounter = 0
const makeEvent = () => ({ node: { req: { socket: { remoteAddress: `10.0.0.${++ipCounter}` } } } })

const register = async () => (await import('../../../../../server/api/auth/register.post')).default
const login = async () => (await import('../../../../../server/api/auth/login.post')).default

const ENV_KEYS = [
  'REGISTRATION_MODE',
  'REGISTRATION_INVITE_CODE',
  'AUTH_ORIGIN',
  'NUXT_AUTH_ORIGIN'
]
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    Reflect.deleteProperty(process.env, k)
  }
  for (const m of [
    userFindUnique,
    userCreate,
    userUpdate,
    sessionCreate,
    setCookieMock,
    readBodyMock
  ]) {
    m.mockReset()
  }
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) Reflect.deleteProperty(process.env, k)
    else process.env[k] = savedEnv[k]
  }
})

describe('POST /api/auth/register', () => {
  const body = {
    email: ' Ana@Example.com ',
    password: 'una-contraseña-larga',
    name: 'Ana',
    inviteCode: 'secreto'
  }

  it('rejects everything when registration is closed', async () => {
    process.env.REGISTRATION_MODE = 'closed'
    readBodyMock.mockResolvedValue(body)
    await expect((await register())(makeEvent() as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(userCreate).not.toHaveBeenCalled()
  })

  it('defaults to invite mode and rejects a wrong code', async () => {
    process.env.REGISTRATION_INVITE_CODE = 'otro'
    readBodyMock.mockResolvedValue(body)
    await expect((await register())(makeEvent() as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(userCreate).not.toHaveBeenCalled()
  })

  it('rejects invite mode when no code is configured on the server', async () => {
    readBodyMock.mockResolvedValue(body)
    await expect((await register())(makeEvent() as any)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects short passwords', async () => {
    process.env.REGISTRATION_MODE = 'open'
    readBodyMock.mockResolvedValue({ ...body, password: 'corta' })
    await expect((await register())(makeEvent() as any)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('does not attach a password to an existing account', async () => {
    process.env.REGISTRATION_MODE = 'open'
    readBodyMock.mockResolvedValue(body)
    userFindUnique.mockResolvedValue({ id: 'u1' })
    await expect((await register())(makeEvent() as any)).rejects.toMatchObject({ statusCode: 409 })
    expect(userCreate).not.toHaveBeenCalled()
  })

  it('creates the user with a hashed password and starts a session (invite ok)', async () => {
    process.env.REGISTRATION_INVITE_CODE = 'secreto'
    readBodyMock.mockResolvedValue(body)
    userFindUnique.mockResolvedValue(null)
    userCreate.mockImplementation(async ({ data }: any) => ({
      id: 'u2',
      email: data.email,
      name: data.name
    }))

    const result = await (await register())(makeEvent() as any)

    const data = userCreate.mock.calls[0][0].data
    expect(data.email).toBe('ana@example.com')
    expect(data.passwordHash).toMatch(/^\$2[aby]\$/)
    expect(data.passwordHash).not.toContain('contraseña')
    expect(sessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u2', sessionToken: expect.any(String) })
    })
    expect(setCookieMock.mock.calls[0][1]).toBe('next-auth.session-token')
    expect(result).toMatchObject({ ok: true, user: { id: 'u2' } })
  })
})

describe('POST /api/auth/login', () => {
  it('rejects unknown emails with a generic 401', async () => {
    readBodyMock.mockResolvedValue({ email: 'nadie@example.com', password: 'lo-que-sea' })
    userFindUnique.mockResolvedValue(null)
    await expect((await login())(makeEvent() as any)).rejects.toMatchObject({ statusCode: 401 })
    expect(sessionCreate).not.toHaveBeenCalled()
  })

  it('rejects OAuth-only accounts that have no password', async () => {
    readBodyMock.mockResolvedValue({ email: 'oauth@example.com', password: 'lo-que-sea' })
    userFindUnique.mockResolvedValue({ id: 'u3', passwordHash: null, deactivatedAt: null })
    await expect((await login())(makeEvent() as any)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects a wrong password', async () => {
    const { hashPassword } = await import('../../../../../server/utils/password-auth')
    readBodyMock.mockResolvedValue({ email: 'ana@example.com', password: 'incorrecta-123' })
    userFindUnique.mockResolvedValue({
      id: 'u4',
      passwordHash: await hashPassword('la-buena-contraseña'),
      deactivatedAt: null
    })
    await expect((await login())(makeEvent() as any)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('blocks deactivated users even with the right password', async () => {
    const { hashPassword } = await import('../../../../../server/utils/password-auth')
    readBodyMock.mockResolvedValue({ email: 'ana@example.com', password: 'la-buena-contraseña' })
    userFindUnique.mockResolvedValue({
      id: 'u5',
      passwordHash: await hashPassword('la-buena-contraseña'),
      deactivatedAt: new Date()
    })
    await expect((await login())(makeEvent() as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(sessionCreate).not.toHaveBeenCalled()
  })

  it('starts a session on valid credentials, using the secure cookie name over https', async () => {
    process.env.AUTH_ORIGIN = 'https://coach.example.com'
    const { hashPassword } = await import('../../../../../server/utils/password-auth')
    readBodyMock.mockResolvedValue({ email: 'ANA@example.com', password: 'la-buena-contraseña' })
    userFindUnique.mockResolvedValue({
      id: 'u6',
      email: 'ana@example.com',
      name: 'Ana',
      passwordHash: await hashPassword('la-buena-contraseña'),
      deactivatedAt: null
    })

    const result = await (await login())(makeEvent() as any)

    expect(userFindUnique.mock.calls[0][0].where.email).toBe('ana@example.com')
    expect(setCookieMock.mock.calls[0][1]).toBe('__Secure-next-auth.session-token')
    expect(result).toMatchObject({ ok: true, user: { id: 'u6' } })
  })

  it('rate limits repeated attempts for the same email', async () => {
    readBodyMock.mockResolvedValue({ email: 'brute@example.com', password: 'x' })
    userFindUnique.mockResolvedValue(null)
    const handler = await login()
    for (let i = 0; i < 8; i++) {
      await expect(handler(makeEvent() as any)).rejects.toMatchObject({ statusCode: 401 })
    }
    await expect(handler(makeEvent() as any)).rejects.toMatchObject({ statusCode: 429 })
  })
})
