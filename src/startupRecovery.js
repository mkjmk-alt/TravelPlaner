export const STARTUP_TIMEOUT_MS = 8000

export function classifyStartupError(error) {
  if (error?.code === 'STARTUP_TIMEOUT') return 'timeout'

  const message = String(error?.message || error || '').toLowerCase()
  if (/failed to fetch|network|offline|connection/.test(message)) return 'offline'
  return 'app'
}

export async function loadRuntimeConfig(fetchImpl = globalThis.fetch, options = {}) {
  if (typeof fetchImpl !== 'function') return {}

  const timeoutMs = options.timeoutMs ?? STARTUP_TIMEOUT_MS
  const controller = new AbortController()
  const timeoutError = Object.assign(new Error('Startup configuration timed out'), { code: 'STARTUP_TIMEOUT' })
  const timeoutId = setTimeout(() => controller.abort(timeoutError), timeoutMs)

  try {
    const response = await fetchImpl('/api/config', {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response?.ok) return {}

    const config = await response.json()
    return config && typeof config === 'object' && !Array.isArray(config) ? config : {}
  } catch {
    return {}
  } finally {
    clearTimeout(timeoutId)
  }
}
