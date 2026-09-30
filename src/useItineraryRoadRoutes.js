import { useEffect, useState } from 'react';
import { getGoogleRoadRouteResolver, getRouteSegmentCount, resolveRoadRouteGroups } from './itineraryRoutes';

export default function useItineraryRoadRoutes({ groups, settings, isReady }) {
  const [snapshot, setSnapshot] = useState(null);
  const [retry, setRetry] = useState(0);
  const total = getRouteSegmentCount(groups);
  const requestKey = settings.mode === 'road' && total > 0
    ? JSON.stringify({ groups, travelMode: settings.travelMode })
    : '';

  useEffect(() => {
    if (!isReady || !requestKey) return;
    const controller = new AbortController();
    // Schedule only the settled order when users reorder items or change days.
    const timer = setTimeout(async () => {
      try {
        const resolveRoute = await getGoogleRoadRouteResolver(window.google.maps);
        if (controller.signal.aborted) return;
        const request = JSON.parse(requestKey);
        const result = await resolveRoadRouteGroups({ ...request, resolveRoute, signal: controller.signal });
        if (!controller.signal.aborted) setSnapshot({ key: requestKey, retry, ...result });
      } catch (error) {
        if (!controller.signal.aborted && error?.name !== 'AbortError') {
          setSnapshot({ key: requestKey, retry, segments: [], failures: [], warnings: [], error: 'unavailable' });
        }
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isReady, requestKey, retry]);

  const current = snapshot?.key === requestKey && snapshot?.retry === retry ? snapshot : null;
  return {
    segments: current?.segments || [],
    failures: current?.failures || [],
    warnings: current?.warnings || [],
    error: current?.error || null,
    status: !requestKey || !isReady ? 'idle' : !current ? 'loading' : current.error ? 'error' : 'ready',
    total,
    onRetry: () => setRetry(value => value + 1)
  };
}
