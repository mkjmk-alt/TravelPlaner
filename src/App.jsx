import React, { useState, useCallback, useMemo, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Autocomplete } from '@react-google-maps/api';
import { Search, MapPin, Plus, Trash2, Menu, X, Calendar, Compass, ChevronRight, PlusCircle, AlertCircle, Heart } from 'lucide-react';
import './index.css';

// --- CONFIGURATION ---
const HK_CENTER = { lat: 22.2891, lng: 114.1924 };
const MAP_LIBRARIES = ['places']; 
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const mapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  styles: [
    { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'on' }, { lightness: 30 }] },
    { featureType: 'water', elementType: 'all', stylers: [{ color: '#e7f1ff' }] },
    { featureType: 'landscape', elementType: 'all', stylers: [{ color: '#ffffff' }] }
  ]
};

function App() {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAP_LIBRARIES,
  });

  const [map, setMap] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  
  const [itinerary, setItinerary] = useState(() => {
    const saved = localStorage.getItem('world_pro_v16');
    return saved ? JSON.parse(saved) : [{ day: 1, items: [] }];
  });

  // Favorites State
  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem('world_pro_fav_v1');
    return saved ? JSON.parse(saved) : [];
  });

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState('itinerary'); // 'favorites', 'itinerary'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [activeDay, setActiveDay] = useState(1);
  const [expandedCountries, setExpandedCountries] = useState({});

  const autocompleteRef = useRef(null);

  const getCountryFromAddress = (address) => {
    if (!address) return 'Unknown';
    const parts = address.split(',');
    let country = parts[parts.length - 1].trim();
    // Remove digits (like postal codes) if they appear before the country name
    country = country.replace(/^[0-9A-Z-\s]+ /, ''); 
    return country;
  };

  const groupedFavorites = useMemo(() => {
    const groups = {};
    favorites.forEach(fav => {
      const country = getCountryFromAddress(fav.loc);
      if (!groups[country]) groups[country] = [];
      groups[country].push(fav);
    });
    return groups;
  }, [favorites]);

  const toggleCountry = (country) => {
    setExpandedCountries(prev => ({
      ...prev,
      [country]: !prev[country]
    }));
  };

  const saveItinerary = (newItinerary) => {
    setItinerary(newItinerary);
    localStorage.setItem('world_pro_v16', JSON.stringify(newItinerary));
  };

  const saveFavorites = (newFavs) => {
    setFavorites(newFavs);
    localStorage.setItem('world_pro_fav_v1', JSON.stringify(newFavs));
  };

  const toggleFavorite = (place) => {
    const isFav = favorites.some(f => f.name === place.name);
    if (isFav) {
      saveFavorites(favorites.filter(f => f.name !== place.name));
    } else {
      saveFavorites([...favorites, { ...place, id: Date.now() }]);
    }
  };

  const isFavorite = (place) => {
    if (!place) return false;
    return favorites.some(f => f.name === place.name);
  };

  const addDay = () => {
    const nextDay = itinerary.length + 1;
    saveItinerary([...itinerary, { day: nextDay, items: [] }]);
    setActiveDay(nextDay);
  };

  const addToItinerary = (place) => {
    const newItinerary = [...itinerary];
    const dayIndex = newItinerary.findIndex(d => d.day === activeDay);
    
    if (dayIndex !== -1) {
      newItinerary[dayIndex].items.push({ 
        ...place, 
        id: Date.now(),
        emoji: place.emoji || '📍' 
      });
      saveItinerary(newItinerary);
      setViewMode('itinerary');
    }
  };

  const removeFromItinerary = (dayIndex, itemId) => {
    const newItinerary = [...itinerary];
    newItinerary[dayIndex].items = newItinerary[dayIndex].items.filter(i => i.id !== itemId);
    saveItinerary(newItinerary);
  };

  const onPlaceSelected = () => {
    const autocomplete = autocompleteRef.current;
    if (!autocomplete) return;
    const place = autocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) return;

    const newPlace = {
      name: place.name,
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
      loc: place.formatted_address,
      cat: 'Search Result',
      desc: place.formatted_address,
      emoji: '📍',
      type: 'search'
    };

    setSearchResult(newPlace);
    setSelectedPlace(newPlace);
    
    if (map) {
      if (place.geometry.viewport) {
        map.fitBounds(place.geometry.viewport);
      } else {
        map.panTo(place.geometry.location);
        map.setZoom(18);
      }
    }
  };

  const fetchPlaceDetails = (placeId) => {
    if (!map || !window.google) return;
    const service = new window.google.maps.places.PlacesService(map);
    service.getDetails(
      { placeId, fields: ['name', 'geometry', 'formatted_address'] },
      (place, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place.geometry && place.geometry.location) {
          const newPlace = {
            name: place.name,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            loc: place.formatted_address || 'Selected from Map',
            cat: 'Map Selection',
            desc: place.formatted_address || '',
            emoji: '📍',
            type: 'poi'
          };
          setSearchResult(newPlace);
          setSelectedPlace(newPlace);
        }
      }
    );
  };

  const onMapClick = (e) => {
    if (e.placeId) {
      e.stop(); // Prevent the default Google Maps InfoWindow from opening
      fetchPlaceDetails(e.placeId);
    } else {
      setSelectedPlace(null);
    }
  };

  const totalSpots = itinerary.reduce((acc, day) => acc + day.items.length, 0);

  // Robust Error Boundaries
  if (loadError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-red-50 text-red-500 font-sans p-10 text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#fef2f2', color: '#ef4444' }}>
        <AlertCircle size={48} className="mb-4" />
        <h1 style={{ fontSize: '24px', fontWeight: '900', margin: '16px 0 8px 0' }}>Map Load Error</h1>
        <p style={{ fontWeight: 'bold' }}>{loadError.message}</p>
      </div>
    );
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-orange-50 text-orange-500 font-sans p-10 text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#fff7ed', color: '#f97316' }}>
        <AlertCircle size={48} className="mb-4" />
        <h1 style={{ fontSize: '24px', fontWeight: '900', margin: '16px 0 8px 0' }}>API Key Missing</h1>
        <p style={{ fontWeight: 'bold' }}>Please check your .env file.</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-screen flex flex-col items-center justify-center font-sans bg-white text-gray-400" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'white', color: '#9ca3af' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', marginBottom: '16px', animation: 'spin 1s linear infinite' }}></div>
        <div style={{ fontWeight: '900', letterSpacing: '0.1em' }}>LOADING WORLD...</div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-[#f8f9fa] overflow-hidden font-sans" style={{ width: '100vw', height: '100vh', position: 'relative', fontFamily: '"Inter", "Roboto", sans-serif' }}>
      
      {/* SIDEBAR UI */}
      {sidebarOpen && (
        <aside 
          className="absolute top-6 left-6 bottom-6 w-[400px] bg-white/95 backdrop-blur-2xl rounded-[32px] shadow-2xl border border-white/50 flex flex-col overflow-hidden z-[1000] transition-all duration-300"
          style={{ position: 'absolute', top: '24px', left: '24px', bottom: '24px', width: '420px', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255,255,255,0.8)', zIndex: 1000, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          {/* Header */}
          <div style={{ padding: '32px 32px 24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6' }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#111827', margin: 0, letterSpacing: '-0.05em' }}>WorldPro</h1>
              <p style={{ fontSize: '10px', fontWeight: '800', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.2em', margin: '4px 0 0 0' }}>Global Travel Planner</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => setViewMode('favorites')}
                style={{ width: '44px', height: '44px', borderRadius: '14px', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s', backgroundColor: viewMode === 'favorites' ? '#ef4444' : '#f3f4f6', color: viewMode === 'favorites' ? 'white' : '#9ca3af' }}
                title="Favorites"
              >
                <Heart size={20} fill={viewMode === 'favorites' ? "currentColor" : "none"} />
              </button>
              <button 
                onClick={() => setViewMode('itinerary')}
                style={{ width: '44px', height: '44px', borderRadius: '14px', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s', backgroundColor: viewMode === 'itinerary' ? '#2563eb' : '#f3f4f6', color: viewMode === 'itinerary' ? 'white' : '#9ca3af' }}
                title="Planner"
              >
                <Calendar size={20} />
              </button>
            </div>
          </div>

          {/* List Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
            
            {/* --- FAVORITES MODE --- */}
            {viewMode === 'favorites' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <h2 style={{ fontSize: '12px', fontWeight: '900', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>Saved Places</h2>
                </div>
                {Object.keys(groupedFavorites).length === 0 ? (
                  <div style={{ padding: '40px 20px', border: '2px dashed #fecaca', borderRadius: '16px', textAlign: 'center' }}>
                    <Heart size={36} color="#fca5a5" style={{ margin: '0 auto 12px auto' }} />
                    <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>No places saved yet</p>
                  </div>
                ) : (
                  Object.entries(groupedFavorites).map(([country, places]) => (
                    <div key={`country-${country}`} style={{ marginBottom: '20px' }}>
                      <div 
                        onClick={() => toggleCountry(country)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', backgroundColor: '#fef2f2', borderRadius: '16px', cursor: 'pointer', marginBottom: '12px' }}
                      >
                        <h3 style={{ fontSize: '16px', fontWeight: '900', color: '#ef4444', margin: 0 }}>{country}</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '800', color: '#f87171' }}>{places.length} spots</span>
                          <ChevronRight size={18} color="#f87171" style={{ transform: expandedCountries[country] ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.2s' }} />
                        </div>
                      </div>

                      {expandedCountries[country] && (
                        <div style={{ paddingLeft: '12px', borderLeft: '2px solid #fecaca', marginLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {places.map((loc) => (
                            <div 
                              key={`fav-list-${loc.name}`}
                              onClick={() => {
                                setSelectedPlace(loc);
                                map?.panTo({ lat: loc.lat, lng: loc.lng });
                                map?.setZoom(18);
                              }}
                              style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', backgroundColor: selectedPlace?.name === loc.name ? '#fef2f2' : 'transparent', borderRadius: '16px', cursor: 'pointer', border: '1px solid transparent' }}
                            >
                              <div style={{ width: '48px', height: '48px', backgroundColor: 'white', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', border: '1px solid #f3f4f6', flexShrink: 0 }}>{loc.emoji}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#111827', margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</h3>
                                <p style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.loc}</p>
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); toggleFavorite(loc); }} style={{ padding: '10px', backgroundColor: '#fef2f2', border: 'none', color: '#ef4444', borderRadius: '10px', cursor: 'pointer', flexShrink: 0 }}>
                                <Heart size={18} fill="currentColor" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </>
            )}

            {/* --- ITINERARY MODE --- */}
            {viewMode === 'itinerary' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '12px', fontWeight: '900', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>My Planner</h2>
                  <button onClick={addDay} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '800', color: '#2563eb', backgroundColor: '#eff6ff', padding: '8px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                    <PlusCircle size={14} /> ADD DAY
                  </button>
                </div>

                {itinerary.map((dayPlan, dIdx) => (
                  <div key={dayPlan.day} style={{ marginBottom: '32px' }}>
                    <div 
                      onClick={() => setActiveDay(dayPlan.day)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', padding: '12px 16px', borderRadius: '12px', cursor: 'pointer', backgroundColor: activeDay === dayPlan.day ? '#eff6ff' : 'transparent', border: activeDay === dayPlan.day ? '1px solid #bfdbfe' : '1px solid transparent' }}
                    >
                      <h3 style={{ fontSize: '14px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, color: activeDay === dayPlan.day ? '#2563eb' : '#9ca3af' }}>
                        Day {dayPlan.day} {activeDay === dayPlan.day && '• Active'}
                      </h3>
                      <span style={{ fontSize: '11px', fontWeight: '800', color: '#9ca3af' }}>{dayPlan.items.length} spots</span>
                    </div>

                    {dayPlan.items.length === 0 ? (
                      <div style={{ padding: '32px 20px', border: '2px dashed #e5e7eb', borderRadius: '16px', textAlign: 'center' }}>
                        <p style={{ fontSize: '11px', color: '#d1d5db', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>No places planned</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {dayPlan.items.map((item) => (
                          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <div style={{ fontSize: '28px', flexShrink: 0 }}>{item.emoji}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#111827', margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</h3>
                              <p style={{ fontSize: '10px', fontWeight: '900', color: '#60a5fa', textTransform: 'uppercase', margin: 0, letterSpacing: '0.05em' }}>{item.cat}</p>
                            </div>
                            <button onClick={() => removeFromItinerary(dIdx, item.id)} style={{ padding: '10px', color: '#ef4444', backgroundColor: '#fef2f2', border: 'none', borderRadius: '10px', cursor: 'pointer', flexShrink: 0 }}>
                              <Trash2 size={18} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '24px 32px', borderTop: '1px solid #f3f4f6', backgroundColor: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: '900', color: '#111827', letterSpacing: '0.05em' }}>{favorites.length} SAVED • {totalSpots} PLANNED</span>
            <button onClick={() => setSidebarOpen(false)} style={{ fontSize: '11px', fontWeight: '900', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.05em' }}>CLOSE</button>
          </div>
        </aside>
      )}

      {/* MAP VIEWPORT */}
      <main className="absolute inset-0 z-0" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} className="absolute top-6 left-6 z-[2000] w-14 h-14 bg-white rounded-2xl shadow-2xl flex items-center justify-center text-blue-600 hover:scale-110 transition-all border border-white" style={{ position: 'absolute', top: '24px', left: '24px', zIndex: 2000, width: '56px', height: '56px', backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
            <Menu size={24} />
          </button>
        )}

        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[2000] w-full max-w-md px-4" style={{ position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 2000, width: '100%', maxWidth: '448px' }}>
          <div className="bg-white/90 backdrop-blur-xl border border-white/50 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-2 flex items-center" style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: '24px', display: 'flex', padding: '8px', boxShadow: '0 20px 50px rgba(0,0,0,0.15)', alignItems: 'center' }}>
             <div className="flex-1 px-4 text-sm font-bold text-gray-900" style={{ flex: 1, padding: '0 16px', display: 'flex', alignItems: 'center', height: '48px' }}>
               <div style={{ width: '100%' }}>
                 <Autocomplete 
                    onLoad={(a) => { autocompleteRef.current = a; }} 
                    onPlaceChanged={onPlaceSelected}
                 >
                   <input 
                      type="text" 
                      placeholder="Search for any place in the world..." 
                      className="w-full bg-transparent outline-none placeholder:text-gray-400" 
                      style={{ width: '100%', height: '48px', lineHeight: 'normal', background: 'transparent', border: 'none', outline: 'none', fontSize: '20px', fontWeight: 'bold', color: '#1f2937', padding: 0, margin: 0, display: 'block' }}
                   />
                 </Autocomplete>
               </div>
             </div>
             <button className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200" style={{ width: '48px', height: '48px', backgroundColor: '#2563eb', color: 'white', borderRadius: '16px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <Search size={20} />
             </button>
          </div>
        </div>

        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={HK_CENTER}
          zoom={3}
          onLoad={(m) => setMap(m)}
          options={mapOptions}
          onClick={onMapClick}
        >
          {/* Favorite Markers */}
          {favorites.map(fav => (
            <Marker
              key={`fav-${fav.name}`}
              position={{ lat: fav.lat, lng: fav.lng }}
              onClick={() => setSelectedPlace(fav)}
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

          {/* Dynamic Search Result Marker */}
          {searchResult && searchResult.name !== selectedPlace?.name && (
             <Marker
                position={{ lat: searchResult.lat, lng: searchResult.lng }}
                onClick={() => setSelectedPlace(searchResult)}
                icon={{
                  url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="20" cy="20" r="18" fill="%23006ADC" stroke="white" stroke-width="3"/>
                      <text x="20" y="27" font-size="20" text-anchor="middle">📍</text>
                    </svg>
                  `)}`,
                  scaledSize: new window.google.maps.Size(40, 40),
                  anchor: new window.google.maps.Point(20, 20)
                }}
             />
          )}

          {/* Selected Place InfoWindow */}
          {selectedPlace && (
            <InfoWindow position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }} onCloseClick={() => setSelectedPlace(null)}>
              <div style={{ padding: '20px', minWidth: '300px', maxWidth: '340px', fontFamily: '"Inter", "Roboto", sans-serif' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ width: '56px', height: '56px', backgroundColor: '#f9fafb', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', border: '1px solid #f3f4f6', flexShrink: 0 }}>
                    {selectedPlace.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '900', margin: '0 0 6px 0', color: '#111827', lineHeight: 1.2 }}>{selectedPlace.name}</h3>
                    <p style={{ fontSize: '11px', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, display: 'flex', alignItems: 'flex-start', gap: '4px', lineHeight: 1.4 }}>
                      <MapPin size={12} color="#3b82f6" style={{ marginTop: '2px', flexShrink: 0 }} /> 
                      <span style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{selectedPlace.loc}</span>
                    </p>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => addToItinerary(selectedPlace)} 
                    style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: 'white', borderRadius: '12px', fontSize: '13px', fontWeight: '900', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <PlusCircle size={16} /> ADD TO DAY {activeDay}
                  </button>
                  <button 
                    onClick={() => toggleFavorite(selectedPlace)} 
                    style={{ padding: '12px', borderRadius: '12px', border: `2px solid ${isFavorite(selectedPlace) ? '#fee2e2' : '#f3f4f6'}`, backgroundColor: isFavorite(selectedPlace) ? '#fef2f2' : 'white', color: isFavorite(selectedPlace) ? '#ef4444' : '#9ca3af', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Heart size={20} fill={isFavorite(selectedPlace) ? "currentColor" : "none"} />
                  </button>
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </main>
    </div>
  );
}

export default App;
