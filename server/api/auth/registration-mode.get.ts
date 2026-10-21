import { getRegistrationMode } from '../../utils/password-auth'

// Lets the login/join pages decide whether to show the invite code field or the signup form.
export default defineEventHandler(() => ({ mode: getRegistrationMode() }))
