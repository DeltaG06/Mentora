import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, getToken, setToken } from '../api/client'

const AuthContext = createContext(null)

export const HOME_BY_ROLE = {
  student: '/student',
  mentor: '/mentor',
  admin: '/admin',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  // Restore the session from a stored token.
  useEffect(() => {
    if (!getToken()) {
      setReady(true)
      return
    }
    api
      .get('/auth/me')
      .then(({ data }) => setUser(data))
      .catch(() => setToken(null))
      .finally(() => setReady(true))
  }, [])

  const login = useCallback(async (email, password) => {
    const form = new URLSearchParams({ username: email.trim(), password })
    const { data } = await api.post('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    setToken(data.access_token)
    setUser(data.user)
    return data.user
  }, [])

  /** Students are signed in straight away; mentors wait for approval. */
  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload)
    if (data.user.status === 'active') {
      setToken(data.access_token)
      setUser(data.user)
    }
    return data.user
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, ready, login, register, logout, setUser }),
    [user, ready, login, register, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
