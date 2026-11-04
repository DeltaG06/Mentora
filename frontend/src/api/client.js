import axios from 'axios'

const TOKEN_KEY = 'mentora.token'

const origin = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

export const api = axios.create({ baseURL: `${origin}/api/v1` })

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage can be unavailable (private mode); the session then lasts one tab.
  }
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Endpoints where a 401 means "wrong credentials", not "session expired".
const PUBLIC_PATHS = ['/auth/login', '/auth/register']

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const url = error.config?.url || ''
    if (status === 401 && !PUBLIC_PATHS.some((path) => url.startsWith(path))) {
      setToken(null)
      if (window.location.pathname !== '/login') {
        window.location.assign('/login?expired=1')
      }
    }
    return Promise.reject(error)
  },
)

/** A human-readable message from an API error (FastAPI `detail` string or list). */
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error?.response) {
    return error?.message === 'Network Error'
      ? 'Cannot reach the server. Check your connection and try again.'
      : fallback
  }
  const detail = error.response.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) => {
        const field = (item.loc || []).filter((part) => part !== 'body').join('.')
        const msg = String(item.msg || '').replace(/^Value error, /, '')
        return field ? `${field}: ${msg}` : msg
      })
      .join('; ')
  }
  if (error.response.status === 413) return 'The file is larger than 5 MB.'
  return fallback
}

/** Fetch every page of a paginated endpoint (fine at mentorship-scheme scale). */
export async function fetchAll(path, params = {}) {
  const items = []
  for (let page = 1; ; page += 1) {
    const { data } = await api.get(path, { params: { ...params, page, page_size: 100 } })
    items.push(...data.items)
    if (items.length >= data.total || data.items.length === 0) return items
  }
}
