import { supabase } from './supabase'

/**
 * Secure file storage helpers.
 * All buckets are PRIVATE. We store the object PATH in the database and mint
 * a short-lived signed URL only when a permitted user opens the file.
 */

const SIGNED_URL_TTL = 60 * 10 // 10 minutes

const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25 MB
const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.ms-excel',
]

export function validateUpload(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) return 'File is too large (max 25 MB).'
  if (file.type && !ALLOWED_MIME.includes(file.type)) {
    return 'Unsupported file type. Allowed: PDF, images, Word, Excel.'
  }
  return null
}

/**
 * Build a collision-resistant, path-safe object key. The first segment is
 * the org id — storage RLS keys off it, so uploads land in the org's folder.
 */
export function makeObjectPath(orgId: string | null | undefined, file: File, prefix = ''): string {
  const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const rand = crypto.randomUUID()
  const parts = [orgId ?? 'unknown', prefix, `${Date.now()}_${rand}_${clean}`].filter(Boolean)
  return parts.join('/')
}

export async function uploadPrivate(
  bucket: string,
  path: string,
  file: File
): Promise<{ path?: string; error?: string }> {
  const bad = validateUpload(file)
  if (bad) return { error: bad }
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  })
  if (error) return { error: error.message }
  return { path }
}

export async function getSignedUrl(
  bucket: string,
  path: string | null | undefined
): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL)
  if (error) return null
  return data?.signedUrl ?? null
}

export async function openPrivate(bucket: string, path: string | null | undefined) {
  const signed = await getSignedUrl(bucket, path)
  if (signed) window.open(signed, '_blank', 'noopener,noreferrer')
}