const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }
});

const methodNotAllowed = () => jsonResponse({ error: { message: "POST 요청만 허용됩니다." } }, 405);

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) {
    return jsonResponse({ error: { message: "AI 기능이 아직 설정되지 않았습니다. Cloudflare Pages에 GEMINI_API_KEY를 등록해 주세요." } }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: { message: "AI 요청 형식이 올바르지 않습니다." } }, 400);
  }

  if (!Array.isArray(body?.contents) || body.contents.length === 0) {
    return jsonResponse({ error: { message: "AI 요청 내용이 없습니다." } }, 400);
  }

  try {
    const upstream = await fetch("https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-lite:generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: body.contents })
    });
    const responseText = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = { error: { message: "AI 서버가 올바른 응답을 반환하지 않았습니다." } };
    }
    return jsonResponse(payload, upstream.status);
  } catch (error) {
    console.error("Gemini proxy failed", error);
    return jsonResponse({ error: { message: "AI 서버에 연결할 수 없습니다." } }, 502);
  }
}

export function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return methodNotAllowed();
}
