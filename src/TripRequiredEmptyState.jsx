import { ArrowRight, Plane } from 'lucide-react';
import { getTripRequiredPresentation } from './appNavigation';

const TripRequiredEmptyState = ({ viewMode, onGoToTrips, isReadOnlyTrip = false, compact = false }) => {
  const presentation = getTripRequiredPresentation(viewMode, { isReadOnlyTrip });
  if (!presentation) return null;
  const titleId = `trip-required-empty-state-title-${viewMode}${compact ? '-compact' : ''}${isReadOnlyTrip ? '-read-only' : ''}`;

  return (
    <section className={`trip-required-empty-state${compact ? ' is-compact' : ''}`} aria-labelledby={titleId}>
      <span className="trip-required-empty-state-icon" aria-hidden="true">
        <Plane size={23} strokeWidth={2.2} />
      </span>
      <h2 id={titleId}>{presentation.title}</h2>
      <p>{presentation.message}</p>
      {presentation.actionLabel && (
        <button type="button" onClick={onGoToTrips}>
          <span>{presentation.actionLabel}</span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </section>
  );
};

export default TripRequiredEmptyState;
