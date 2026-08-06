const MAX_BASE64_LENGTH = 8_000_000

function send(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })

  const apiUrl = String(process.env.DOCLENS_API_URL || 'https://doclens-amber.vercel.app/api/v1/recognize').trim()
  const apiKey = String(process.env.DOCLENS_API_KEY || '').trim()
  if (!apiKey) return send(res, 503, { error: 'DocLens is not configured', code: 'DOCLENS_NOT_CONFIGURED' })

  const { data, mimeType = 'image/jpeg', requestId = null } = req.body || {}
  if (typeof data !== 'string' || !data) return send(res, 400, { error: 'Image data is required' })
  if (!/^image\/(jpeg|png|webp)$/i.test(mimeType)) return send(res, 400, { error: 'Unsupported image type' })
  if (data.length > MAX_BASE64_LENGTH) return send(res, 413, { error: 'Image is too large' })

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ data, mimeType, requestId }),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      console.error('DocLens request failed', response.status, payload)
      return send(res, response.status, {
        error: payload?.error?.message || payload?.error || 'Document recognition failed',
        code: payload?.error?.code || 'DOCLENS_ERROR',
      })
    }

    return send(res, 200, payload)
  } catch (error) {
    console.error('DocLens proxy error', error)
    return send(res, 500, { error: 'Document recognition failed', code: 'DOCLENS_PROXY_ERROR' })
  }
}
