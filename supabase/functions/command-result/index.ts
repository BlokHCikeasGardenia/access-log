// Supabase Edge Function: proxy to the external gate command-result API.
//
// The external API (https://cek.goepoet.com/command-result.php) does not send
// CORS headers, so a browser on GitHub Pages cannot call it directly. This
// function forwards the polling request server-side and relays the feedback.
//
// Request contract (confirmed with the gate provider):
//   { "action": "ADD" | "UPDATE" | "DELETE", "uid": 12345678 }
// Feedback:
//   { "success": true, "message": "...", "data": { "action": "UPDATE", "uid": 123,
//     "status": "DONE" | "PENDING", "tgl_kirim": "...", "tgl_eksekusi": "...", "pesan": "..." } }
//
// verify_jwt = true (see supabase/config.toml) means only authenticated users
// may call this endpoint.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const API_URL = 'https://cek.goepoet.com/command-result.php'

const ALLOWED_ACTIONS = ['ADD', 'UPDATE', 'DELETE']

function corsResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (req) => {
  // Handle CORS preflight.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return corsResponse(JSON.stringify({ success: false, message: 'Method not allowed' }), { status: 405 })
  }

  try {
    const raw = await req.text()
    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw)
    } catch {
      return corsResponse(JSON.stringify({ success: false, message: 'JSON tidak valid' }), { status: 400 })
    }

    const action = String(body.action ?? '').toUpperCase()
    if (!ALLOWED_ACTIONS.includes(action)) {
      return corsResponse(
        JSON.stringify({ success: false, message: 'action harus ADD, UPDATE, atau DELETE' }),
        { status: 400 },
      )
    }

    const uidRaw = body.uid ?? body.raw_id
    if (uidRaw === undefined || uidRaw === null || String(uidRaw).trim() === '') {
      return corsResponse(JSON.stringify({ success: false, message: 'uid wajib diisi' }), { status: 400 })
    }
    const uid = Number(String(uidRaw).trim())
    if (!Number.isFinite(uid)) {
      return corsResponse(JSON.stringify({ success: false, message: 'uid harus berupa angka' }), { status: 400 })
    }

    const payload = { action, uid }

    const upstream = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const text = await upstream.text()

    return corsResponse(text, { status: upstream.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return corsResponse(JSON.stringify({ success: false, message }), { status: 500 })
  }
})