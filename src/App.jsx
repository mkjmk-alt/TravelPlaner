import React, { useState, useCallback, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Autocomplete } from '@react-google-maps/api';
import { Search, MapPin, Plus, Trash2, Menu, X, Globe, Compass, ChevronRight, Settings2, MoreVertical, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { allLocations } from './data';
import './index.css';

// --- CONSTANTS ---
const HK_CENTER = { lat: 22.2891, lng: 114.1924 };
const MAP_LIBRARIES = ['places'];
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const containerStyle = { width: '100%', height: '100%' };

const mapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  styles: [
    { featureType: 'all', elementType: 'geometry.fill', stylers: [{ weight: '2.00' }] },
    { featureType: 'all', elementType: 'geometry.stroke', stylers: [{ color: '#9c9c9c' }] },
    { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
    { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#f5f5f5' }] },
    { featureType: 'water', elementType: 'all', stylers: [{ color: '#f0f7ff' }] }
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
    const saved = localStorage.getItem('world_pro_v7');
    return saved ? JSON.parse(saved) : [{ day: 1, items: [] }];
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState('explore'); // 'explore' or 'itinerary'
  const [searchQuery, setSearchQuery] = useState('');

  const saveItinerary = (newItinerary) => {
    setItinerary(newItinerary);
    localStorage.setItem('world_pro_v7', JSON.stringify(newItinerary));
  };

  const addToItinerary = (place) => {
    const newItinerary = [...itinerary];
    // Always add to the first day for simplicity in this optimized UI
    newItinerary[0].items.push({ ...place, id: Date.now() });
    saveItinerary(newItinerary);
  };

  const removeFromItinerary = (itemId) => {
    const newItinerary = [...itinerary];
    newItinerary[0].items = newItinerary[0].items.filter(i => i.id !== itemId);
    saveItinerary(newItinerary);
  };

  const filteredLocations = useMemo(() => {
    return allLocations.filter(loc => {
      const matchesCat = activeCategory === 'all' || loc.type === activeCategory;
      const matchesSearch = loc.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           loc.loc.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [activeCategory, searchQuery]);

  if (!isLoaded) return <div className="h-screen flex items-center justify-center font-medium text-gray-400">Loading Map...</div>;

  return (
    <div className="app-shell bg-[#f8f9fa]">
      {/* --- MINIMAL SIDEBAR --- */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside 
            initial={{ x: -400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -400, opacity: 0 }}
            className="w-[400px] h-full bg-white rounded-[24px] shadow-sm border border-gray-100 flex flex-col overflow-hidden z-50"
          >
            {/* Header */}
            <div className="p-8 pb-4 flex items-center justify-between">
              <h1 className="text-xl font-bold tracking-tight text-gray-900">WorldPro</h1>
              <div className="flex gap-2">
                <button onClick={() => setViewMode(viewMode === 'explore' ? 'itinerary' : 'explore')} className="p-2 hover:bg-gray-50 rounded-lg text-gray-400">
                  <Calendar size={20} />
                </button>
                <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-gray-50 rounded-lg text-gray-400">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Smart Search & Filter */}
            <div className="px-8 mb-6">
              <div className="relative group mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                <input 
                  type="text" 
                  placeholder="Find a place..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                {['all', 'tour', 'food', 'tart'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all ${activeCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto px-8 custom-scroll">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[10px] font-extrabold text-gray-300 uppercase tracking-[0.2em]">
                  {viewMode === 'explore' ? 'Discovery' : 'Your Itinerary'}
                </h2>
                {viewMode === 'itinerary' && (
                   <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                     {itinerary[0].items.length} SAVED
                   </span>
                )}
              </div>

              <div className="space-y-1 pb-10">
                {viewMode === 'explore' ? (
                  filteredLocations.map((loc) => (
                    <div 
                      key={loc.name}
                      onClick={() => {
                        setSelectedPlace(loc);
                        map.panTo({ lat: loc.lat, lng: loc.lng });
                        map.setZoom(16);
                      }}
                      className="group flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors"
                    >
                      <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-xl shadow-sm border border-gray-50">
                        {loc.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">{loc.name}</h3>
                        <p className="text-[10px] text-gray-400 truncate">{loc.loc}</p>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); addToItinerary(loc); }}
                        className="opacity-0 group-hover:opacity-100 p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  ))
                ) : (
                  itinerary[0].items.length === 0 ? (
                    <p className="text-xs text-center text-gray-300 py-20">No saved places yet.</p>
                  ) : (
                    itinerary[0].items.map((item) => (
                      <div key={item.id} className="flex items-center gap-4 p-3 bg-white border border-gray-50 rounded-xl mb-2 hover:border-blue-100 transition-all">
                        <div className="text-lg">{item.emoji}</div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-gray-900 truncate">{item.name}</h3>
                          <p className="text-[9px] text-gray-400 uppercase font-bold">{item.cat}</p>
                        </div>
                        <button onClick={() => removeFromItinerary(item.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  )
                )}
              </div>
            </div>

            {/* Bottom Utility Bar */}
            <div className="p-6 border-t border-gray-50 bg-gray-50/30 flex justify-between items-center">
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                 <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Live Sync</span>
              </div>
              <button className="text-[10px] font-bold text-gray-400 hover:text-gray-900 transition-colors">
                SETTINGS
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* --- MAP VIEWPORT --- */}
      <main className="flex-1 relative h-full">
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} className="absolute top-8 left-8 z-[100] w-12 h-12 bg-white rounded-xl shadow-xl flex items-center justify-center text-blue-600">
            <Menu size={24} />
          </button>
        )}

        {/* Minimal Search Bar Overlay */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4">
          <div className="bg-white/80 backdrop-blur-md border border-white/50 rounded-2xl shadow-2xl p-2 flex items-center">
             <div className="flex-1 px-4 text-sm font-medium text-gray-400">
               <Autocomplete
                onLoad={(a) => {}}
                onPlaceChanged={() => {}}
               >
                 <input type="text" placeholder="Search the world..." className="w-full bg-transparent outline-none text-gray-900 placeholder:text-gray-300" />
               </Autocomplete>
             </div>
             <button className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-100">
               <Search size={18} />
             </button>
          </div>
        </div>

        <GoogleMap
          mapContainerStyle={containerStyle}
          center={HK_CENTER}
          zoom={3}
          onLoad={(m) => setMap(m)}
          options={mapOptions}
        >
          {filteredLocations.map(loc => (
            <Marker
              key={loc.name}
              position={{ lat: loc.lat, lng: loc.lng }}
              onClick={() => setSelectedPlace(loc)}
              icon={{
                url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="16" cy="16" r="14" fill="white" stroke="%23006ADC" stroke-width="2"/>
                    <text x="16" y="21" font-size="14" text-anchor="middle">${loc.emoji}</text>
                  </svg>
                `)}`,
                scaledSize: new window.google.maps.Size(32, 32),
                anchor: new window.google.maps.Point(16, 16)
              }}
            />
          ))}

          <AnimatePresence>
            {selectedPlace && (
              <InfoWindow position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }} onCloseClick={() => setSelectedPlace(null)}>
                <div className="p-4 min-w-[240px]">
                  <h3 className="text-sm font-bold mb-1">{selectedPlace.name}</h3>
                  <p className="text-[10px] text-gray-400 mb-4">{selectedPlace.loc}</p>
                  <button 
                    onClick={() => addToItinerary(selectedPlace)}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg text-[11px] font-bold shadow-lg shadow-blue-50"
                  >
                    Add to Trip
                  </button>
                </div>
              </InfoWindow>
            )}
          </AnimatePresence>
        </GoogleMap>
      </main>
    </div>
  );
}

export default App;
