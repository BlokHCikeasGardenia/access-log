// Supabase Edge Function: proxy to the external card list API.
//
// The external API (https://cek.goepoet.com/card-list.php) does NOT send CORS
// headers, so a browser on GitHub Pages cannot call it directly. This function
// calls it server-side and relays the JSON back with the correct CORS headers.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const API_URL = 'https://cek.goepoet.com/card-list.php'

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return corsResponse(JSON.stringify({ success: false, message: 'Method not allowed' }), { status: 405 })
  }

  try {
    const upstream = await fetch(API_URL)
    const text = await upstream.text()
    return corsResponse(text, { status: upstream.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return corsResponse(JSON.stringify({ success: false, message }), { status: 500 })
  }
})
