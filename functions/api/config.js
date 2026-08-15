const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }
});

export function onRequestGet({ env }) {
  return jsonResponse({
    googleMapsApiKey: env.VITE_GOOGLE_MAPS_API_KEY || "",
    supabaseUrl: env.VITE_SUPABASE_URL || "",
    supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || ""
  });
}

export function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return jsonResponse({ error: { message: "GET 요청만 허용됩니다." } }, 405);
}
