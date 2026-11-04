import { useEffect, useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { Alert } from '../ui/Feedback'

/** Fetches a proof file with the Bearer token and previews it inline. */
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

  if (file.loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading proof…
      </div>
    )
  }
  if (file.error) {
    return <Alert tone="error">Could not load the proof file. {errorMessage(file.error, '')}</Alert>
  }

  return (
    <div>
      <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-50">
        {file.type === 'application/pdf' ? (
          <iframe src={file.url} title="Result proof" className="h-[28rem] w-full" />
        ) : (
          <img src={file.url} alt="Result proof" className="mx-auto max-h-[28rem] object-contain" />
        )}
      </div>
      <a
        href={file.url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 text-sm link"
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        Open in a new tab
      </a>
    </div>
  )
}
