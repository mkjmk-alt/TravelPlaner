import { useEffect, useRef } from 'react';
import { fetchItineraryPlaceName } from './itineraryPlaceName.js';

export default function ItineraryPlaceName({ name, lookupID, resolved, maps, onResolve }) {
  const titleRef = useRef(null);

  useEffect(() => {
    if (!lookupID || resolved !== undefined || !maps) return undefined;
    let active = true;
    const lookup = () => {
      void fetchItineraryPlaceName(maps, lookupID).then(value => {
        if (active) onResolve(lookupID, value);
      });
    };
    if (typeof IntersectionObserver === 'undefined') {
      lookup();
      return () => { active = false; };
    }
    const observer = new IntersectionObserver(entries => {
      if (!active || !entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      lookup();
    });
    observer.observe(titleRef.current);
    return () => { active = false; observer.disconnect(); };
  }, [lookupID, maps, onResolve, resolved]);

  return (
    <span ref={titleRef}>
      <span className="itinerary-place-name-text">{name}</span>
      {resolved && <small className="itinerary-name-attribution" translate="no">Google Maps</small>}
    </span>
  );
}
