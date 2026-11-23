const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const designator = /^(?:[A-Z]{3}|[A-Z][A-Z0-9]|[0-9][A-Z])[0-9]{1,4}[A-Z]?$/;
const calendarDate = /^\d{4}-\d{2}-\d{2}$/;
const timestamp = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const hour = 60 * 60 * 1000;
const day = 24 * hour;

const json = (data, status = 200, headers = {}) => Response.json(data, {
  status, headers: { 'cache-control': 'no-store', ...headers }
});
const error = (code, status, headers) => json({ code }, status, headers);
const unavailable = () => error('UNAVAILABLE', 503);
const limit = value => /^[1-9]\d{0,6}$/.test(value) ? Number(value) : 0;
const nonempty = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const providerOrigin = 'https://aeroapi.flightaware.com/aeroapi';

function utcMidnight(date) {
  if (!calendarDate.test(date)) return NaN;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? time : NaN;
}

function isoTime(value) {
  if (typeof value !== 'string' || !timestamp.test(value) || !Number.isFinite(utcMidnight(value.slice(0, 10)))) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function flightLookupURL(number, date, now) {
  const midnight = utcMidnight(date);
  // Cover the local departure day across UTC+14 through UTC-12. Leave a minute
  // at the AeroAPI bounds for clock skew and quota reservation latency.
  const start = Math.max(midnight - 14 * hour, now - 10 * day + 60_000);
  const end = Math.min(midnight + 36 * hour, now + 2 * day - 60_000);
  if (!(start < end)) return null;
  const url = new URL(`${providerOrigin}/flights/${number}`);
  url.search = new URLSearchParams({
    ident_type: 'designator', start: new Date(start).toISOString(),
    end: new Date(end).toISOString(), max_pages: '1'
  });
  return url;
}

function matchesNumber(flight, number) {
  if (!flight || flight.blocked === true || flight.type === 'General_Aviation') return false;
  return flight.ident_iata === number || flight.ident_icao === number
    || (flight.type === 'Airline' && flight.ident === number)
    || [flight.codeshares_iata, flight.codeshares].some(codes => Array.isArray(codes) && codes.includes(number));
}

function localDate(departure, timeZone) {
  if (!departure || !timeZone) return null;
  const parts = new Intl.DateTimeFormat('en', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(departure));
  const { year, month, day } = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${year}-${month}-${day}`;
}

function selectFlight(payload, number, date, now) {
  // A second page could contain another matching leg. Keep the one-page spend cap.
  if (!Array.isArray(payload?.flights) || !(payload.links === null || payload.links?.next === null)) return unavailable();
  const matches = [];
  for (const flight of payload.flights) {
    if (!matchesNumber(flight, number)) continue;
    const departureDate = localDate(isoTime(flight.scheduled_out ?? flight.scheduled_off), flight.origin?.timezone);
    if (!departureDate) return unavailable();
    if (departureDate === date) matches.push(flight);
  }
  if (matches.length === 0) return error('NOT_FOUND', 404);

  let [flight] = matches;
  if (matches.length > 1) {
    // FlightAware can return the original and diverted destinations under one ID.
    // Keep the original leg's fields together and decline other ambiguous matches.
    const originals = matches.filter(candidate => candidate.diverted === true);
    if (originals.length !== 1 || !flight.fa_flight_id
      || !matches.every(candidate => candidate.fa_flight_id === flight.fa_flight_id)) {
      return error('AMBIGUOUS_FLIGHT', 409);
    }
    [flight] = originals;
  }
  const status = nonempty(flight.status);
  if (!status || typeof flight.cancelled !== 'boolean' || typeof flight.diverted !== 'boolean') return unavailable();
  return json({
    number, date, status,
    scheduledDeparture: isoTime(flight.scheduled_out),
    estimatedDeparture: isoTime(flight.estimated_out),
    actualDeparture: isoTime(flight.actual_out),
    scheduledArrival: isoTime(flight.scheduled_in),
    estimatedArrival: isoTime(flight.estimated_in),
    actualArrival: isoTime(flight.actual_in),
    departureGate: nonempty(flight.gate_origin),
    arrivalGate: nonempty(flight.gate_destination),
    cancelled: flight.cancelled,
    diverted: flight.diverted,
    updatedAt: new Date(now()).toISOString()
  });
}

export async function handleFlightStatus({ request, env }, fetcher = fetch, now = Date.now) {
  if (request.method !== 'GET') return error('METHOD_NOT_ALLOWED', 405, { allow: 'GET' });
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return error('LOGIN_REQUIRED', 401);

  const supabaseURL = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseURL || !anonKey) return unavailable();

  try {
    const user = await fetcher(new URL('/auth/v1/user', supabaseURL), {
      headers: { apikey: anonKey, authorization: `Bearer ${token}` },
      redirect: 'error', signal: AbortSignal.timeout(5000)
    });
    if (!user.ok) return user.status < 500 ? error('LOGIN_REQUIRED', 401) : unavailable();
    const { id } = await user.json();
    if (!uuid.test(id)) return error('LOGIN_REQUIRED', 401);

    const params = new URL(request.url).searchParams;
    const number = params.get('number')?.trim().toUpperCase() ?? '';
    const date = params.get('date');
    if (params.getAll('number').length !== 1 || params.getAll('date').length !== 1
        || !designator.test(number) || params.has('purpose')) {
      return error('INVALID_ARGUMENT', 400);
    }
    const url = flightLookupURL(number, date, now());
    if (!url) return error('INVALID_ARGUMENT', 400);

    const providerKey = nonempty(env.TRIPPLOT_FLIGHTAWARE_API_KEY);
    const serviceKey = nonempty(env.SUPABASE_SECRET_KEY) || nonempty(env.SUPABASE_SERVICE_ROLE_KEY);
    const accountLimit = limit(env.TRIPPLOT_FLIGHT_STATUS_ACCOUNT_MONTHLY_LIMIT);
    const globalLimit = limit(env.TRIPPLOT_FLIGHT_STATUS_GLOBAL_MONTHLY_LIMIT);
    if (!providerKey || !serviceKey || !accountLimit || !globalLimit) return unavailable();

    const quota = await fetcher(new URL('/rest/v1/rpc/tripplot_reserve_flight_status', supabaseURL), {
      method: 'POST',
      headers: {
        apikey: serviceKey, 'content-type': 'application/json',
        ...(serviceKey.startsWith('sb_secret_') ? {} : { authorization: `Bearer ${serviceKey}` })
      },
      body: JSON.stringify({
        p_user_id: id, p_number: number, p_date: date, p_account_limit: accountLimit, p_global_limit: globalLimit
      }),
      redirect: 'error', signal: AbortSignal.timeout(5000)
    });
    if (!quota.ok) return unavailable();
    const decision = await quota.json();
    if (decision?.allowed === false) {
      if (decision.reason === 'DUPLICATE') return error('RATE_LIMIT', 429, { 'retry-after': '30' });
      if (['ACCOUNT_LIMIT', 'GLOBAL_LIMIT'].includes(decision.reason)) return error('RATE_LIMIT', 429);
    }
    if (decision?.allowed !== true) return unavailable();

    // A timeout may still be billable. Keep the reservation and make no retries.
    const provider = await fetcher(url, {
      headers: { 'x-apikey': providerKey }, redirect: 'error', signal: AbortSignal.timeout(10000)
    });
    if (provider.status === 429) return error('RATE_LIMIT', 429);
    if (provider.status === 404) return error('NOT_FOUND', 404);
    if (!provider.ok) return unavailable();
    return selectFlight(await provider.json(), number, date, now);
  } catch {
    return unavailable();
  }
}

export const onRequest = context => handleFlightStatus(context);
