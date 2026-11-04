import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

/**
 * GET `path` (with query `params`) and keep the result. `path` may be null
 * to skip the request. Changing `refresh` re-fetches without being sent.
 * Returns { data, error, loading, reload, setData }.
 */
export function useApi(path, params, refresh) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) })
  const key = JSON.stringify(params || {})
  const request = useRef(0)

  const load = useCallback(async () => {
    if (!path) return
    const id = ++request.current
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const { data } = await api.get(path, { params: JSON.parse(key) })
      if (id === request.current) setState({ data, error: null, loading: false })
    } catch (error) {
      if (id === request.current) setState((prev) => ({ ...prev, error, loading: false }))
    }
  }, [path, key])

  useEffect(() => {
    load()
  }, [load, refresh])

  const setData = useCallback((updater) => {
    setState((prev) => ({
      ...prev,
      data: typeof updater === 'function' ? updater(prev.data) : updater,
    }))
  }, [])

  return { ...state, reload: load, setData }
}
