import { createContext, useContext, useEffect, useState } from 'react'

const BreadcrumbContext = createContext({ detail: null, setDetail: () => {} })

export function BreadcrumbProvider({ children }) {
  const [detail, setDetail] = useState(null)
  return <BreadcrumbContext.Provider value={{ detail, setDetail }}>{children}</BreadcrumbContext.Provider>
}

/** Pages below a section (e.g. a mentee) name the last breadcrumb segment. */
export function useBreadcrumb(label) {
  const { setDetail } = useContext(BreadcrumbContext)
  useEffect(() => {
    setDetail(label || null)
    return () => setDetail(null)
  }, [label, setDetail])
}

export function useBreadcrumbDetail() {
  return useContext(BreadcrumbContext).detail
}
