/**
 * Signing a request the way S3 wants it, and nothing else.
 *
 * Its own file because it is a library and tools/publish-run.ts is a program:
 * importing the program to reach the signer ran the program, which published a
 * run nobody had asked for. That is the whole reason this is not down there.
 */
import { createHash, createHmac } from 'node:crypto'

/**
 * A request signed the way S3 wants it, and nothing else.
 *
 * Signature Version 4 is a chain of hashes rather than a secret handshake: the
 * request is written out in a canonical form, that form is hashed into a
 * string to sign, and the key is derived from the secret by hashing the date,
 * the region and the service in turn -- so the credential that travels is only
 * ever good for one request on one day. Writing it out is fifty lines against
 * a dependency of tens of megabytes, and this file is the only thing in the
 * project that talks to a bucket.
 */
export async function signed(
  method: 'GET' | 'PUT' | 'DELETE',
  url: string,
  body: Uint8Array | string = '',
  extra: Record<string, string> = {},
) {
  const key = process.env.AWS_ACCESS_KEY_ID
  const secret = process.env.AWS_SECRET_ACCESS_KEY
  if (!key || !secret) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are not set')
  }
  const target = new URL(url)
  /**
   * The region, read off the endpoint, because the signature is scoped to it.
   *
   * `<bucket>.s3.<region>.amazonaws.com` and `s3.<region>.amazonaws.com` both
   * name it; `s3.amazonaws.com` and the older `s3-<region>` form do not and
   * mean us-east-1. AWS_REGION wins where it is set, since a bucket behind a
   * CloudFront domain has no region in its name at all.
   */
  const region = process.env.AWS_REGION
    ?? /(?:^|\.)s3[.-]([a-z0-9-]+)\.amazonaws\.com$/.exec(target.hostname)?.[1]
    ?? 'us-east-1'
  const bytes = typeof body === 'string' ? Buffer.from(body) : Buffer.from(body)
  const sha = createHash('sha256').update(bytes).digest('hex')
  const now = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')
  const day = now.slice(0, 8)

  // Lower-cased and sorted, which is what the canonical form is: the same
  // request written the same way by both sides.
  const headers = Object.fromEntries(
    Object.entries({
      host: target.host,
      'x-amz-content-sha256': sha,
      'x-amz-date': now,
      ...extra,
    }).map(([name, value]) => [name.toLowerCase(), value.trim()]),
  )
  const names = Object.keys(headers).sort()
  const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join('')
  const signedHeaders = names.join(';')
  // The path is signed as it is sent, so each segment is escaped once and the
  // slashes between them are left alone.
  const path = target.pathname.split('/').map((part) => encodeURIComponent(decodeURIComponent(part))).join('/')
  const query = [...target.searchParams.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const canonical = [method, path, query, canonicalHeaders, signedHeaders, sha].join('\n')

  const scope = `${day}/${region}/s3/aws4_request`
  const toSign = [
    'AWS4-HMAC-SHA256', now, scope, createHash('sha256').update(canonical).digest('hex'),
  ].join('\n')
  const hmac = (k: Buffer | string, data: string) => createHmac('sha256', k).update(data).digest()
  const signature = createHmac(
    'sha256',
    hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), 's3'), 'aws4_request'),
  ).update(toSign).digest('hex')

  return fetch(url, {
    method,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${key}/${scope}, `
        + `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: method === 'PUT' ? bytes : undefined,
  })
}
