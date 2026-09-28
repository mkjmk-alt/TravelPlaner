export const shouldRenderMapPane = ({ isBottomNavigationViewport, mapVisible } = {}) => (
  !isBottomNavigationViewport || Boolean(mapVisible)
);

export const runOrQueueMapCameraAction = (mapRef, pendingActionRef, action) => {
  if (mapRef.current) {
    action(mapRef.current);
    return true;
  }

  pendingActionRef.current = action;
  return false;
};

export const flushPendingMapCameraAction = (map, mapRef, pendingActionRef) => {
  if (!map) return false;

  mapRef.current = map;
  const pendingAction = pendingActionRef.current;
  pendingActionRef.current = null;
  if (!pendingAction) return false;

  pendingAction(map);
  return true;
};
