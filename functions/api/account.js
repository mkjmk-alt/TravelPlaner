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

const listUserMediaPaths = async (supabaseUrl, userId, adminKey) => {
  const directories = [userId];
  const paths = [];

  for (let directoryIndex = 0; directoryIndex < directories.length; directoryIndex += 1) {
    const prefix = directories[directoryIndex];
    let offset = 0;
    while (true) {
      const response = await fetch(new URL('/storage/v1/object/list/trip-media', supabaseUrl), {
        method: 'POST',
        headers: getServiceHeaders(adminKey),
        body: JSON.stringify({
          prefix,
          limit: 1000,
          offset,
          sortBy: { column: 'name', order: 'asc' }
        })
      });
      if (!response.ok) throw new Error('사용자 미디어 목록 조회 실패');
      const entries = await response.json();
      if (!Array.isArray(entries)) throw new Error('사용자 미디어 목록 응답이 올바르지 않습니다.');

      for (const entry of entries) {
        const name = typeof entry?.name === 'string' ? entry.name : '';
        if (!name || name === '.' || name === '..' || name.includes('/')) {
          throw new Error('사용자 미디어 경로가 올바르지 않습니다.');
        }

        const path = `${prefix}/${name}`;
        if (entry.id == null && entry.metadata == null) directories.push(path);
        else if (path.startsWith(`${userId}/`)) paths.push(path);
      }

      if (entries.length < 1000) break;
      offset += entries.length;
    }
  }

  return paths;
};

const deleteUserMedia = async (supabaseUrl, userId, adminKey) => {
  const paths = await listUserMediaPaths(supabaseUrl, userId, adminKey);
  for (let index = 0; index < paths.length; index += 1000) {
    const response = await fetch(new URL('/storage/v1/object/trip-media', supabaseUrl), {
      method: 'DELETE',
      headers: getServiceHeaders(adminKey),
      body: JSON.stringify({ prefixes: paths.slice(index, index + 1000) })
    });
    if (!response.ok) throw new Error('사용자 미디어 삭제 실패');
  }
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
    await deleteRestRows(supabaseUrl, "user_sync_records", "user_id", user.id, adminKey);
    await deleteRestRows(supabaseUrl, "sync_operation_receipts", "user_id", user.id, adminKey);
    await deleteUserMedia(supabaseUrl, user.id, adminKey);

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
