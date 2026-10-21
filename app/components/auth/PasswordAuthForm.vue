<template>
  <form class="space-y-4" novalidate @submit.prevent="submit">
    <UAlert
      v-if="mode === 'register' && registrationMode === 'closed'"
      color="warning"
      variant="subtle"
      title="El registro está cerrado"
      description="Pide a quien administra este servidor que cree tu cuenta."
    />

    <template v-else>
      <UFormField v-if="mode === 'register'" label="Nombre">
        <UInput
          v-model="name"
          type="text"
          autocomplete="name"
          size="xl"
          class="w-full"
          placeholder="Tu nombre"
        />
      </UFormField>

      <UFormField label="Email">
        <UInput
          v-model="email"
          type="email"
          autocomplete="email"
          required
          size="xl"
          class="w-full"
          placeholder="tu@email.com"
        />
      </UFormField>

      <UFormField
        label="Contraseña"
        :help="mode === 'register' ? 'Mínimo 10 caracteres.' : undefined"
      >
        <UInput
          v-model="password"
          type="password"
          :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
          required
          size="xl"
          class="w-full"
        />
      </UFormField>

      <UFormField
        v-if="mode === 'register' && registrationMode === 'invite'"
        label="Código de invitación"
      >
        <UInput
          v-model="inviteCode"
          type="text"
          autocomplete="off"
          required
          size="xl"
          class="w-full"
        />
      </UFormField>

      <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />

      <UButton
        type="submit"
        block
        size="xl"
        color="primary"
        class="h-14 rounded-xl text-xs font-bold uppercase tracking-[0.15em]"
        :loading="loading"
      >
        {{ mode === 'register' ? 'Crear cuenta' : 'Entrar' }}
      </UButton>
    </template>
  </form>
</template>

<script setup lang="ts">
  const props = defineProps<{
    mode: 'login' | 'register'
    callbackUrl: string
  }>()

  const email = ref('')
  const password = ref('')
  const name = ref('')
  const inviteCode = ref('')
  const loading = ref(false)
  const errorMessage = ref('')

  type RegistrationMode = 'invite' | 'open' | 'closed'

  // Untyped on purpose: Nitro's route typings make these calls too deep for vue-tsc.
  const api = $fetch as (url: string, options?: Record<string, unknown>) => Promise<any>

  const { data: registrationMode } = await useAsyncData<RegistrationMode>(
    'registration-mode',
    async () => ((await api('/api/auth/registration-mode')) as { mode: RegistrationMode }).mode,
    { default: (): RegistrationMode => 'invite' }
  )

  // Only same-site paths: never redirect to an attacker-supplied absolute URL.
  const safeCallback = () =>
    props.callbackUrl.startsWith('/') && !props.callbackUrl.startsWith('//')
      ? props.callbackUrl
      : '/dashboard'

  async function submit() {
    errorMessage.value = ''
    loading.value = true
    try {
      await api(props.mode === 'register' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        body:
          props.mode === 'register'
            ? {
                email: email.value,
                password: password.value,
                name: name.value || undefined,
                inviteCode: inviteCode.value || undefined
              }
            : { email: email.value, password: password.value }
      })
      // Full navigation so the freshly set session cookie is picked up everywhere.
      await navigateTo(safeCallback(), { external: true })
    } catch (error: any) {
      errorMessage.value =
        error?.data?.message || error?.statusMessage || 'No se pudo completar la operación.'
      loading.value = false
    }
  }
</script>
