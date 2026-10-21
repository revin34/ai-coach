import { afterEach, describe, expect, it } from 'vitest'
import {
  getRegistrationMode,
  inviteCodeMatches,
  normalizeEmail,
  validatePassword
} from '../../../../server/utils/password-auth'

afterEach(() => {
  delete process.env.REGISTRATION_MODE
  delete process.env.REGISTRATION_INVITE_CODE
})

describe('password-auth utils', () => {
  it('defaults to invite and falls back to invite on unknown values', () => {
    expect(getRegistrationMode()).toBe('invite')
    process.env.REGISTRATION_MODE = 'banana'
    expect(getRegistrationMode()).toBe('invite')
    process.env.REGISTRATION_MODE = ' OPEN '
    expect(getRegistrationMode()).toBe('open')
    process.env.REGISTRATION_MODE = 'closed'
    expect(getRegistrationMode()).toBe('closed')
  })

  it('normalizes emails', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com')
  })

  it('enforces password length in characters and bytes', () => {
    expect(validatePassword('123456789')).not.toBeNull()
    expect(validatePassword('1234567890')).toBeNull()
    expect(validatePassword('a'.repeat(73))).not.toBeNull()
  })

  it('matches invite codes only when configured and equal', () => {
    expect(inviteCodeMatches('x')).toBe(false)
    process.env.REGISTRATION_INVITE_CODE = 'abc'
    expect(inviteCodeMatches('abc')).toBe(true)
    expect(inviteCodeMatches('abd')).toBe(false)
    expect(inviteCodeMatches(undefined)).toBe(false)
  })
})
