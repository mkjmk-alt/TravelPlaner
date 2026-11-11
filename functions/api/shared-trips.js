const MAX_BODY_BYTES = 1024 * 1024;
const MAX_OPERATION_BODY_BYTES = 4096;
const MAX_MANAGEMENT_TOKEN_LENGTH = 256;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_TRIP_COLUMNS = "id,trip_data,updated_at,revision,deleted_at";
const MANAGED_TRIP_COLUMNS = "id,owner_id,management_token_hash,revision,deleted_at";

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

const createManagementToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const hashManagementToken = async (token) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
};

const getManagementToken = (request) => {
  const token = request.headers.get("x-travelplaner-management-token")?.trim() || "";
  return token.length <= MAX_MANAGEMENT_TOKEN_LENGTH ? token : "";
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
    const hasExpectedRevision = Object.hasOwn(body, 'expected_revision');
    const hasOperationId = Object.hasOwn(body, 'operation_id');
    if (hasExpectedRevision !== hasOperationId) {
      return { error: jsonResponse({ error: { message: "revision과 operation ID를 함께 전달해주세요." } }, 400) };
    }
    if (hasExpectedRevision && (!Number.isSafeInteger(body.expected_revision)
      || body.expected_revision < 1 || !UUID_PATTERN.test(body.operation_id))) {
      return { error: jsonResponse({ error: { message: "공유 일정 변경 정보가 올바르지 않습니다." } }, 400) };
    }
    return {
      tripData: body.trip_data,
      expectedRevision: hasExpectedRevision ? body.expected_revision : null,
      operationId: hasOperationId ? body.operation_id : null
    };
  } catch {
    return { error: jsonResponse({ error: { message: "요청 본문이 올바른 JSON이 아닙니다." } }, 400) };
  }
};

const getTripId = (request) => {
  const id = new URL(request.url).searchParams.get("id")?.trim() || "";
  return UUID_PATTERN.test(id) ? id : "";
};

const getTripRestUrl = (supabaseUrl, id = "", columns = PUBLIC_TRIP_COLUMNS, { includeDeleted = false } = {}) => {
  const url = new URL("/rest/v1/shared_trips", supabaseUrl);
  if (id) url.searchParams.set("id", `eq.${id}`);
  url.searchParams.set("select", columns);
  if (id) url.searchParams.set("limit", "1");
  if (!includeDeleted) url.searchParams.set('deleted_at', 'is.null');
  return url;
};

const readDeleteOperation = async (request) => {
  const rawBody = await request.text();
  if (!rawBody.trim()) return { operation: null };
  if (new TextEncoder().encode(rawBody).byteLength > MAX_OPERATION_BODY_BYTES) {
    return { error: jsonResponse({ error: { message: "공유 일정 작업 정보가 너무 큽니다." } }, 413) };
  }
  try {
    const body = JSON.parse(rawBody);
    if (!Number.isSafeInteger(body?.expected_revision) || body.expected_revision < 1
      || !UUID_PATTERN.test(body?.operation_id || '')) {
      return { error: jsonResponse({ error: { message: "공유 일정 삭제 정보가 올바르지 않습니다." } }, 400) };
    }
    return { operation: { expectedRevision: body.expected_revision, operationId: body.operation_id } };
  } catch {
    return { error: jsonResponse({ error: { message: "요청 본문이 올바른 JSON이 아닙니다." } }, 400) };
  }
};

const canManageTrip = async (request, managedTrip, supabaseUrl, supabaseAnonKey) => {
  const { userId, error } = await verifyOptionalUser(request, supabaseUrl, supabaseAnonKey);
  if (error) return { error };
  const managementToken = getManagementToken(request);
  const suppliedTokenHash = managementToken ? await hashManagementToken(managementToken) : '';
  const isAuthenticatedOwner = Boolean(managedTrip.owner_id && userId === managedTrip.owner_id);
  const hasManagementToken = Boolean(
    managedTrip.management_token_hash && suppliedTokenHash === managedTrip.management_token_hash
  );
  return { allowed: isAuthenticatedOwner || hasManagementToken };
};

const applySharedTripOperation = async ({ supabaseUrl, adminKey, tripId, expectedRevision, operationId, operationType, tripData }) => {
  const response = await fetch(new URL('/rest/v1/rpc/apply_shared_trip_operation', supabaseUrl), {
    method: 'POST',
    headers: {
      ...getServiceHeaders(adminKey),
      accept: 'application/json'
    },
    body: JSON.stringify({
      p_trip_id: tripId,
      p_expected_revision: expectedRevision,
      p_operation_id: operationId,
      p_operation_type: operationType,
      p_trip_data: tripData
    })
  });
  if (!response.ok) throw new Error('Supabase shared trip operation failed');
  return response.json();
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
    if (trip.deleted_at) return jsonResponse({ error: { message: "공유 일정을 찾을 수 없습니다." } }, 404);
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
    const managementToken = createManagementToken();
    const managementTokenHash = await hashManagementToken(managementToken);
    const trip = await parseTripResponse(await fetch(getTripRestUrl(supabaseUrl, '', PUBLIC_TRIP_COLUMNS, { includeDeleted: true }), {
      method: "POST",
      headers: {
        ...getServiceHeaders(adminKey),
        prefer: "return=representation"
      },
      body: JSON.stringify({
        trip_data: tripData,
        owner_id: userId,
        management_token_hash: managementTokenHash
      })
    }));
    if (!trip) throw new Error("Supabase returned no shared trip");
    return jsonResponse({ trip, management_token: managementToken }, 201);
  } catch (error) {
    console.error("Shared trip creation failed", error);
    return jsonResponse({ error: { message: "공유 일정을 만들지 못했습니다." } }, 502);
  }
}

export async function onRequestPatch({ request, env }) {
  const { supabaseUrl, supabaseAnonKey, adminKey } = getConfiguration(env);
  if (!supabaseUrl || !adminKey) {
    return jsonResponse({ error: { message: "공유 일정 서비스가 아직 설정되지 않았습니다." } }, 503);
  }
  if (rejectCrossOriginWrite(request)) {
    return jsonResponse({ error: { message: "허용되지 않은 출처의 요청입니다." } }, 403);
  }

  const id = getTripId(request);
  if (!id) return jsonResponse({ error: { message: "올바른 공유 코드가 필요합니다." } }, 400);

  const { tripData, expectedRevision, operationId, error: bodyError } = await readTripData(request);
  if (bodyError) return bodyError;

  if (operationId) {
    try {
      const managedTrip = await parseTripResponse(await fetch(
        getTripRestUrl(supabaseUrl, id, MANAGED_TRIP_COLUMNS, { includeDeleted: true }),
        { headers: getServiceHeaders(adminKey) }
      ));
      if (!managedTrip) return jsonResponse({ error: { message: "공유 일정을 찾을 수 없습니다." } }, 404);
      const { allowed, error: authError } = await canManageTrip(request, managedTrip, supabaseUrl, supabaseAnonKey);
      if (authError) return authError;
      if (!allowed) return jsonResponse({ error: { message: "공유 일정을 수정할 권한이 없습니다." } }, 403);

      const result = await applySharedTripOperation({
        supabaseUrl,
        adminKey,
        tripId: id,
        expectedRevision,
        operationId,
        operationType: 'update',
        tripData
      });
      if (result?.status === 'conflict') {
        return jsonResponse({ status: 'conflict', trip: result.trip || null }, 409);
      }
      if (!['applied', 'replayed'].includes(result?.status) || !result?.trip?.id) {
        throw new Error('Supabase returned an invalid shared trip result');
      }
      return jsonResponse({ status: result.status, trip: result.trip });
    } catch (error) {
      console.error("Shared trip update failed", error);
      return jsonResponse({ error: { message: "공유 일정을 저장하지 못했습니다." } }, 502);
    }
  }

  try {
    const managedTrip = await parseTripResponse(await fetch(
      getTripRestUrl(supabaseUrl, id, MANAGED_TRIP_COLUMNS, { includeDeleted: true }),
      { headers: getServiceHeaders(adminKey) }
    ));
    if (!managedTrip || managedTrip.deleted_at) {
      return jsonResponse({ error: { message: "공유 일정을 찾을 수 없습니다." } }, 404);
    }
    const { allowed, error: authError } = await canManageTrip(request, managedTrip, supabaseUrl, supabaseAnonKey);
    if (authError) return authError;
    if (!allowed) return jsonResponse({ error: { message: "공유 일정을 수정할 권한이 없습니다." } }, 403);

    const result = await applySharedTripOperation({
      supabaseUrl,
      adminKey,
      tripId: id,
      expectedRevision: managedTrip.revision,
      operationId: crypto.randomUUID(),
      operationType: 'update',
      tripData
    });
    if (result?.status === 'conflict') {
      return jsonResponse({ status: 'conflict', trip: result.trip || null }, 409);
    }
    if (!['applied', 'replayed'].includes(result?.status) || !result?.trip?.id) {
      throw new Error('Supabase returned an invalid shared trip result');
    }
    return jsonResponse({ status: result.status, trip: result.trip });
  } catch (error) {
    console.error("Shared trip update failed", error);
    return jsonResponse({ error: { message: "공유 일정을 저장하지 못했습니다." } }, 502);
  }
}

export async function onRequestDelete({ request, env }) {
  const { supabaseUrl, supabaseAnonKey, adminKey } = getConfiguration(env);
  if (!supabaseUrl || !supabaseAnonKey || !adminKey) {
    return jsonResponse({ error: { message: "공유 일정 서비스가 아직 설정되지 않았습니다." } }, 503);
  }
  if (rejectCrossOriginWrite(request)) {
    return jsonResponse({ error: { message: "허용되지 않은 출처의 요청입니다." } }, 403);
  }

  const id = getTripId(request);
  if (!id) return jsonResponse({ error: { message: "올바른 공유 코드가 필요합니다." } }, 400);

  const { operation, error: operationError } = await readDeleteOperation(request);
  if (operationError) return operationError;

  try {
    const managedTrip = await parseTripResponse(await fetch(
      getTripRestUrl(supabaseUrl, id, MANAGED_TRIP_COLUMNS, { includeDeleted: true }),
      { headers: getServiceHeaders(adminKey) }
    ));
    if (!managedTrip) return jsonResponse({ error: { message: "공유 일정을 찾을 수 없습니다." } }, 404);

    const { allowed, error: authError } = await canManageTrip(request, managedTrip, supabaseUrl, supabaseAnonKey);
    if (authError) return authError;
    if (!allowed) {
      return jsonResponse({ error: { message: "공유를 해제할 권한이 없습니다." } }, 403);
    }

    if (managedTrip.deleted_at && !operation) {
      return jsonResponse({ deleted: true, id: managedTrip.id, revision: managedTrip.revision, alreadyDeleted: true });
    }

    const result = await applySharedTripOperation({
      supabaseUrl,
      adminKey,
      tripId: id,
      expectedRevision: operation?.expectedRevision ?? managedTrip.revision,
      operationId: operation?.operationId ?? crypto.randomUUID(),
      operationType: 'delete',
      tripData: null
    });
    if (result?.status === 'conflict') {
      if (result.trip?.deleted_at && !operation) {
        return jsonResponse({ deleted: true, id, revision: result.trip.revision, alreadyDeleted: true });
      }
      return jsonResponse({ status: 'conflict', trip: result.trip || null }, 409);
    }
    if (!['applied', 'replayed'].includes(result?.status) || !result?.trip?.id) {
      throw new Error('Supabase returned an invalid shared trip result');
    }
    return jsonResponse({ deleted: true, id: result.trip.id, revision: result.trip.revision, status: result.status });
  } catch (error) {
    console.error("Shared trip deletion failed", error);
    return jsonResponse({ error: { message: "공유를 해제하지 못했습니다." } }, 502);
  }
}

export function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "PATCH") return onRequestPatch(context);
  if (context.request.method === "DELETE") return onRequestDelete(context);
  return jsonResponse({ error: { message: "GET, POST, PATCH, DELETE 요청만 허용됩니다." } }, 405);
}
