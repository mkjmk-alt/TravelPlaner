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
    const saved = localStorage.getItem('world_pro_v8');
    return saved ? JSON.parse(saved) : [{ day: 1, items: [] }];
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState('explore'); 
  const [searchQuery, setSearchQuery] = useState('');

  const saveItinerary = (newItinerary) => {
    setItinerary(newItinerary);
    localStorage.setItem('world_pro_v8', JSON.stringify(newItinerary));
  };

  const addToItinerary = (place) => {
    const newItinerary = [...itinerary];
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
    <div className="relative w-screen h-screen bg-[#f8f9fa] overflow-hidden">
      
      {/* --- FLOATING SIDEBAR --- */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside 
            initial={{ x: -420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -420, opacity: 0 }}
            className="absolute top-8 left-8 bottom-8 w-[380px] bg-white rounded-[24px] shadow-2xl border border-gray-100 flex flex-col overflow-hidden z-[100]"
          >
            {/* Header */}
            <div className="p-8 pb-4 flex items-center justify-between">
              <h1 className="text-xl font-bold tracking-tight text-gray-900">WorldPro</h1>
              <div className="flex gap-1">
                <button 
                   onClick={() => setViewMode(viewMode === 'explore' ? 'itinerary' : 'explore')} 
                   className={`p-2 rounded-lg transition-colors ${viewMode === 'itinerary' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-50'}`}
                >
                  <Calendar size={18} />
                </button>
                <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-gray-50 rounded-lg text-gray-400">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Smart Search & Filter */}
            <div className="px-8 mb-6">
              <div className="relative group mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                <input 
                  type="text" 
                  placeholder="Find a place..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {['all', 'tour', 'food', 'tart'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${activeCategory === cat ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-8 custom-scroll">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[10px] font-extrabold text-gray-300 uppercase tracking-[0.2em]">
                  {viewMode === 'explore' ? 'Discovery' : 'Itinerary'}
                </h2>
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
                      className="group flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors"
                    >
                      <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center text-lg shadow-sm border border-gray-50">
                        {loc.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[13px] font-semibold text-gray-900 truncate">{loc.name}</h3>
                        <p className="text-[9px] text-gray-400 truncate">{loc.loc}</p>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); addToItinerary(loc); }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  itinerary[0].items.length === 0 ? (
                    <p className="text-[10px] text-center text-gray-300 py-20 font-bold uppercase tracking-widest">No plans yet</p>
                  ) : (
                    itinerary[0].items.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-3 bg-white border border-gray-50 rounded-xl mb-2 hover:border-blue-100 transition-all">
                        <div className="text-base">{item.emoji}</div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xs font-bold text-gray-900 truncate">{item.name}</h3>
                          <p className="text-[8px] text-gray-400 uppercase font-black">{item.cat}</p>
                        </div>
                        <button onClick={() => removeFromItinerary(item.id)} className="p-1.5 text-gray-200 hover:text-red-500 hover:bg-red-50 rounded-lg">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )
                )}
              </div>
            </div>

            {/* Status Footer */}
            <div className="p-5 border-t border-gray-50 bg-gray-50/20 flex justify-between items-center">
              <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">
                {itinerary[0].items.length} Spots Pinned
              </span>
              <button className="text-[9px] font-black text-gray-300 hover:text-blue-600">SYNCED</button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* --- FULL SCREEN MAP --- */}
      <main className="absolute inset-0 z-0">
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} className="absolute top-8 left-8 z-[100] w-12 h-12 bg-white rounded-2xl shadow-2xl flex items-center justify-center text-blue-600 hover:scale-105 transition-transform border border-gray-100">
            <Menu size={24} />
          </button>
        )}

        {/* Floating Search Bar Overlay */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4">
          <div className="bg-white/90 backdrop-blur-lg border border-white/50 rounded-2xl shadow-2xl p-1.5 flex items-center">
             <div className="flex-1 px-4 text-xs font-bold text-gray-900">
               <Autocomplete onLoad={() => {}} onPlaceChanged={() => {}}>
                 <input type="text" placeholder="Search the world..." className="w-full bg-transparent outline-none placeholder:text-gray-300" />
               </Autocomplete>
             </div>
             <button className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-100">
               <Search size={16} />
             </button>
          </div>
        </div>

        <GoogleMap
          mapContainerStyle={containerStyle}
          center={HK_CENTER}
          zoom={3}
          onLoad={(m) => setMap(m)}
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
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="14" cy="14" r="12" fill="white" stroke="%23006ADC" stroke-width="2"/>
                    <text x="14" y="19" font-size="12" text-anchor="middle">${loc.emoji}</text>
                  </svg>
                `)}`,
                scaledSize: new window.google.maps.Size(28, 28),
                anchor: new window.google.maps.Point(14, 14)
              }}
            />
          ))}

          <AnimatePresence>
            {selectedPlace && (
              <InfoWindow position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }} onCloseClick={() => setSelectedPlace(null)}>
                <div className="p-4 min-w-[200px]">
                  <h3 className="text-xs font-bold mb-1">{selectedPlace.name}</h3>
                  <p className="text-[9px] text-gray-400 mb-3">{selectedPlace.loc}</p>
                  <button 
                    onClick={() => addToItinerary(selectedPlace)}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg text-[10px] font-bold"
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
