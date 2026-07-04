import { useEffect, useState } from 'react'
import { getSignedUrl, openPrivate } from '../lib/storage'

/**
 * Renders a thumbnail from a PRIVATE bucket via a short-lived signed URL,
 * and opens the full file in a new tab (fresh signed URL) when clicked.
 */
export function PrivateImage({
  bucket,
  path,
  className,
  alt = 'attachment',
}: {
  bucket: string
  path: string | null | undefined
  className?: string
  alt?: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    if (path) getSignedUrl(bucket, path).then(u => { if (alive) setUrl(u) })
    else setUrl(null)
    return () => { alive = false }
  }, [bucket, path])

  if (!path) return null
  if (!url) return <div className={className} style={{ background: 'rgba(255,255,255,0.06)' }} />

  return (
    <button
      type="button"
      onClick={() => openPrivate(bucket, path)}
      title="Open file"
      style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
    >
      <img src={url} alt={alt} className={className} />
    </button>
  )
}

/**
 * A text/button link that opens a PRIVATE file in a new tab using a fresh
 * signed URL. Drop-in replacement for <a href={publicUrl}>…</a>.
 */
export function PrivateLink({
  bucket,
  path,
  children,
  className,
}: {
  bucket: string
  path: string | null | undefined
  children: React.ReactNode
  className?: string
}) {
  if (!path) return <>{children}</>
  return (
    <button
      type="button"
      className={className}
      onClick={() => openPrivate(bucket, path)}
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
    >
      {children}
    </button>
  )
}