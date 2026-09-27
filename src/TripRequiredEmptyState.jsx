import { ArrowRight, Plane } from 'lucide-react';
import { getTripRequiredPresentation } from './appNavigation';

const TripRequiredEmptyState = ({ viewMode, onGoToTrips }) => {
  const presentation = getTripRequiredPresentation(viewMode);
  if (!presentation) return null;

  return (
    <section className="trip-required-empty-state" aria-labelledby="trip-required-empty-state-title">
      <span className="trip-required-empty-state-icon" aria-hidden="true">
        <Plane size={23} strokeWidth={2.2} />
      </span>
      <h2 id="trip-required-empty-state-title">{presentation.title}</h2>
      <p>{presentation.message}</p>
      <button type="button" onClick={onGoToTrips}>
        <span>{presentation.actionLabel}</span>
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </section>
  );
};

export default TripRequiredEmptyState;
