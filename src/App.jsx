import React, { useState, useCallback, useMemo, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Autocomplete } from '@react-google-maps/api';
import { Search, MapPin, Plus, Trash2, Menu, X, Calendar, Globe, Navigation, ChevronRight, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { allLocations } from './data';
import './index.css';

// --- CONFIGURATION ---
const HK_CENTER = { lat: 22.2891, lng: 114.1924 };
const MAP_LIBRARIES = ['places']; // Static array to prevent re-renders
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const mapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  clickableIcons: false,
  styles: [
    { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'all', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'all', stylers: [{ color: '#e7f1ff' }] },
    { featureType: 'landscape', elementType: 'all', stylers: [{ color: '#fcfcfc' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] }
  ]
};

function App() {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAP_LIBRARIES
  });

  const [map, setMap] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [itinerary, setItinerary] = useState(() => {
    const saved = localStorage.getItem('world_travel_pro_v9');
    return saved ? JSON.parse(saved) : [{ day: 1, items: [] }];
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState('explore'); 
  const [searchQuery, setSearchQuery] = useState('');

  const autocompleteRef = useRef(null);

  const saveItinerary = (newItinerary) => {
    setItinerary(newItinerary);
    localStorage.setItem('world_travel_pro_v9', JSON.stringify(newItinerary));
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

    setSelectedPlace(newPlace);
    if (map) {
      map.panTo(place.geometry.location);
      map.setZoom(16);
    }
  };

  // --- RENDERING ---

  if (loadError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-red-50 text-red-600 p-8 text-center">
        <Globe size={48} className="mb-4 opacity-50" />
        <h1 className="text-xl font-bold mb-2">Google Maps Load Error</h1>
        <p className="text-sm max-w-xs opacity-80">Please check your API Key in the .env file and ensure Billing is enabled on your Google Cloud Console.</p>
        <code className="mt-4 p-2 bg-red-100 rounded text-[10px]">{loadError.message}</code>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Waking up the world...</p>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-gray-50 overflow-hidden">
      
      {/* --- FLOATING UI LAYER (SIDEBAR) --- */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside 
            initial={{ x: -450, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -450, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute top-6 left-6 bottom-6 w-[400px] bg-white/95 backdrop-blur-xl rounded-[32px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-white/50 flex flex-col overflow-hidden z-[1000]"
          >
            {/* Header */}
            <div className="p-10 pb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-gray-900">WorldPro</h1>
                <p className="text-[10px] font-extrabold text-blue-500 uppercase tracking-[0.3em] mt-1">Travel Hub</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setViewMode(viewMode === 'explore' ? 'itinerary' : 'explore')}
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${viewMode === 'itinerary' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                >
                  <Calendar size={18} />
                </button>
                <button onClick={() => setSidebarOpen(false)} className="w-10 h-10 rounded-2xl bg-gray-50 text-gray-400 hover:bg-gray-100 flex items-center justify-center transition-all">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Smart Discovery */}
            <div className="px-10 mb-8">
              <div className="relative group mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                <input 
                  type="text" 
                  placeholder="Find your next destination..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50/50 border-2 border-transparent rounded-2xl text-sm font-semibold focus:bg-white focus:border-blue-100 outline-none transition-all"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                {['all', 'tour', 'food', 'tart'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activeCategory === cat ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto px-10 custom-scroll">
              <div className="space-y-2 pb-10">
                {viewMode === 'explore' ? (
                  filteredLocations.map((loc) => (
                    <motion.div 
                      key={loc.name}
                      layout
                      onClick={() => {
                        setSelectedPlace(loc);
                        map?.panTo({ lat: loc.lat, lng: loc.lng });
                        map?.setZoom(16);
                      }}
                      className={`group flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border-2 ${selectedPlace?.name === loc.name ? 'bg-blue-50 border-blue-100' : 'bg-white border-transparent hover:bg-gray-50'}`}
                    >
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-2xl shadow-sm border border-gray-100">
                        {loc.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 truncate">{loc.name}</h3>
                        <p className="text-[10px] font-bold text-gray-300 uppercase truncate mt-1">{loc.loc}</p>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); addToItinerary(loc); }}
                        className="p-2 text-blue-600 bg-white border border-gray-100 rounded-xl shadow-sm opacity-0 group-hover:opacity-100 hover:bg-blue-600 hover:text-white transition-all"
                      >
                        <Plus size={18} />
                      </button>
                    </motion.div>
                  ))
                ) : (
                  itinerary[0].items.length === 0 ? (
                    <div className="py-20 text-center">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Navigation size={24} className="text-gray-200" />
                      </div>
                      <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">No spots saved yet</p>
                    </div>
                  ) : (
                    itinerary[0].items.map((item) => (
                      <div key={item.id} className="flex items-center gap-4 p-4 bg-white border-2 border-gray-50 rounded-2xl mb-3 hover:border-blue-100 transition-all shadow-sm">
                        <div className="text-2xl">{item.emoji}</div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-gray-900 truncate">{item.name}</h3>
                          <p className="text-[9px] font-black text-blue-400 uppercase tracking-tighter">{item.cat}</p>
                        </div>
                        <button onClick={() => removeFromItinerary(item.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  )
                )}
              </div>
            </div>

            {/* Footer Stats */}
            <div className="p-8 border-t border-gray-50 bg-gray-50/30 flex justify-between items-center">
              <div className="flex items-center gap-3">
                 <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                 <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">World Live</span>
              </div>
              <span className="text-[10px] font-black text-gray-900">{itinerary[0].items.length} SAVED SPOTS</span>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* --- MAP CONTENT --- */}
      <main className="absolute inset-0 z-0">
        {!sidebarOpen && (
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="absolute top-6 left-6 z-[2000] w-14 h-14 bg-white rounded-2xl shadow-2xl flex items-center justify-center text-blue-600 hover:scale-110 transition-all border border-white"
          >
            <Menu size={24} />
          </button>
        )}

        {/* Global Search Bar Overlay */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[2000] w-full max-w-sm px-4">
          <div className="bg-white/90 backdrop-blur-xl border border-white/50 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-2 flex items-center">
             <div className="flex-1 px-4 text-sm font-bold text-gray-900">
               <Autocomplete 
                  onLoad={(a) => { autocompleteRef.current = a; }} 
                  onPlaceChanged={onPlaceSelected}
               >
                 <input 
                    type="text" 
                    placeholder="Search the globe..." 
                    className="w-full bg-transparent outline-none placeholder:text-gray-300" 
                 />
               </Autocomplete>
             </div>
             <button className="w-11 h-11 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
               <Search size={20} />
             </button>
          </div>
        </div>

        {/* THE GOOGLE MAP */}
        <div style={{ width: '100%', height: '100%' }}>
          <GoogleMap
            id="main-google-map"
            mapContainerStyle={{ width: '100%', height: '100%' }}
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
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="18" cy="18" r="16" fill="white" stroke="%23006ADC" stroke-width="2"/>
                      <text x="18" y="24" font-size="18" text-anchor="middle">${loc.emoji}</text>
                    </svg>
                  `)}`,
                  scaledSize: new window.google.maps.Size(36, 36),
                  anchor: new window.google.maps.Point(18, 18)
                }}
              />
            ))}

            <AnimatePresence>
              {selectedPlace && (
                <InfoWindow 
                  position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }} 
                  onCloseClick={() => setSelectedPlace(null)}
                >
                  <div className="p-6 min-w-[280px] font-sans">
                    <div className="flex items-center gap-4 mb-4">
                      <span className="text-4xl">{selectedPlace.emoji}</span>
                      <h3 className="text-lg font-black text-gray-900 tracking-tight leading-tight">{selectedPlace.name}</h3>
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                      <MapPin size={14} className="text-blue-500" /> {selectedPlace.loc}
                    </p>
                    <button 
                      onClick={() => addToItinerary(selectedPlace)}
                      className="w-full py-4 bg-blue-600 text-white rounded-2xl text-xs font-black shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all"
                    >
                      Add to Journey
                    </button>
                  </div>
                </InfoWindow>
              )}
            </AnimatePresence>
          </GoogleMap>
        </div>
      </main>
    </div>
  );
}

export default App;
