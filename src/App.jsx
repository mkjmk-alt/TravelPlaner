import React, { useState, useCallback, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Autocomplete } from '@react-google-maps/api';
import { Search, MapPin, Calendar, Plus, Trash2, ChevronRight, Menu, X, Navigation, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { allLocations } from './data';
import './index.css';

// --- CONSTANTS ---
const HK_CENTER = { lat: 22.2891, lng: 114.1924 }; // Alexandra Hotel
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
    { elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1e293b' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#f8fafc' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#14532d' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1e293b' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#475569' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
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
    const saved = localStorage.getItem('hk_planner_v2');
    return saved ? JSON.parse(saved) : [{ day: 1, items: [] }];
  });
  const [searchResult, setSearchResult] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('explore'); // 'explore' or 'planner'

  // --- ACTIONS ---
  const saveItinerary = (newItinerary) => {
    setItinerary(newItinerary);
    localStorage.setItem('hk_planner_v2', JSON.stringify(newItinerary));
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
      cat: 'Search Result',
      desc: place.formatted_address,
      emoji: '🔍',
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
      <div className="flex flex-col items-center justify-center h-screen bg-[#0f172a] text-white">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-8 max-w-md text-center border-orange-500/30"
        >
          <div className="w-16 h-16 bg-orange-500/20 rounded-2xl flex items-center justify-center text-orange-500 mx-auto mb-6">
            <Star size={32} className="animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold mb-4">Google Maps API Key Required</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            To use the interactive map and search features, please insert your Google Maps API Key in <code className="bg-slate-800 px-2 py-1 rounded text-orange-400">src/App.jsx</code>.
          </p>
          <div className="space-y-3">
            <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className="w-1/3 h-full bg-orange-500"></div>
            </div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Waiting for Connection...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* --- SIDEBAR --- */}
      <aside className={`sidebar ${sidebarOpen ? 'w-[420px]' : 'w-0 overflow-hidden'}`}>
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent">
                WORLD PRO
              </h1>
              <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-[0.2em] font-black">Global Travel Designer</p>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="p-2 text-slate-500 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex p-1 bg-slate-800/50 rounded-xl mb-6 border border-white/5">
            <button 
              onClick={() => setActiveTab('explore')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'explore' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              Explore
            </button>
            <button 
              onClick={() => setActiveTab('planner')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'planner' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              Itinerary
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto pr-2">
            {activeTab === 'explore' ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Discovery</h2>
                  <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full font-bold">Featured: HK</span>
                </div>
                {/* Categories */}
                <div className="flex flex-wrap gap-2">
                  {['all', 'tour', 'tart', 'food', 'korean', 'noodle'].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${activeCategory === cat ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-slate-800 border-white/10 text-slate-400 hover:border-white/20'}`}
                    >
                      {cat.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Search in Explore */}
                <div className="relative group">
                   <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-500">
                     <Search size={16} />
                   </div>
                   <input 
                    type="text" 
                    placeholder="Search curated spots..."
                    className="w-100 bg-slate-800/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-orange-500/50 transition-all w-full"
                   />
                </div>

                {/* List */}
                <div className="space-y-3">
                  {filteredLocations.map((loc, idx) => (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.01 }}
                      key={loc.name}
                      onClick={() => {
                        setSelectedPlace(loc);
                        map.panTo({ lat: loc.lat, lng: loc.lng });
                        map.setZoom(17);
                      }}
                      className={`location-card group ${selectedPlace?.name === loc.name ? 'border-orange-500/50 bg-orange-500/5' : ''}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{loc.emoji}</span>
                            <h3 className="font-bold text-slate-200 group-hover:text-orange-400 transition-colors">{loc.name}</h3>
                          </div>
                          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                            <MapPin size={10} /> {loc.loc}
                          </p>
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            addToItinerary(loc);
                          }}
                          className="p-2 bg-slate-700 rounded-lg hover:bg-orange-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Calendar size={20} className="text-orange-500" /> My Trip
                  </h2>
                  <button onClick={addDay} className="text-xs font-bold text-orange-400 hover:text-orange-300">
                    + ADD DAY
                  </button>
                </div>

                {itinerary.map((day, dIdx) => (
                  <div key={dIdx} className="bg-white/5 rounded-2xl p-4 border border-white/5">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-black text-slate-500 uppercase tracking-tighter">Day {day.day}</span>
                      <span className="text-xs text-slate-500">{day.items.length} spots</span>
                    </div>
                    <div className="space-y-3">
                      {day.items.length === 0 ? (
                        <div className="py-8 text-center border-2 border-dashed border-white/5 rounded-xl">
                          <p className="text-xs text-slate-500">No spots added yet</p>
                        </div>
                      ) : (
                        day.items.map((item, iIdx) => (
                          <div key={item.id} className="flex items-center gap-3 bg-slate-800/80 p-3 rounded-xl border border-white/5 group">
                            <span className="text-lg">{item.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold truncate">{item.name}</h4>
                              <p className="text-[10px] text-slate-500 truncate">{item.cat}</p>
                            </div>
                            <button 
                              onClick={() => removeFromItinerary(dIdx, item.id)}
                              className="p-1.5 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
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
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main className="main-content">
        {/* Toggle Button */}
        {!sidebarOpen && (
          <button 
            onClick={() => setSidebarOpen(true)}
            className="absolute top-6 left-6 z-20 p-3 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl text-white hover:bg-orange-500 transition-all"
          >
            <Menu size={24} />
          </button>
        )}

        {/* Floating Google Search */}
        <div className="search-container max-w-md mx-auto">
          <Autocomplete
            onLoad={(autocomplete) => { autocompleteRef.current = autocomplete; }}
            onPlaceChanged={onPlaceSelected}
          >
            <div className="search-input-wrapper group focus-within:border-orange-500/50 transition-all">
              <Search className="text-slate-400 group-focus-within:text-orange-400" size={20} />
              <input 
                type="text" 
                placeholder="Search any place in the world..." 
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // This is a bit tricky with Autocomplete component, 
                    // usually it handles its own selection.
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-slate-700 px-2 py-1 rounded text-slate-400">Powered by Google</span>
              </div>
            </div>
          </Autocomplete>
        </div>

        {/* THE MAP */}
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={HK_CENTER}
          zoom={3}
          onLoad={onLoad}
          onUnmount={onUnmount}
          options={mapOptions}
          onClick={() => setSelectedPlace(null)}
        >
          {/* Markers for Curated Locations */}
          {filteredLocations.map(loc => (
            <Marker
              key={loc.name}
              position={{ lat: loc.lat, lng: loc.lng }}
              onClick={() => setSelectedPlace(loc)}
              icon={{
                url: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${loc.type === 'tour' ? 'gold' : loc.type === 'tart' ? 'orange' : loc.type === 'food' ? 'red' : loc.type === 'korean' ? 'blue' : 'green'}.png`,
                scaledSize: new window.google.maps.Size(25, 41),
              }}
            />
          ))}

          {/* Search Result Marker */}
          {searchResult && (
            <Marker
              position={{ lat: searchResult.lat, lng: searchResult.lng }}
              icon={{
                url: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
                scaledSize: new window.google.maps.Size(30, 50),
              }}
            />
          )}

          {/* Info Window */}
          <AnimatePresence>
            {selectedPlace && (
              <InfoWindow
                position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }}
                onCloseClick={() => setSelectedPlace(null)}
              >
                <div className="p-2 min-w-[200px] max-w-[300px] text-slate-900">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{selectedPlace.emoji}</span>
                    <h3 className="font-bold text-lg leading-tight">{selectedPlace.name}</h3>
                  </div>
                  <p className="text-xs text-slate-500 mb-3 flex items-center gap-1">
                    <MapPin size={10} /> {selectedPlace.loc}
                  </p>
                  <p className="text-sm leading-relaxed mb-4 text-slate-700">{selectedPlace.desc}</p>
                  <button 
                    onClick={() => addToItinerary(selectedPlace)}
                    className="w-full bg-orange-500 text-white py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 hover:bg-orange-600 transition-all shadow-md"
                  >
                    <Plus size={14} /> ADD TO PLAN
                  </button>
                </div>
              </InfoWindow>
            )}
          </AnimatePresence>
        </GoogleMap>

        {/* Floating Quick Stats */}
        <div className="absolute bottom-8 right-8 flex gap-4">
          <div className="glass-panel px-6 py-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-500/20 rounded-2xl flex items-center justify-center text-orange-500">
              <Navigation size={24} />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Planned Spots</p>
              <h4 className="text-2xl font-black">{itinerary.reduce((acc, day) => acc + day.items.length, 0)}</h4>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
