import { useEffect, useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { Alert, Skeleton } from '../ui/Feedback'

/** Fetch a proof file with the Bearer token and open it in a new tab. */
export async function openProof(path) {
  // Open the tab first, synchronously, so popup blockers allow it.
  const tab = window.open('', '_blank')
  try {
    const { data } = await api.get(path, { responseType: 'blob' })
    const url = URL.createObjectURL(data)
    if (tab) tab.location.href = url
    else window.location.assign(url)
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    tab?.close()
    throw error
  }
}

/** Inline preview of a proof file (PDF frame or image), fetched with the token. */
export function ProofViewer({ path }) {
  const [file, setFile] = useState({ url: null, type: null, error: null, loading: true })

  useEffect(() => {
    let url = null
    let cancelled = false
    setFile({ url: null, type: null, error: null, loading: true })
    api
      .get(path, { responseType: 'blob' })
      .then(({ data }) => {
        if (cancelled) return
        url = URL.createObjectURL(data)
        setFile({ url, type: data.type, error: null, loading: false })
      })
      .catch((error) => {
        if (!cancelled) setFile({ url: null, type: null, error, loading: false })
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [path])

  if (file.loading) return <Skeleton className="h-80 w-full" />
  if (file.error) return <Alert tone="error">The proof file could not be loaded. {errorMessage(file.error, '')}</Alert>

  return (
    <div>
      <div className="overflow-hidden rounded-md border border-neutral-200 bg-neutral-50">
        {file.type === 'application/pdf' ? (
          <iframe src={file.url} title="Result proof" className="h-[28rem] w-full" />
        ) : (
          <img src={file.url} alt="Result proof" className="mx-auto max-h-[28rem] object-contain" />
        )}
      </div>
      <a href={file.url} target="_blank" rel="noreferrer" className="link mt-2 inline-block text-sm">
        View proof in a new tab
      </a>
    </div>
  )
}
