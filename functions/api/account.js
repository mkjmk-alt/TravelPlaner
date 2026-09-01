const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }
});

const getBearerToken = (request) => {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
};

const getServiceHeaders = (adminKey) => {
  const headers = {
    apikey: adminKey,
    "content-type": "application/json"
  };

  // Supabase's new sb_secret keys are opaque API keys, not JWTs. Legacy
  // service_role keys still need the Bearer header for direct REST/Auth calls.
  if (!adminKey.startsWith("sb_secret_")) {
    headers.authorization = `Bearer ${adminKey}`;
  }

  return headers;
};

const deleteRestRows = async (supabaseUrl, table, filterName, filterValue, adminKey) => {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  url.searchParams.set(filterName, `eq.${filterValue}`);
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      ...getServiceHeaders(adminKey),
      prefer: "return=minimal"
    }
  });
  if (!response.ok) throw new Error(`${table} 삭제 실패`);
};

export async function onRequestDelete({ request, env }) {
  const supabaseUrl = env.VITE_SUPABASE_URL || "";
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || "";
  const adminKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !supabaseAnonKey || !adminKey) {
    return jsonResponse({ error: { message: "계정 삭제 서비스가 아직 설정되지 않았습니다." } }, 503);
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) return jsonResponse({ error: { message: "로그인이 필요합니다." } }, 401);

  const userResponse = await fetch(new URL("/auth/v1/user", supabaseUrl), {
    headers: {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!userResponse.ok) return jsonResponse({ error: { message: "로그인 세션이 만료되었습니다." } }, 401);

  const user = await userResponse.json();
  if (!user?.id) return jsonResponse({ error: { message: "계정 정보를 확인하지 못했습니다." } }, 401);

  try {
    await deleteRestRows(supabaseUrl, "shared_trips", "owner_id", user.id, adminKey);
    await deleteRestRows(supabaseUrl, "user_state", "user_id", user.id, adminKey);

    const authResponse = await fetch(new URL(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, supabaseUrl), {
      method: "DELETE",
      headers: getServiceHeaders(adminKey)
    });
    if (!authResponse.ok) throw new Error("인증 계정 삭제 실패");

    return jsonResponse({ deleted: true });
  } catch (error) {
    console.error("Account deletion failed", error);
    return jsonResponse({ error: { message: "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요." } }, 502);
  }
}

export function onRequest(context) {
  if (context.request.method === "DELETE") return onRequestDelete(context);
  return jsonResponse({ error: { message: "DELETE 요청만 허용됩니다." } }, 405);
}
