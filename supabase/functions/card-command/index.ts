// Supabase Edge Function: proxy to the external gate card-command API.
//
// The external API (https://cek.goepoet.com/card-command.php) does not send
// CORS headers, so a browser on GitHub Pages cannot call it directly. This
// function validates the payload server-side, then forwards it to the gate.
//
// Payload contract (confirmed with the gate provider):
//   { "action": "ADD" | "UPDATE" | "DELETE", "uid": 12345678, "blok": "H", "no_rumah": "25" }
//
// verify_jwt = true (see supabase/config.toml) means only authenticated users
// may call this endpoint.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const API_URL = 'https://cek.goepoet.com/card-command.php'

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

    // Payload exactly as confirmed with the gate provider. The reader system
    // treats uid and raw_id as the same key (uid = raw_id).
    const payload = {
      action,
      uid,
      blok: String(body.blok ?? ''),
      no_rumah: String(body.no_rumah ?? ''),
    }

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