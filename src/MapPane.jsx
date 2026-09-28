import React, { useMemo } from 'react';
import { GoogleMap, useJsApiLoader, OverlayViewF, InfoWindow, Polyline } from '@react-google-maps/api';
import { AlertCircle, Clock, Heart, LocateFixed, MapPin, Menu, Navigation, PlusCircle } from 'lucide-react';
import { getMapAvailability } from './mapAvailability';

const HK_CENTER = { lat: 22.2891, lng: 114.1924 };
const MAP_LIBRARIES = ['places'];

const CustomMapMarker = ({ position, onClick, icon, label, ariaLabel }) => {
  // Keep the literal stable when a parent re-renders for an unrelated reason.
  // OverlayViewF can then update the same map overlay instead of recreating it.
  const markerPosition = useMemo(
    () => ({ lat: Number(position.lat), lng: Number(position.lng) }),
    [position.lat, position.lng]
  );
  const width = Number(icon?.scaledSize?.width) || 40;
  const height = Number(icon?.scaledSize?.height) || width;
  const anchorX = Number(icon?.anchor?.x);
  const anchorY = Number(icon?.anchor?.y);
  const offsetX = Number.isFinite(anchorX) ? -anchorX : -width / 2;
  const offsetY = Number.isFinite(anchorY) ? -anchorY : -height / 2;

  return (
    <OverlayViewF
      position={markerPosition}
      mapPaneName="overlayMouseTarget"
      getPixelPositionOffset={() => ({ x: offsetX, y: offsetY })}
    >
      <button
        type="button"
        aria-label={ariaLabel || (label?.text ? `지도 ${label.text}` : '지도 장소')}
        onClick={onClick}
        style={{
          position: 'relative',
          display: 'block',
          width: `${width}px`,
          height: `${height}px`,
          padding: 0,
          border: 0,
          background: 'transparent',
          cursor: onClick ? 'pointer' : 'default'
        }}
      >
        {icon?.url && <img src={icon.url} alt="" width={width} height={height} draggable="false" style={{ display: 'block' }} />}
        {label?.text && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: label.color || 'white',
              fontSize: label.fontSize || '14px',
              fontWeight: label.fontWeight || '700',
              pointerEvents: 'none',
              lineHeight: 1
            }}
          >
            {label.text}
          </span>
        )}
      </button>
    </OverlayViewF>
  );
};

const mapOptions = {
  // GoogleMap accepts initial camera values through options, not default* props.
  // Keep this object stable so React updates do not reset a user's pan/zoom.
  center: HK_CENTER,
  zoom: 3,
  disableDefaultUI: true,
  zoomControl: false,
  gestureHandling: 'greedy',
  styles: [
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#eff6ff' }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#f3f4f6' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
    { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#f9fafb' }] },
    { featureType: 'poi', elementType: 'labels.icon', stylers: [{ saturation: -100 }, { lightness: 15 }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
    { featureType: 'poi', elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff', weight: 3 }] },
    { featureType: 'transit', elementType: 'labels.icon', stylers: [{ saturation: -100 }, { lightness: 10 }] },
    { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] }
  ]
};

export default function MapPane({ mapData = {}, mapView = {}, actions = {}, formComponents = {} }) {
  const { favorites = [], userLocation, polylinePath = [], activeDay, itinerary = [], reserveItems = [], searchResult, fullTripPaths = [], interDayPaths = [], dayColors = [] } = mapData;
  const { showFullRoute = false, selectedPlace, useFloatingPlacePanel = false, selectedPlaceBusinessStatus = '', selectedPlaceOpeningHours = [], windowWidth = 1024, sidebarOpen = true, activeTripId, isReadOnlyTrip = false, itineraryDisplayName = '', itineraryEmoji = '📍', itineraryTime = '' } = mapView;
  const { onMapLoad, onMapUnmount, onMapClick, onSelectedPlaceChange, onToggleFullRoute, onMyLocation, onOpenSidebar, onToggleFavorite, isFavorite, onActiveDayChange, onItineraryDisplayNameChange, onItineraryEmojiChange, onItineraryTimeChange, onAddToItinerary } = actions;
  const { ItineraryEmojiPicker, PremiumTimeInput } = formComponents;
  const parseDay = (day) => parseInt(String(day).replace(/[^0-9]/g, '')) || 0;
  const runtimeConfig = typeof window !== 'undefined' ? window.__TRAVELPLANER_CONFIG__ || {} : {};
  const apiKey = runtimeConfig.googleMapsApiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries: MAP_LIBRARIES,
    language: 'ko',
    region: 'KR'
  });
  const mapAvailability = getMapAvailability({ apiKey, isLoaded, loadError });

  return (
    mapAvailability.mapAvailable ? (
          <>
        {/* MAP CONTROLS (TOP-RIGHT) */}
        <div className="map-controls-group">
          {/* Full Route Toggle */}
          <button
            onClick={onToggleFullRoute}
            style={{
              width: '56px', height: '56px',
              backgroundColor: showFullRoute ? '#4f46e5' : 'white',
              borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
              cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: showFullRoute ? 'white' : '#4f46e5',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            aria-label={showFullRoute ? "일차별 경로 보기" : "전체 경로 보기"} title={showFullRoute ? "일차별 경로 보기" : "전체 경로 보기"}
          >
            <Navigation size={24} style={{ transform: showFullRoute ? 'rotate(45deg)' : 'none', transition: 'transform 0.3s' }} />
          </button>

          {/* My Location Button */}
          <button
            onClick={onMyLocation}
            style={{
              width: '56px', height: '56px',
              backgroundColor: 'white',
              borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
              cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#10b981',
              transition: 'all 0.2s'
            }}
            aria-label="내 현재 위치 찾기" title="내 현재 위치 찾기"
          >
            <LocateFixed size={24} />
          </button>
        </div>

        {/* SIDEBAR TOGGLE (ONLY WHEN CLOSED) */}
        {!sidebarOpen && (
          <div className="sidebar-toggle-btn">
            <button aria-label="메뉴 열기" title="메뉴 열기" onClick={onOpenSidebar} style={{ width: '56px', height: '56px', backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
              <Menu size={24} />
            </button>
          </div>
        )}

        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          onLoad={onMapLoad}
          onUnmount={onMapUnmount}
          options={mapOptions}
          onClick={onMapClick}
        >
          {/* Favorite Markers */}
          {(favorites || []).map(fav => (
            <CustomMapMarker
              key={`fav-${fav.name}`}
              position={{ lat: fav.lat, lng: fav.lng }}
              onClick={() => onSelectedPlaceChange(fav)}
              icon={{
                url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="16" cy="16" r="14" fill="#ef4444" stroke="white" stroke-width="2"/>
                    <text x="16" y="21" font-size="14" text-anchor="middle">❤️</text>
                  </svg>
                `)}`,
                scaledSize: new window.google.maps.Size(32, 32),
                anchor: new window.google.maps.Point(16, 16)
              }}
            />
          ))}

          {/* User Current Location Marker */}
          {userLocation && (
            <CustomMapMarker
              position={userLocation}
              icon={{
                url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="8" fill="#3b82f6" stroke="white" stroke-width="2"/>
                    <circle cx="12" cy="12" r="11" stroke="#3b82f6" stroke-opacity="0.3" stroke-width="2">
                      <animate attributeName="r" from="8" to="11" dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="stroke-opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                  </svg>
                `)}`,
                scaledSize: new window.google.maps.Size(24, 24),
                anchor: new window.google.maps.Point(12, 12)
              }}
            />
          )}

          {/* Route Path (Polyline) */}
          {window.google && !showFullRoute && polylinePath.length > 0 && (
            <Polyline
              key={`route-polyline-${activeDay}`}
              path={polylinePath}
              options={{
                strokeColor: '#3b82f6',
                strokeOpacity: 0.8,
                strokeWeight: 4,
                icons: [{ icon: { path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, fillOpacity: 1, strokeColor: '#3b82f6' }, offset: '50%', repeat: '100px' }],
              }}
            />
          )}

          {/* --- FULL TRIP ROUTE RENDERING --- */}
          {window.google && showFullRoute && (
            <>
              {/* 1. Inter-day Connections (Dashed) */}
              {interDayPaths.map((path, idx) => (
                <Polyline
                  key={`inter-day-${idx}`}
                  path={path}
                  options={{
                    strokeColor: '#94a3b8',
                    strokeOpacity: 0.4,
                    strokeWeight: 2,
                    icons: [{
                      icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.6, scale: 3 },
                      offset: '0',
                      repeat: '15px'
                    }],
                  }}
                />
              ))}

              {/* 2. Daily Routes (Solid with Arrows) */}
              {fullTripPaths.map((path, idx) => (
                <Polyline
                  key={`full-route-day-${idx}`}
                  path={path}
                  options={{
                    strokeColor: dayColors[idx % dayColors.length],
                    strokeOpacity: 0.8,
                    strokeWeight: 5,
                    icons: [{
                      icon: {
                        path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                        scale: 3,
                        fillOpacity: 1,
                        strokeColor: dayColors[idx % dayColors.length]
                      },
                      offset: '50%',
                      repeat: '100px'
                    }],
                  }}
                />
              ))}

              {/* 3. Day Markers (Labels for the start of each day) */}
              {fullTripPaths.map((path, idx) => (
                <CustomMapMarker
                  key={`day-label-${idx}`}
                  position={path[0]}
                  label={{
                    text: `${idx + 1}일차`,
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: '900'
                  }}
                  icon={{
                    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                      <svg width="60" height="30" viewBox="0 0 60 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect width="60" height="24" rx="12" fill="${dayColors[idx % dayColors.length]}" />
                        <path d="M30 30L26 24H34L30 30Z" fill="${dayColors[idx % dayColors.length]}" />
                      </svg>
                    `)}`,
                    scaledSize: new window.google.maps.Size(60, 30),
                    anchor: new window.google.maps.Point(30, 30)
                  }}
                />
              ))}
            </>
          )}

          {/* Itinerary Markers */}
          {!showFullRoute && (
            <React.Fragment key={`markers-daily-${activeDay}`}>
              {(() => {
                const targetDay = parseDay(activeDay);
                const dayPlan = (itinerary || []).find(d => parseDay(d.day) === targetDay);
                return (dayPlan?.items || [])
                  .filter(item => item.lat && item.lng)
                  .map((item, idx) => (
                  <CustomMapMarker
                    key={`itin-mark-${activeDay}-${item.id}`}
                    position={{ lat: Number(item.lat), lng: Number(item.lng) }}
                    label={{ text: `${idx + 1}`, color: 'white', fontSize: '14px', fontWeight: '900' }}
                    onClick={() => onSelectedPlaceChange(item)}
                    icon={{
                      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="20" cy="20" r="16" fill="#3b82f6" stroke="white" stroke-width="3"/>
                        </svg>
                      `)}`,
                      scaledSize: new window.google.maps.Size(40, 40), anchor: new window.google.maps.Point(20, 20)
                    }}
                  />
                ));
              })()}
            </React.Fragment>
          )}

          {/* Reserve markers: numbered only, without a route or directional arrows. */}
          {!showFullRoute && activeDay === 'reserve' && (
            <React.Fragment key="markers-reserve">
              {reserveItems
                .filter(item => item.lat && item.lng)
                .map((item, idx) => (
                  <CustomMapMarker
                    key={`reserve-mark-${item.id}`}
                    position={{ lat: Number(item.lat), lng: Number(item.lng) }}
                    label={{ text: `${idx + 1}`, color: 'white', fontSize: '14px', fontWeight: '900' }}
                    onClick={() => onSelectedPlaceChange(item)}
                    icon={{
                      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="20" cy="20" r="16" fill="#f59e0b" stroke="white" stroke-width="3"/>
                        </svg>
                      `)}`,
                      scaledSize: new window.google.maps.Size(40, 40), anchor: new window.google.maps.Point(20, 20)
                    }}
                  />
                ))}
            </React.Fragment>
          )}

          {showFullRoute && itinerary.map((day, dIdx) => (
            <React.Fragment key={`markers-full-${dIdx}`}>
              {(day.items || [])
                .filter(item => item.lat && item.lng)
                .map((item, idx) => (
                  <CustomMapMarker
                    key={`full-itin-mark-${dIdx}-${item.id}`}
                    position={{ lat: Number(item.lat), lng: Number(item.lng) }}
                    label={{ text: `${day.day}-${idx + 1}`, color: 'white', fontSize: '11px', fontWeight: '800' }}
                    onClick={() => onSelectedPlaceChange(item)}
                    icon={{
                      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                        <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="17" cy="17" r="14" fill="${dayColors[dIdx % dayColors.length]}" stroke="white" stroke-width="2"/>
                        </svg>
                      `)}`,
                      scaledSize: new window.google.maps.Size(34, 34), anchor: new window.google.maps.Point(17, 17)
                    }}
                  />
              ))}
            </React.Fragment>
          ))}

          {/* Dynamic Search Result Marker */}
          {searchResult && ['search', 'geocoded-search'].includes(searchResult.type) && (
             <CustomMapMarker
                position={{ lat: searchResult.lat, lng: searchResult.lng }}
                onClick={() => onSelectedPlaceChange(searchResult)}
                ariaLabel={`검색한 장소 ${searchResult.name}`}
                icon={{
                  url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                    <svg width="40" height="48" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 46C20 46 5 31.2 5 20C5 11.7 11.7 5 20 5C28.3 5 35 11.7 35 20C35 31.2 20 46 20 46Z" fill="%23006ADC" stroke="white" stroke-width="3" stroke-linejoin="round"/>
                      <circle cx="20" cy="20" r="8" fill="white"/>
                      <circle cx="20" cy="20" r="4" fill="%23006ADC"/>
                    </svg>
                  `)}`,
                  scaledSize: new window.google.maps.Size(40, 48),
                  anchor: new window.google.maps.Point(20, 48)
                }}
             />
          )}

          {/* Selected Place InfoWindow */}
          {!useFloatingPlacePanel && selectedPlace && windowWidth >= 768 && (
            <InfoWindow position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }} options={{ disableAutoPan: true }} onCloseClick={() => onSelectedPlaceChange(null)}>
              <div className="place-info-window-content" style={{ padding: window.innerWidth < 768 ? '8px 12px' : '20px', minWidth: window.innerWidth < 768 ? '250px' : '300px', maxWidth: '340px', fontFamily: '"Inter", "Roboto", sans-serif' }}>
                {/* TOP SECTION: Place Info & Favorite */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: window.innerWidth < 768 ? '10px' : '16px', marginBottom: window.innerWidth < 768 ? '8px' : '16px' }}>
                  <div style={{ width: window.innerWidth < 768 ? '40px' : '56px', height: window.innerWidth < 768 ? '40px' : '56px', backgroundColor: '#f9fafb', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: window.innerWidth < 768 ? '20px' : '32px', border: '1px solid #f3f4f6', flexShrink: 0 }}>
                    {selectedPlace.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                      <h3 style={{ fontSize: window.innerWidth < 768 ? '15px' : '18px', fontWeight: '900', margin: '0 0 1px 0', color: '#111827', lineHeight: 1.2, flex: 1 }}>{selectedPlace.name}</h3>
                      <button
                        onClick={() => onToggleFavorite(selectedPlace)}
                        style={{
                          padding: '5px',
                          borderRadius: '8px',
                          border: 'none',
                          backgroundColor: isFavorite(selectedPlace) ? '#fee2e2' : '#f1f5f9',
                          color: isFavorite(selectedPlace) ? '#ef4444' : '#9ca3af',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      >
                        <Heart size={window.innerWidth < 768 ? 16 : 22} fill={isFavorite(selectedPlace) ? "currentColor" : "none"} />
                      </button>
                    </div>
                    <p style={{ fontSize: '9px', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, display: 'flex', alignItems: 'flex-start', gap: '4px', lineHeight: 1.2 }}>
                      <MapPin size={9} color="#3b82f6" style={{ marginTop: '1px', flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{selectedPlace.loc}</span>
                    </p>
                    {(selectedPlaceBusinessStatus || selectedPlaceOpeningHours.length > 0) && (
                      <details className="place-hours-summary">
                        <summary><Clock size={11} aria-hidden="true" />영업시간{selectedPlaceBusinessStatus ? ` · ${selectedPlaceBusinessStatus}` : ''}</summary>
                        {selectedPlaceOpeningHours.length > 0 && (
                          <div className="place-hours-list">
                            {selectedPlaceOpeningHours.map((hours, index) => <span key={`${hours}-${index}`}>{hours}</span>)}
                          </div>
                        )}
                      </details>
                    )}
                  </div>
                </div>

                <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: window.innerWidth < 768 ? '8px 0' : '16px 0' }} />

                {/* BOTTOM SECTION: Add to Itinerary */}
                {activeTripId && !isReadOnlyTrip && (
                  <div style={{ backgroundColor: '#f8fafc', padding: window.innerWidth < 768 ? '10px' : '16px', borderRadius: '14px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '9px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>일차 선택</div>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '2px' }}>
                      <button
                        type="button"
                        onClick={() => onActiveDayChange('reserve')}
                        style={{ flex: '0 0 auto', minWidth: '74px', padding: '8px 6px', borderRadius: '10px', border: '1px solid', borderColor: activeDay === 'reserve' ? '#f59e0b' : '#e2e8f0', backgroundColor: activeDay === 'reserve' ? '#fffbeb' : 'white', color: activeDay === 'reserve' ? '#d97706' : '#64748b', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}
                      >
                        예비 목록
                      </button>
                      {(itinerary || []).map((dayPlan, dayIndex) => {
                        const day = parseDay(dayPlan?.day) || dayIndex + 1;
                        return (
                        <button
                          key={day}
                          onClick={() => onActiveDayChange(day)}
                          style={{
                            flex: '0 0 auto',
                            minWidth: '58px',
                            padding: '8px 0',
                            borderRadius: '10px',
                            border: '1px solid',
                            borderColor: activeDay === day ? '#2563eb' : '#e2e8f0',
                            backgroundColor: activeDay === day ? '#eff6ff' : 'white',
                            color: activeDay === day ? '#2563eb' : '#64748b',
                            fontSize: '11px',
                            fontWeight: '900',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          {day}일차
                        </button>
                        );
                      })}
                    </div>

                    <div style={{ marginBottom: "12px" }}>
                      <label style={{ display: "block", fontSize: "9px", fontWeight: "900", color: "#9ca3af", textTransform: "uppercase", marginBottom: "6px", letterSpacing: "0.05em" }}>
                        일정 표시 이름 (선택)
                      </label>
                      <input
                        type="text"
                        value={itineraryDisplayName}
                        onChange={(e) => onItineraryDisplayNameChange(e.target.value)}
                        placeholder={selectedPlace.name || "예: 호텔 체크인"}
                        maxLength={80}
                        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "12px", fontWeight: "700", outline: "none" }}
                      />
                      <p style={{ margin: "5px 0 0", fontSize: "10px", color: "#94a3b8" }}>
                        입력하지 않으면 검색된 장소명이 일정에 표시됩니다.
                      </p>
                    </div>

                    <ItineraryEmojiPicker value={itineraryEmoji} onChange={onItineraryEmojiChange} />

                    <PremiumTimeInput
                      label="도착 시간"
                      value={itineraryTime || '09:00'}
                      onChange={onItineraryTimeChange}
                    />

                    <button
                      className="place-info-window-add-button"
                      onClick={() => onAddToItinerary(selectedPlace)}
                      style={{
                        width: '100%',
                        padding: window.innerWidth < 768 ? '8px' : '14px',
                        backgroundColor: activeDay ? '#2563eb' : '#94a3b8',
                        color: 'white',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: '900',
                        border: 'none',
                        cursor: activeDay ? 'pointer' : 'not-allowed',
                        boxShadow: activeDay ? '0 4px 12px rgba(37, 99, 235, 0.2)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        transition: 'all 0.2s',
                        opacity: activeDay ? 1 : 0.7
                      }}
                    >
                      <PlusCircle size={14} />
                      {activeDay === 'reserve' ? '예비 목록에 추가' : activeDay ? `${activeDay}일차 일정에 추가` : '일차 또는 예비 목록을 선택해주세요'}
                    </button>
                  </div>
                )}
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
          </>
        ) : (
          <div
            className={`map-unavailable-state ${mapAvailability.reason === 'loading' ? 'is-loading' : ''}`}
            role={mapAvailability.reason === 'loading' ? 'status' : 'alert'}
            aria-live="polite"
          >
            {mapAvailability.reason === 'loading' ? (
              <div className="map-unavailable-spinner" aria-hidden="true" />
            ) : (
              <AlertCircle size={42} aria-hidden="true" />
            )}
            <strong>{mapAvailability.title}</strong>
            <p>
              {mapAvailability.reason === 'missing-key'
                ? '지도 없이도 일정, 즐겨찾기, 예산 기능은 사용할 수 있습니다.'
                : mapAvailability.detail}
            </p>
          </div>
          )
  );
}
