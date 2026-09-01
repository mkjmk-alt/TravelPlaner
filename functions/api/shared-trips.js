const MAX_BODY_BYTES = 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }
});

const getServiceHeaders = (adminKey) => {
  const headers = {
    apikey: adminKey,
    "content-type": "application/json"
  };

  if (!adminKey.startsWith("sb_secret_")) {
    headers.authorization = `Bearer ${adminKey}`;
  }

  return headers;
};

const getConfiguration = (env) => ({
  supabaseUrl: env.VITE_SUPABASE_URL || "",
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || "",
  adminKey: env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ""
});

const getBearerToken = (request) => {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
};

const rejectCrossOriginWrite = (request) => {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin !== new URL(request.url).origin);
};

const readTripData = async (request) => {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { error: jsonResponse({ error: { message: "공유 일정 데이터가 너무 큽니다." } }, 413) };
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return { error: jsonResponse({ error: { message: "공유 일정 데이터가 너무 큽니다." } }, 413) };
  }

  try {
    const body = JSON.parse(rawBody);
    if (!body?.trip_data || typeof body.trip_data !== "object" || Array.isArray(body.trip_data)) {
      return { error: jsonResponse({ error: { message: "올바른 공유 일정 데이터가 필요합니다." } }, 400) };
    }
    return { tripData: body.trip_data };
  } catch {
    return { error: jsonResponse({ error: { message: "요청 본문이 올바른 JSON이 아닙니다." } }, 400) };
  }
};

const getTripId = (request) => {
  const id = new URL(request.url).searchParams.get("id")?.trim() || "";
  return UUID_PATTERN.test(id) ? id : "";
};

const getTripRestUrl = (supabaseUrl, id = "") => {
  const url = new URL("/rest/v1/shared_trips", supabaseUrl);
  if (id) url.searchParams.set("id", `eq.${id}`);
  url.searchParams.set("select", "id,trip_data,updated_at");
  if (id) url.searchParams.set("limit", "1");
  return url;
};

const parseTripResponse = async (response) => {
  if (!response.ok) throw new Error("Supabase shared trip request failed");
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
};

const verifyOptionalUser = async (request, supabaseUrl, supabaseAnonKey) => {
  const accessToken = getBearerToken(request);
  if (!accessToken) return { userId: null };

  const response = await fetch(new URL("/auth/v1/user", supabaseUrl), {
    headers: {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) return { error: jsonResponse({ error: { message: "로그인 세션이 만료되었습니다." } }, 401) };

  const user = await response.json();
  if (!user?.id) return { error: jsonResponse({ error: { message: "계정 정보를 확인하지 못했습니다." } }, 401) };
  return { userId: user.id };
};

export async function onRequestGet({ request, env }) {
  const { supabaseUrl, adminKey } = getConfiguration(env);
  if (!supabaseUrl || !adminKey) {
    return jsonResponse({ error: { message: "공유 일정 서비스가 아직 설정되지 않았습니다." } }, 503);
  }

  const id = getTripId(request);
  if (!id) return jsonResponse({ error: { message: "올바른 공유 코드가 필요합니다." } }, 400);

  try {
    const trip = await parseTripResponse(await fetch(getTripRestUrl(supabaseUrl, id), {
      headers: getServiceHeaders(adminKey)
    }));
    if (!trip) return jsonResponse({ error: { message: "공유 일정을 찾을 수 없습니다." } }, 404);
    return jsonResponse({ trip });
  } catch (error) {
    console.error("Shared trip lookup failed", error);
    return jsonResponse({ error: { message: "공유 일정을 불러오지 못했습니다." } }, 502);
  }
}

export async function onRequestPost({ request, env }) {
  const { supabaseUrl, supabaseAnonKey, adminKey } = getConfiguration(env);
  if (!supabaseUrl || !supabaseAnonKey || !adminKey) {
    return jsonResponse({ error: { message: "공유 일정 서비스가 아직 설정되지 않았습니다." } }, 503);
  }
  if (rejectCrossOriginWrite(request)) {
    return jsonResponse({ error: { message: "허용되지 않은 출처의 요청입니다." } }, 403);
  }

  const { tripData, error: bodyError } = await readTripData(request);
  if (bodyError) return bodyError;

  const { userId, error: authError } = await verifyOptionalUser(request, supabaseUrl, supabaseAnonKey);
  if (authError) return authError;

  try {
    const trip = await parseTripResponse(await fetch(getTripRestUrl(supabaseUrl), {
      method: "POST",
      headers: {
        ...getServiceHeaders(adminKey),
        prefer: "return=representation"
      },
      body: JSON.stringify({ trip_data: tripData, owner_id: userId })
    }));
    if (!trip) throw new Error("Supabase returned no shared trip");
    return jsonResponse({ trip }, 201);
  } catch (error) {
    console.error("Shared trip creation failed", error);
    return jsonResponse({ error: { message: "공유 일정을 만들지 못했습니다." } }, 502);
  }
}

export async function onRequestPatch({ request, env }) {
  const { supabaseUrl, adminKey } = getConfiguration(env);
  if (!supabaseUrl || !adminKey) {
    return jsonResponse({ error: { message: "공유 일정 서비스가 아직 설정되지 않았습니다." } }, 503);
  }
  if (rejectCrossOriginWrite(request)) {
    return jsonResponse({ error: { message: "허용되지 않은 출처의 요청입니다." } }, 403);
  }

  const id = getTripId(request);
  if (!id) return jsonResponse({ error: { message: "올바른 공유 코드가 필요합니다." } }, 400);

  const { tripData, error: bodyError } = await readTripData(request);
  if (bodyError) return bodyError;

  try {
    const trip = await parseTripResponse(await fetch(getTripRestUrl(supabaseUrl, id), {
      method: "PATCH",
      headers: {
        ...getServiceHeaders(adminKey),
        prefer: "return=representation"
      },
      body: JSON.stringify({ trip_data: tripData })
    }));
    if (!trip) return jsonResponse({ error: { message: "공유 일정을 찾을 수 없습니다." } }, 404);
    return jsonResponse({ trip });
  } catch (error) {
    console.error("Shared trip update failed", error);
    return jsonResponse({ error: { message: "공유 일정을 저장하지 못했습니다." } }, 502);
  }
}

export function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return jsonResponse({ error: { message: "GET, POST, PATCH 요청만 허용됩니다." } }, 405);
}
