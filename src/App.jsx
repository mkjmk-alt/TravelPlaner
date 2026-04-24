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

  const autocompleteRef = useRef(null);

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
        // 검색된 장소의 고유 크기(도시, 구역, 건물 등)에 맞춰 완벽하게 줌인
        map.fitBounds(place.geometry.viewport);
      } else {
        // 크기 정보가 없는 경우 매우 가깝게 줌인
        map.panTo(place.geometry.location);
        map.setZoom(18);
      }
    }
  };

  const totalSpots = itinerary.reduce((acc, day) => acc + day.items.length, 0);

  // Robust Error Boundaries
  if (loadError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-red-50 text-red-500 font-sans p-10 text-center">
        <AlertCircle size={48} className="mb-4" />
        <h1 className="text-2xl font-black mb-2">Map Load Error</h1>
        <p className="font-bold">{loadError.message}</p>
      </div>
    );
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-orange-50 text-orange-500 font-sans p-10 text-center">
        <AlertCircle size={48} className="mb-4" />
        <h1 className="text-2xl font-black mb-2">API Key Missing</h1>
        <p className="font-bold">Please check your .env file.</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-screen flex flex-col items-center justify-center font-sans bg-white text-gray-400">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="font-black tracking-widest">LOADING WORLD...</div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-[#f8f9fa] overflow-hidden font-sans" style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      
      {/* SIDEBAR UI */}
      {sidebarOpen && (
        <aside 
          className="absolute top-6 left-6 bottom-6 w-[400px] bg-white/95 backdrop-blur-2xl rounded-[32px] shadow-2xl border border-white/50 flex flex-col overflow-hidden z-[1000] transition-all duration-300"
          style={{ position: 'absolute', top: '24px', left: '24px', bottom: '24px', width: '400px', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: '32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}
        >
          {/* Header */}
          <div className="p-10 pb-6 flex items-center justify-between" style={{ padding: '40px 40px 24px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-gray-900">WorldPro</h1>
              <p className="text-[10px] font-extrabold text-blue-500 uppercase tracking-[0.3em] mt-1">Global Travel Planner</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setViewMode('favorites')}
                className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${viewMode === 'favorites' ? 'bg-red-500 text-white shadow-lg shadow-red-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                title="Favorites"
              >
                <Heart size={20} fill={viewMode === 'favorites' ? "currentColor" : "none"} />
              </button>
              <button 
                onClick={() => setViewMode('itinerary')}
                className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${viewMode === 'itinerary' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                title="Planner"
              >
                <Calendar size={20} />
              </button>
            </div>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto px-10 custom-scroll">
            <div className="space-y-2 pb-10">

              {/* --- FAVORITES MODE --- */}
              {viewMode === 'favorites' && (
                <>
                  <h2 className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-4">Saved Places</h2>
                  {favorites.length === 0 ? (
                    <div className="p-6 border-2 border-dashed border-red-100 rounded-2xl text-center">
                      <Heart size={32} className="mx-auto text-red-100 mb-2" />
                      <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">No places saved yet</p>
                    </div>
                  ) : (
                    favorites.map((loc) => (
                      <div 
                        key={`fav-list-${loc.name}`}
                        onClick={() => {
                          setSelectedPlace(loc);
                          map?.panTo({ lat: loc.lat, lng: loc.lng });
                          map?.setZoom(18);
                        }}
                        className={`group flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all ${selectedPlace?.name === loc.name ? 'bg-red-50' : 'hover:bg-gray-50 border border-transparent hover:border-red-50'}`}
                      >
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-2xl shadow-sm border border-gray-50">{loc.emoji}</div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-gray-900 truncate">{loc.name}</h3>
                          <p className="text-[10px] font-bold text-gray-300 uppercase truncate mt-1">{loc.loc}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); toggleFavorite(loc); }} className="p-2 bg-red-50 border-red-100 text-red-500 rounded-xl hover:bg-red-100 transition-all">
                          <Heart size={16} fill="currentColor" />
                        </button>
                      </div>
                    ))
                  )}
                </>
              )}

              {/* --- ITINERARY MODE --- */}
              {viewMode === 'itinerary' && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">My Planner</h2>
                    <button onClick={addDay} className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors">
                      <PlusCircle size={12} /> ADD DAY
                    </button>
                  </div>

                  {itinerary.map((dayPlan, dIdx) => (
                    <div key={dayPlan.day} className="mb-8">
                      <div 
                        onClick={() => setActiveDay(dayPlan.day)}
                        className={`flex items-center justify-between mb-3 px-2 py-2 rounded-lg cursor-pointer transition-colors ${activeDay === dayPlan.day ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      >
                        <h3 className={`text-xs font-black uppercase tracking-widest ${activeDay === dayPlan.day ? 'text-blue-600' : 'text-gray-400'}`}>
                          Day {dayPlan.day} {activeDay === dayPlan.day && '• Active'}
                        </h3>
                        <span className="text-[10px] font-bold text-gray-400">{dayPlan.items.length} spots</span>
                      </div>

                      {dayPlan.items.length === 0 ? (
                        <div className="p-6 border-2 border-dashed border-gray-100 rounded-2xl text-center">
                          <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">Empty</p>
                        </div>
                      ) : (
                        dayPlan.items.map((item) => (
                          <div key={item.id} className="flex items-center gap-4 p-4 bg-white border-2 border-gray-50 rounded-2xl mb-2 hover:border-blue-100 transition-all shadow-sm">
                            <div className="text-2xl">{item.emoji}</div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-bold text-gray-900 truncate">{item.name}</h3>
                              <p className="text-[9px] font-black text-blue-400 uppercase tracking-tighter">{item.cat}</p>
                            </div>
                            <button onClick={() => removeFromItinerary(dIdx, item.id)} className="p-2 text-gray-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-8 border-t border-gray-50 bg-gray-50/30 flex justify-between items-center">
            <span className="text-[10px] font-black text-gray-900">{favorites.length} SAVED • {totalSpots} PLANNED</span>
            <button onClick={() => setSidebarOpen(false)} className="text-[10px] font-black text-gray-400 hover:text-gray-900">CLOSE</button>
          </div>
        </aside>
      )}

      {/* MAP VIEWPORT */}
      <main className="absolute inset-0 z-0" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} className="absolute top-6 left-6 z-[2000] w-14 h-14 bg-white rounded-2xl shadow-2xl flex items-center justify-center text-blue-600 hover:scale-110 transition-all border border-white" style={{ position: 'absolute', top: '24px', left: '24px', zIndex: 2000, width: '56px', height: '56px', backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
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
          onClick={() => setSelectedPlace(null)}
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
              <div className="p-6 min-w-[280px]" style={{ padding: '20px', minWidth: '280px', fontFamily: 'sans-serif' }}>
                <div className="flex items-center justify-between mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="text-4xl" style={{ fontSize: '36px' }}>{selectedPlace.emoji}</span>
                    <h3 className="text-lg font-black text-gray-900 tracking-tight" style={{ fontSize: '18px', fontWeight: '900', margin: 0, color: '#111827' }}>{selectedPlace.name}</h3>
                  </div>
                </div>
                
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2" style={{ fontSize: '10px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MapPin size={14} className="text-blue-500" /> {selectedPlace.loc}
                </p>
                
                <div className="flex gap-2" style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => addToItinerary(selectedPlace)} 
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-xs font-black shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all"
                    style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: 'white', borderRadius: '12px', fontSize: '12px', fontWeight: '900', border: 'none', cursor: 'pointer' }}
                  >
                    Add to Day {activeDay}
                  </button>
                  <button 
                    onClick={() => toggleFavorite(selectedPlace)} 
                    className={`p-3 rounded-xl border-2 transition-all ${isFavorite(selectedPlace) ? 'bg-red-50 border-red-100 text-red-500' : 'bg-white border-gray-100 text-gray-400'}`}
                    style={{ padding: '12px', borderRadius: '12px', border: `2px solid ${isFavorite(selectedPlace) ? '#fee2e2' : '#f3f4f6'}`, backgroundColor: isFavorite(selectedPlace) ? '#fef2f2' : 'white', color: isFavorite(selectedPlace) ? '#ef4444' : '#9ca3af', cursor: 'pointer' }}
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
