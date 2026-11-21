const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'cache-control': 'no-store' }
});

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const readLimit = (value, fallback) => value == null ? fallback
  : /^\d{1,7}$/.test(value) ? Number(value) : 0;

const validPoint = point => Number.isFinite(point?.lat) && Math.abs(point.lat) <= 90
  && Number.isFinite(point?.lng) && Math.abs(point.lng) <= 180;

function decodePolyline(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 500_000) return [];
  const path = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const nextDelta = () => {
    let result = 0;
    for (let shift = 0; shift <= 25 && index < encoded.length; shift += 5) {
      const chunk = encoded.charCodeAt(index++) - 63;
      if (chunk < 0 || chunk > 63) break;
      result |= (chunk & 31) << shift;
      if (chunk < 32) return (result & 1) ? ~(result >> 1) : result >> 1;
    }
    throw new Error('Invalid polyline');
  };
  while (index < encoded.length) {
    lat += nextDelta();
    lng += nextDelta();
    const point = { lat: lat / 1e5, lng: lng / 1e5 };
    if (!validPoint(point)) return [];
    path.push(point);
  }
  return path;
}

export async function handleRoadRoutes({ request, env }, fetcher = fetch) {
  const { method } = request;
  if (!['GET', 'PATCH', 'POST'].includes(method)) return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return json({ code: 'LOGIN_REQUIRED' }, 401);
  const supabaseURL = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const routesKey = env.TRIPPLOT_ROUTES_SERVER_KEY;
  if (!supabaseURL || !anonKey || !serviceKey || (method === 'POST' && !routesKey)) return json({ code: 'UNAVAILABLE' }, 503);

  const body = method === 'GET' ? null : await request.json().catch(() => null);
  if (method === 'PATCH' && !['free', 'pro'].includes(body?.plan)) return json({ code: 'INVALID_PLAN' }, 400);
  if (method === 'POST' && (!validPoint(body?.origin) || !validPoint(body?.destination)
    || !['WALKING', 'DRIVING'].includes(body?.travelMode)
    || (body.origin.lat === body.destination.lat && body.origin.lng === body.destination.lng))) {
    return json({ code: 'INVALID_ARGUMENT' }, 400);
  }

  try {
    const userResponse = await fetcher(new URL('/auth/v1/user', supabaseURL), {
      headers: { apikey: anonKey, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000)
    });
    if (!userResponse.ok) return userResponse.status < 500
      ? json({ code: 'LOGIN_REQUIRED' }, 401) : json({ code: 'UNAVAILABLE' }, 503);
    const { id } = await userResponse.json();
    if (!uuid.test(id)) return json({ code: 'LOGIN_REQUIRED' }, 401);
    const canTest = id.toLowerCase() === env.TRIPPLOT_PURCHASE_TEST_USER_ID?.trim().toLowerCase();
    if (method === 'PATCH' && !canTest) return json({ code: 'FORBIDDEN' }, 403);

    const quota = await fetcher(new URL('/rest/v1/rpc/tripplot_road_route_usage', supabaseURL), {
      method: 'POST',
      headers: {
        apikey: serviceKey, 'content-type': 'application/json',
        ...(serviceKey.startsWith('sb_secret_') ? {} : { authorization: `Bearer ${serviceKey}` })
      },
      body: JSON.stringify({
        p_user_id: id, p_can_test: canTest, p_test_plan: method === 'PATCH' ? body.plan : null,
        p_consume: method === 'POST', p_free_limit: readLimit(env.TRIPPLOT_ROUTES_FREE_LIMIT, 20),
        p_test_pro_limit: readLimit(env.TRIPPLOT_ROUTES_TEST_PRO_LIMIT, 100),
        p_service_limit: readLimit(env.TRIPPLOT_ROUTES_MONTHLY_LIMIT, 8000)
      }),
      signal: AbortSignal.timeout(5000)
    });
    if (!quota.ok) return json({ code: 'UNAVAILABLE' }, 503);
    const usage = await quota.json();
    if (usage?.allowed === false && ['ACCOUNT_LIMIT', 'SERVICE_LIMIT'].includes(usage.code)) {
      return json(usage, 429);
    }
    if (usage?.allowed !== true) return json({ code: 'UNAVAILABLE' }, 503);
    if (method !== 'POST') return json(usage);

    const waypoint = ({ lat, lng }) => ({ location: { latLng: { latitude: lat, longitude: lng } } });
    // Once sent, even a timeout may have reached Google. Keep the reservation.
    const response = await fetcher(new URL('https://routes.googleapis.com/directions/v2:computeRoutes'), {
      method: 'POST',
      headers: {
        'X-Goog-Api-Key': routesKey, 'X-Goog-FieldMask': 'routes.polyline.encodedPolyline,routes.warnings',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        origin: waypoint(body.origin), destination: waypoint(body.destination),
        travelMode: body.travelMode === 'WALKING' ? 'WALK' : 'DRIVE',
        polylineQuality: 'HIGH_QUALITY'
      }),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) return json({ code: response.status === 429 ? 'SERVICE_LIMIT' : 'UNAVAILABLE' }, response.status === 429 ? 429 : 502);
    const route = (await response.json()).routes?.[0];
    const path = decodePolyline(route?.polyline?.encodedPolyline);
    if (path.length < 2) return json({ code: 'NO_ROUTE' }, 404);
    return json({ path, warnings: route.warnings || [] });
  } catch {
    return json({ code: 'UNAVAILABLE' }, 503);
  }
}

export const onRequest = context => handleRoadRoutes(context);
