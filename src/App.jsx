import React, { useState, useCallback, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Autocomplete } from '@react-google-maps/api';
import { Search, MapPin, Calendar, Plus, Trash2, Menu, X, Navigation, Star, Globe, Compass, Zap } from 'lucide-react';
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
    { elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { elementType: 'labels.text.stroke', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#9d00ff' }, { weight: 8 }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#00fc9a' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#000000' }, { weight: 2 }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ff4d00' }, { weight: 4 }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#00d4ff' }] },
  ]
};

const getCategoryColor = (cat) => {
  switch (cat) {
    case 'tour': return 'cat-tour';
    case 'food': return 'cat-food';
    case 'korean': return 'cat-korean';
    case 'noodle': return 'cat-noodle';
    case 'tart': return 'cat-tart';
    case 'search': return 'cat-search';
    default: return 'bg-white';
  }
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
    const saved = localStorage.getItem('hk_planner_v4');
    return saved ? JSON.parse(saved) : [{ day: 1, items: [] }];
  });
  const [searchResult, setSearchResult] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('explore');

  const saveItinerary = (newItinerary) => {
    setItinerary(newItinerary);
    localStorage.setItem('hk_planner_v4', JSON.stringify(newItinerary));
  };

  const addToItinerary = (place, dayIndex = 0) => {
    const newItinerary = [...itinerary];
    newItinerary[dayIndex].items.push({
      ...place,
      id: Date.now(),
      addedAt: new Date().toISOString()
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
      emoji: '🌍',
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
    if (activeCategory === 'all') return allLocations;
    return allLocations.filter(loc => loc.type === activeCategory);
  }, [activeCategory]);

  const onLoad = useCallback(function callback(map) {
    setMap(map);
  }, []);

  const onUnmount = useCallback(function callback(map) {
    setMap(null);
  }, []);

  if (!isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#00d4ff]">
        <div className="neo-card p-16 text-center rotate-3 scale-110">
          <div className="w-24 h-24 bg-[#ff4d00] border-8 border-black shadow-[8px_8px_0px_#000] flex items-center justify-center mx-auto mb-8 animate-spin">
            <Zap size={48} color="white" />
          </div>
          <h2 className="text-5xl font-black italic">LOADING...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* --- SIDEBAR --- */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside 
            initial={{ x: -600 }}
            animate={{ x: 0 }}
            exit={{ x: -600 }}
            className="brutal-sidebar"
          >
            <div className="checkered" />
            <div className="p-10 flex flex-col h-full bg-white">
              <div className="flex items-center justify-between mb-10">
                <div className="relative">
                  <h1 className="text-5xl font-black italic tracking-tighter leading-none relative z-10">
                    WORLD<span className="text-[#9d00ff]">PRO</span>
                  </h1>
                  <div className="absolute -bottom-2 -right-4 w-full h-4 bg-[#ebf500] -z-0 rotate-1"></div>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="w-14 h-14 border-4 border-black hover:bg-[#ff4d00] transition-colors flex items-center justify-center">
                  <X size={32} />
                </button>
              </div>

              {/* Multi-Color Tabs */}
              <div className="brutal-tabs mb-10">
                <button 
                  onClick={() => setActiveTab('explore')}
                  className={`brutal-tab ${activeTab === 'explore' ? 'active-explore' : 'inactive'}`}
                >
                  EXPLORE
                </button>
                <button 
                  onClick={() => setActiveTab('planner')}
                  className={`brutal-tab ${activeTab === 'planner' ? 'active-planner' : 'inactive'}`}
                >
                  PLANNER
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-4">
                {activeTab === 'explore' ? (
                  <div className="space-y-10">
                    <div className="bg-black text-white p-4 border-4 border-black flex justify-between items-center rotate-1">
                      <h2 className="text-sm font-black tracking-[0.2em] flex items-center gap-2">
                        <Globe size={20} /> DISCOVERY GRID
                      </h2>
                      <span className="text-[10px] bg-[#00fc9a] text-black px-3 py-1 font-black">FEATURE: HK</span>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {['all', 'tour', 'tart', 'food', 'korean', 'noodle'].map(cat => (
                        <button
                          key={cat}
                          onClick={() => setActiveCategory(cat)}
                          className={`px-4 py-2 border-4 border-black font-black text-xs uppercase transition-all ${activeCategory === cat ? 'bg-black text-white shadow-[4px_4px_0px_#ff4d00]' : 'bg-white hover:bg-[#f6f6f6]'}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-6">
                      {filteredLocations.map((loc) => (
                        <div 
                          key={loc.name}
                          onClick={() => {
                            setSelectedPlace(loc);
                            map.panTo({ lat: loc.lat, lng: loc.lng });
                            map.setZoom(17);
                          }}
                          className={`brutal-item cursor-pointer group ${getCategoryColor(loc.type)} ${selectedPlace?.name === loc.name ? 'ring-8 ring-black ring-inset' : ''}`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                              <div className="w-16 h-16 bg-white border-4 border-black flex items-center justify-center text-4xl shadow-[4px_4px_0px_#000]">
                                {loc.emoji}
                              </div>
                              <div>
                                <h3 className="text-2xl font-black tracking-tight leading-none">{loc.name}</h3>
                                <p className="text-[10px] font-black uppercase mt-2 bg-black text-white px-2 py-0.5 inline-block">{loc.loc}</p>
                              </div>
                            </div>
                            <button 
                              onClick={(e) => { e.stopPropagation(); addToItinerary(loc); }}
                              className="w-12 h-12 bg-white border-4 border-black flex items-center justify-center hover:bg-black hover:text-white transition-all shadow-[4px_4px_0px_#000] active:translate-y-1 active:shadow-none"
                            >
                              <Plus size={28} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-10">
                    <div className="flex items-center justify-between border-b-8 border-black pb-6">
                      <h2 className="text-4xl font-black italic">ITINERARY</h2>
                      <button onClick={addDay} className="neo-btn bg-[#00fc9a]">
                        + ADD DAY
                      </button>
                    </div>

                    {itinerary.map((day, dIdx) => (
                      <div key={dIdx} className="border-8 border-black bg-white mb-8 shadow-[10px_10px_0px_#9d00ff]">
                        <div className="bg-[#ebf500] border-b-8 border-black p-6 flex justify-between items-center">
                          <h3 className="text-2xl font-black italic">DAY {day.day}</h3>
                          <div className="bg-black text-white px-3 py-1 font-black text-xs uppercase tracking-widest">{day.items.length} SPOTS</div>
                        </div>
                        <div className="p-8 space-y-4">
                          {day.items.length === 0 ? (
                            <div className="py-16 text-center border-8 border-dashed border-black/10">
                              <p className="text-sm font-black uppercase text-black/20">AWAITING ADVENTURE</p>
                            </div>
                          ) : (
                            day.items.map((item) => (
                              <div key={item.id} className={`flex items-center gap-6 border-4 border-black p-5 shadow-[4px_4px_0px_#000] group transition-all hover:-translate-y-1 ${getCategoryColor(item.type)}`}>
                                <span className="text-3xl">{item.emoji}</span>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-lg font-black uppercase truncate leading-none">{item.name}</h4>
                                  <p className="text-[10px] font-black uppercase mt-1 opacity-70">{item.cat}</p>
                                </div>
                                <button 
                                  onClick={() => removeFromItinerary(dIdx, item.id)}
                                  className="w-10 h-10 bg-white border-4 border-black flex items-center justify-center hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 size={20} />
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
            className="absolute top-10 left-10 z-[200] w-20 h-20 bg-[#ebf500] border-8 border-black shadow-[8px_8px_0px_#000] flex items-center justify-center hover:-translate-y-1 hover:shadow-[12px_12px_0px_#000] transition-all"
          >
            <Menu size={40} />
          </button>
        )}

        {/* Global Kaleidoscope Search */}
        <div className="brutal-search-container">
          <Autocomplete
            onLoad={(autocomplete) => { autocompleteRef.current = autocomplete; }}
            onPlaceChanged={onPlaceSelected}
            className="flex-1"
          >
            <input 
              type="text" 
              placeholder="SEARCH THE KALEIDOSCOPE..." 
              className="placeholder:text-black/30"
            />
          </Autocomplete>
          <button className="brutal-search-btn">
            <Search size={32} />
          </button>
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
                path: window.google?.maps.SymbolPath.CIRCLE,
                fillColor: loc.type === 'tour' ? '#ebf500' : loc.type === 'food' ? '#ff4d00' : loc.type === 'korean' ? '#00d4ff' : loc.type === 'noodle' ? '#00fc9a' : '#ff85e4',
                fillOpacity: 1,
                strokeColor: '#000',
                strokeWeight: 4,
                scale: 15
              }}
            />
          ))}

          {searchResult && (
            <Marker
              position={{ lat: searchResult.lat, lng: searchResult.lng }}
              icon={{
                path: window.google?.maps.SymbolPath.CIRCLE,
                fillColor: '#9d00ff',
                fillOpacity: 1,
                strokeColor: '#000',
                strokeWeight: 6,
                scale: 20
              }}
            />
          )}

          <AnimatePresence>
            {selectedPlace && (
              <InfoWindow
                position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }}
                onCloseClick={() => setSelectedPlace(null)}
              >
                <div className={`p-8 min-w-[320px] max-w-[400px] border-8 border-black shadow-[12px_12px_0px_#000] ${getCategoryColor(selectedPlace.type)}`}>
                  <div className="flex items-center gap-6 mb-6">
                    <div className="w-20 h-20 bg-white border-4 border-black flex items-center justify-center text-5xl shadow-[6px_6px_0px_#000]">
                      {selectedPlace.emoji}
                    </div>
                    <h3 className="text-3xl font-black italic tracking-tighter uppercase leading-none">{selectedPlace.name}</h3>
                  </div>
                  <div className="bg-white border-4 border-black p-3 mb-6 rotate-1">
                    <p className="text-xs font-black uppercase flex items-center gap-2">
                      <MapPin size={16} /> {selectedPlace.loc}
                    </p>
                  </div>
                  <p className="text-sm font-bold leading-relaxed mb-10 bg-black text-white p-4 border-4 border-black">{selectedPlace.desc}</p>
                  <button 
                    onClick={() => addToItinerary(selectedPlace)}
                    className="w-full h-16 bg-white border-4 border-black font-black text-lg uppercase shadow-[8px_8px_0px_#000] hover:-translate-y-1 hover:shadow-[12px_12px_0px_#000] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-3"
                  >
                    <Plus size={24} /> ADD TO TRIP
                  </button>
                </div>
              </InfoWindow>
            )}
          </AnimatePresence>
        </GoogleMap>

        {/* Global Metrics */}
        <div className="brutal-metric">
          <div className="w-20 h-20 bg-black border-4 border-white flex items-center justify-center shadow-[6px_6px_0px_#ff4d00]">
            <Navigation size={40} color="white" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.6em] mb-1 text-black/60">WORLD TRACKER</p>
            <h4 className="text-5xl font-black leading-none tracking-tighter">
              {itinerary.reduce((acc, day) => acc + day.items.length, 0)}
            </h4>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
