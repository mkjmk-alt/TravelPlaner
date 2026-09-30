export const ROUTE_SETTINGS_STORAGE_KEY = 'tripplot_map_route_settings';

export const normalizeRouteSettings = settings => ({
  mode: settings?.mode === 'road' ? 'road' : 'straight',
  travelMode: settings?.travelMode === 'WALKING' ? 'WALKING' : 'DRIVING'
});

export const getRoutePoint = point => {
  if (!point) return null;
  const rawLat = typeof point.lat === 'function' ? point.lat() : point.lat;
  const rawLng = typeof point.lng === 'function' ? point.lng() : point.lng;
  const isNumeric = value => (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '';
  if (!isNumeric(rawLat) || !isNumeric(rawLng)) return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
};

const parseDay = day => Number.parseInt(String(day).replace(/[^0-9]/g, ''), 10) || 0;

export const buildItineraryRouteGroups = ({ itinerary = [], activeDay, showFullRoute = false }) => {
  if (!showFullRoute && (activeDay === 'reserve' || !parseDay(activeDay))) return [];
  const days = itinerary.map((plan, index) => ({
    id: `day-${plan.day}-${index}`,
    kind: 'day',
    day: parseDay(plan.day) || index + 1,
    colorIndex: index,
    points: (plan.items || []).map(getRoutePoint).filter(Boolean)
  })).filter(group => group.points.length > 0);
  if (!showFullRoute) return days.filter(group => group.day === parseDay(activeDay));
  return days.flatMap((group, index) => index === 0 ? [group] : [{
    id: `bridge-${days[index - 1].id}-${group.id}`,
    kind: 'bridge',
    points: [days[index - 1].points.at(-1), group.points[0]]
  }, group]);
};

const getRouteTasks = groups => groups.flatMap(group => {
  const points = group.points.filter(point => getRoutePoint(point));
  return points.slice(1).flatMap((destination, index) => {
    const origin = points[index];
    return Number(origin.lat) === Number(destination.lat) && Number(origin.lng) === Number(destination.lng)
      ? []
      : [{ id: `${group.id}-segment-${index}`, group, origin, destination }];
  });
});

export const getRouteSegmentCount = groups => getRouteTasks(groups).length;

const routeError = code => Object.assign(new Error(code), { code });

const getRouteErrorKind = error => {
  const code = String(error?.code || '').toUpperCase();
  const message = `${code} ${error?.message || ''}`.toUpperCase();
  if (code === '5' || /ZERO_RESULTS|NOT_FOUND|NO_ROUTE|INVALID_ARGUMENT/.test(message)) return 'no-route';
  if (code === '8' || /RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|QUOTA|RATE_LIMIT/.test(message)) return 'quota';
  if (code === '7' || /PERMISSION|REQUEST_DENIED|API_NOT|BILLING|API_KEY|FORBIDDEN/.test(message)) return 'permission';
  return 'unavailable';
};

// Keep successful paths in bounded session memory, never in local storage or
// trip backups. In-flight deduplication also covers rapid view/day switching.
export const createRoadRouteResolver = ({ computeRoutes, cacheLimit = 128 }) => {
  const cache = new Map();
  return (origin, destination, travelMode) => {
    const request = {
      origin: getRoutePoint(origin),
      destination: getRoutePoint(destination),
      travelMode,
      fields: ['path', 'warnings'],
      polylineQuality: 'HIGH_QUALITY'
    };
    const key = JSON.stringify(request);
    if (cache.has(key)) {
      const cached = cache.get(key);
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }
    const pending = Promise.resolve().then(() => computeRoutes(request)).then(response => {
      const route = response?.routes?.[0];
      const path = (route?.path || []).map(getRoutePoint).filter(Boolean);
      if (path.length < 2) throw routeError('NO_ROUTE');
      return { path, warnings: (route.warnings || []).filter(warning => typeof warning === 'string') };
    }).catch(error => {
      if (cache.get(key) === pending) cache.delete(key);
      throw error;
    });
    cache.set(key, pending);
    while (cache.size > cacheLimit) cache.delete(cache.keys().next().value);
    return pending;
  };
};

let googleResolverPromise;

export const getGoogleRoadRouteResolver = maps => {
  if (!googleResolverPromise) {
    googleResolverPromise = Promise.resolve().then(async () => {
      const { Route } = await maps.importLibrary('routes');
      if (!Route?.computeRoutes) throw routeError('UNAVAILABLE');
      return createRoadRouteResolver({ computeRoutes: request => Route.computeRoutes(request) });
    }).catch(error => {
      googleResolverPromise = undefined;
      throw error;
    });
  }
  return googleResolverPromise;
};

export const resolveRoadRouteGroups = async ({ groups, resolveRoute, travelMode = 'DRIVING', signal }) => {
  const tasks = getRouteTasks(groups);
  const results = new Array(tasks.length);
  const failures = [];
  let nextIndex = 0;
  let error = null;
  const throwIfAborted = () => {
    if (signal?.aborted) throw Object.assign(new Error('Route request cancelled'), { name: 'AbortError' });
  };
  const worker = async () => {
    while (nextIndex < tasks.length && !error) {
      throwIfAborted();
      const index = nextIndex++;
      const { id, group, origin, destination } = tasks[index];
      try {
        const route = await resolveRoute(origin, destination, travelMode);
        throwIfAborted();
        if (!route?.path || route.path.length < 2) throw routeError('NO_ROUTE');
        results[index] = {
          id, groupId: group.id, kind: group.kind, day: group.day,
          colorIndex: group.colorIndex, path: route.path, warnings: route.warnings || []
        };
      } catch (cause) {
        throwIfAborted();
        const kind = getRouteErrorKind(cause);
        failures.push({ id, error: kind });
        if (kind !== 'no-route') error = kind;
      }
    }
  };
  // A small queue prevents long trips from flooding the directions service.
  await Promise.all(Array.from({ length: Math.min(2, tasks.length) }, worker));
  throwIfAborted();
  const segments = results.filter(Boolean);
  return {
    segments,
    failures,
    total: tasks.length,
    error,
    warnings: [...new Set(segments.flatMap(segment => segment.warnings))]
  };
};
