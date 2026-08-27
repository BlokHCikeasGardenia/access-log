// Supabase Edge Function: proxy to the external gate log API.
//
// The external API (https://cek.goepoet.com/log_gate.php) does NOT send CORS
// headers, so a browser on GitHub Pages cannot call it directly. This function
// calls it server-side and relays the JSON back with the correct CORS headers.
//
// verify_jwt = true (see supabase/config.toml) means only authenticated users
// (those holding a valid Supabase JWT) may call this endpoint.

// Define CORS headers for the browser response.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const API_BASE = 'https://cek.goepoet.com/log_gate.php'

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

  // Only allow GET.
  if (req.method !== 'GET') {
    return corsResponse(JSON.stringify({ success: false, message: 'Method not allowed' }), { status: 405 })
  }

  try {
    const url = new URL(req.url)
    const tanggalAwal = url.searchParams.get('tanggal_awal') || ''
    const tanggalAkhir = url.searchParams.get('tanggal_akhir') || ''

    // Forward the date range to the external API.
    const target = new URL(API_BASE)
    if (tanggalAwal) target.searchParams.set('tanggal_awal', tanggalAwal)
    if (tanggalAkhir) target.searchParams.set('tanggal_akhir', tanggalAkhir)

    const upstream = await fetch(target.toString())
    const text = await upstream.text()

    return corsResponse(text, { status: upstream.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return corsResponse(JSON.stringify({ success: false, message }), { status: 500 })
  }
})
