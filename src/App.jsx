import React, { useState, useCallback, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Autocomplete } from '@react-google-maps/api';
import { Search, MapPin, Calendar, Plus, Trash2, Menu, X, Navigation, Star, Globe, Compass, Zap, ArrowRight, Download, RefreshCw, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { allLocations } from './data';
import './index.css';

// --- CONSTANTS ---
const HK_CENTER = { lat: 22.2891, lng: 114.1924 };
const MAP_LIBRARIES = ['places'];
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const containerStyle = {
  width: '100%',
  height: '100%'
};

const mapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  styles: [
    { featureType: 'all', elementType: 'geometry.fill', stylers: [{ weight: '2.00' }] },
    { featureType: 'all', elementType: 'geometry.stroke', stylers: [{ color: '#9c9c9c' }] },
    { featureType: 'all', elementType: 'labels.text', stylers: [{ visibility: 'on' }] },
    { featureType: 'landscape', elementType: 'all', stylers: [{ color: '#f2f2f2' }] },
    { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
    { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'all', stylers: [{ saturation: -100 }, { lightness: 45 }] },
    { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#eeeeee' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7b7b7b' }] },
    { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.highway', elementType: 'all', stylers: [{ visibility: 'simplified' }] },
    { featureType: 'road.arterial', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'all', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'all', stylers: [{ color: '#e7f1ff' }, { visibility: 'on' }] }
  ]
};

function App() {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAP_LIBRARIES
  });

  const [map, setMap] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [itinerary, setItinerary] = useState(() => {
    const saved = localStorage.getItem('hk_planner_v6');
    return saved ? JSON.parse(saved) : [{ day: 1, items: [] }];
  });
  const [searchResult, setSearchResult] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('explore');
  const [sidebarSearch, setSidebarSearch] = useState('');

  const saveItinerary = (newItinerary) => {
    setItinerary(newItinerary);
    localStorage.setItem('hk_planner_v6', JSON.stringify(newItinerary));
  };

  const addToItinerary = (place, dayIndex = 0) => {
    const newItinerary = [...itinerary];
    newItinerary[dayIndex].items.push({
      ...place,
      id: Date.now(),
      addedAt: new Date().toISOString(),
      time: '10:00 AM'
    });
    saveItinerary(newItinerary);
  };

  const removeFromItinerary = (dayIndex, itemId) => {
    const newItinerary = [...itinerary];
    newItinerary[dayIndex].items = newItinerary[dayIndex].items.filter(i => i.id !== itemId);
    saveItinerary(newItinerary);
  };

  const addDay = () => {
    saveItinerary([...itinerary, { day: itinerary.length + 1, items: [] }]);
  };

  const clearAll = () => {
    if (window.confirm('Reset all plans?')) {
      saveItinerary([{ day: 1, items: [] }]);
    }
  };

  const autocompleteRef = React.useRef(null);

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
      cat: 'search',
      desc: place.formatted_address,
      emoji: '📍',
      type: 'search'
    };

    setSearchResult(newPlace);
    setSelectedPlace(newPlace);
    if (map) {
      map.panTo(place.geometry.location);
      map.setZoom(16);
    }
  };

  const filteredLocations = useMemo(() => {
    let result = allLocations;
    if (activeCategory !== 'all') {
      result = result.filter(loc => loc.type === activeCategory);
    }
    if (sidebarSearch) {
      const q = sidebarSearch.toLowerCase();
      result = result.filter(loc => 
        loc.name.toLowerCase().includes(q) || 
        loc.loc.toLowerCase().includes(q)
      );
    }
    return result;
  }, [activeCategory, sidebarSearch]);

  const onLoad = useCallback(function callback(map) {
    setMap(map);
  }, []);

  const onUnmount = useCallback(function callback(map) {
    setMap(null);
  }, []);

  if (!isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Pristine Navigator</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* --- SIDEBAR --- */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside 
            initial={{ x: -500, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -500, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="modern-sidebar"
          >
            <div className="p-10 flex flex-col h-full bg-white">
              <div className="flex items-center justify-between mb-10">
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
                    World<span className="text-blue-600">Pro</span>
                  </h1>
                  <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mt-1">Travel Concierge</p>
                </div>
                <button 
                  onClick={() => setSidebarOpen(false)} 
                  className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors text-gray-400"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modern Tabs */}
              <div className="modern-tabs">
                <button 
                  onClick={() => setActiveTab('explore')}
                  className={`modern-tab ${activeTab === 'explore' ? 'active' : ''}`}
                >
                  Explore
                </button>
                <button 
                  onClick={() => setActiveTab('planner')}
                  className={`modern-tab ${activeTab === 'planner' ? 'active' : ''}`}
                >
                  Planner
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scroll">
                {activeTab === 'explore' ? (
                  <div className="space-y-8">
                    <div className="space-y-4">
                      {/* Search Bar */}
                      <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-blue-500 transition-colors" size={18} />
                        <input 
                          type="text" 
                          placeholder="Search locations..."
                          value={sidebarSearch}
                          onChange={(e) => setSidebarSearch(e.target.value)}
                          className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all border border-transparent focus:border-blue-200"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {['all', 'tour', 'tart', 'food', 'korean', 'noodle'].map(cat => (
                          <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`pill ${activeCategory === cat ? 'active' : ''}`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 pb-10">
                      {filteredLocations.map((loc) => (
                        <div 
                          key={loc.name}
                          onClick={() => {
                            setSelectedPlace(loc);
                            map.panTo({ lat: loc.lat, lng: loc.lng });
                            map.setZoom(17);
                          }}
                          className={`location-item ${selectedPlace?.name === loc.name ? 'bg-blue-50 ring-1 ring-blue-100' : ''}`}
                        >
                          <div className="emoji-box">{loc.emoji}</div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold text-gray-900 truncate">{loc.name}</h3>
                            <p className="text-[10px] font-medium text-gray-400 mt-1 uppercase tracking-tight">{loc.loc}</p>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); addToItinerary(loc); }}
                            className="w-8 h-8 rounded-full hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center bg-gray-100 text-gray-400"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8 pb-10">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold text-gray-900">Your Trip</h2>
                      <div className="flex gap-2">
                        <button onClick={addDay} className="modern-btn-soft modern-btn px-4 py-2 text-[10px]">
                          + Day
                        </button>
                        <button onClick={clearAll} className="w-8 h-8 rounded-full bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all">
                          <RefreshCw size={14} />
                        </button>
                      </div>
                    </div>

                    {itinerary.map((day, dIdx) => (
                      <div key={dIdx} className="mb-8 group">
                        <div className="flex items-center justify-between mb-4 px-2">
                          <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-widest">Day {day.day}</h3>
                          <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded-lg">{day.items.length} spots</span>
                        </div>
                        
                        <div className="space-y-3">
                          {day.items.length === 0 ? (
                            <div className="py-10 text-center border-2 border-dashed border-gray-100 rounded-2xl">
                              <p className="text-[10px] font-bold text-gray-300 uppercase">Empty Grid</p>
                            </div>
                          ) : (
                            day.items.map((item) => (
                              <div key={item.id} className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-2xl hover:border-blue-200 transition-all hover:shadow-sm">
                                <span className="text-xl">{item.emoji}</span>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-[13px] font-bold text-gray-900 truncate leading-tight">{item.name}</h4>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase">{item.cat}</span>
                                    <span className="w-1 h-1 bg-gray-200 rounded-full"></span>
                                    <span className="text-[9px] font-bold text-blue-500">10:00 AM</span>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => removeFromItinerary(dIdx, item.id)}
                                  className="w-8 h-8 rounded-full hover:bg-red-50 text-gray-200 hover:text-red-500 transition-all flex items-center justify-center"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* --- MAIN CONTENT --- */}
      <main className="map-viewport">
        {!sidebarOpen && (
          <button 
            onClick={() => setSidebarOpen(true)}
            className="absolute top-8 left-8 z-[200] w-14 h-14 bg-white border border-gray-100 rounded-2xl shadow-xl flex items-center justify-center hover:scale-105 transition-all text-blue-600"
          >
            <Menu size={24} />
          </button>
        )}

        {/* Global Clean Search */}
        <div className="modern-search-bar">
          <div className="modern-search-icon">
            <Search size={20} />
          </div>
          <Autocomplete
            onLoad={(autocomplete) => { autocompleteRef.current = autocomplete; }}
            onPlaceChanged={onPlaceSelected}
            className="flex-1"
          >
            <input 
              type="text" 
              placeholder="Search destination..." 
              className="placeholder:text-gray-300"
            />
          </Autocomplete>
          <div className="p-1">
            <button className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white hover:bg-blue-700 transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* MAP */}
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={HK_CENTER}
          zoom={3}
          onLoad={onLoad}
          onUnmount={onUnmount}
          options={mapOptions}
          onClick={() => setSelectedPlace(null)}
        >
          {filteredLocations.map(loc => (
            <Marker
              key={loc.name}
              position={{ lat: loc.lat, lng: loc.lng }}
              onClick={() => setSelectedPlace(loc)}
              icon={{
                url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="20" r="16" fill="white" stroke="%23006ADC" stroke-width="3"/>
                    <text x="20" y="26" font-size="18" text-anchor="middle">${loc.emoji}</text>
                  </svg>
                `)}`,
                scaledSize: new window.google.maps.Size(40, 40),
                anchor: new window.google.maps.Point(20, 20)
              }}
            />
          ))}

          {searchResult && (
            <Marker
              position={{ lat: searchResult.lat, lng: searchResult.lng }}
              icon={{
                url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                  <svg width="50" height="50" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="25" cy="25" r="20" fill="%23006ADC" stroke="white" stroke-width="4"/>
                    <text x="25" y="32" font-size="22" text-anchor="middle">📍</text>
                  </svg>
                `)}`,
                scaledSize: new window.google.maps.Size(50, 50),
                anchor: new window.google.maps.Point(25, 25)
              }}
            />
          )}

          <AnimatePresence>
            {selectedPlace && (
              <InfoWindow
                position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }}
                onCloseClick={() => setSelectedPlace(null)}
              >
                <div className="p-6 min-w-[280px] max-w-[320px] bg-white rounded-3xl">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="text-4xl">{selectedPlace.emoji}</div>
                    <h3 className="text-lg font-extrabold text-gray-900 tracking-tight leading-tight">{selectedPlace.name}</h3>
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin size={12} className="text-blue-500" />
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{selectedPlace.loc}</p>
                  </div>
                  <p className="text-xs font-medium text-gray-500 leading-relaxed mb-6 border-l-2 border-gray-100 pl-4">{selectedPlace.desc}</p>
                  <button 
                    onClick={() => addToItinerary(selectedPlace)}
                    className="w-full modern-btn py-4 shadow-lg shadow-blue-100"
                  >
                    Add to Itinerary
                  </button>
                </div>
              </InfoWindow>
            )}
          </AnimatePresence>
        </GoogleMap>

        {/* Minimal Metrics */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-8 right-8 bg-white/90 backdrop-blur-lg border border-white/50 rounded-3xl px-6 py-4 shadow-2xl flex items-center gap-4"
        >
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
            <Globe size={24} />
          </div>
          <div>
            <p className="text-[9px] font-extrabold text-gray-300 uppercase tracking-widest">Total Spots</p>
            <h4 className="text-2xl font-black text-gray-900 leading-none mt-1">
              {itinerary.reduce((acc, day) => acc + day.items.length, 0)}
            </h4>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

export default App;
