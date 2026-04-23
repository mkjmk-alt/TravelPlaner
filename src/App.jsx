import React, { useState, useCallback, useMemo, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Autocomplete } from '@react-google-maps/api';
import { Search, MapPin, Plus, Trash2, Menu, X, Calendar, Globe, Navigation, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { allLocations } from './data';
import './index.css';

// --- CONFIGURATION ---
const HK_CENTER = { lat: 22.2891, lng: 114.1924 };
const MAP_LIBRARIES = ['places']; 
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// 충돌을 피하기 위해 mapId를 제거하고 로컬 스타일만 유지합니다.
const mapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  clickableIcons: false,
  styles: [
    { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'all', stylers: [{ color: '#e7f1ff' }] },
    { featureType: 'landscape', elementType: 'all', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] }
  ]
};

function App() {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAP_LIBRARIES,
    version: 'beta' 
  });

  const [map, setMap] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [itinerary, setItinerary] = useState(() => {
    const saved = localStorage.getItem('world_travel_pro_v12');
    return saved ? JSON.parse(saved) : [{ day: 1, items: [] }];
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState('explore'); 
  const [searchQuery, setSearchQuery] = useState('');

  const autocompleteRef = useRef(null);

  const saveItinerary = (newItinerary) => {
    setItinerary(newItinerary);
    localStorage.setItem('world_travel_pro_v12', JSON.stringify(newItinerary));
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

  if (loadError) return <div className="h-screen flex items-center justify-center bg-red-50 text-red-500 font-bold p-10 text-center">API Key Error: {loadError.message}</div>;
  if (!isLoaded) return <div className="h-screen flex items-center justify-center bg-white font-bold text-gray-300">LOADING MAP...</div>;

  return (
    <div className="relative w-screen h-screen bg-gray-50 overflow-hidden font-sans">
      
      {/* FLOATING SIDEBAR */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside 
            initial={{ x: -450, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -450, opacity: 0 }}
            className="absolute top-6 left-6 bottom-6 w-[380px] bg-white/95 backdrop-blur-2xl rounded-[32px] shadow-2xl border border-white/50 flex flex-col overflow-hidden z-[1000]"
          >
            <div className="p-8 pb-4 flex items-center justify-between">
              <h1 className="text-2xl font-black text-gray-900 tracking-tighter">WorldPro</h1>
              <div className="flex gap-2">
                <button 
                   onClick={() => setViewMode(viewMode === 'explore' ? 'itinerary' : 'explore')}
                   className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${viewMode === 'itinerary' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-400'}`}
                >
                  <Calendar size={18} />
                </button>
                <button onClick={() => setSidebarOpen(false)} className="w-10 h-10 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="px-8 mb-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                <input 
                  type="text" 
                  placeholder="Filter destinations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-8 custom-scroll pb-10">
               {viewMode === 'explore' ? (
                  filteredLocations.map(loc => (
                    <div 
                      key={loc.name}
                      onClick={() => {
                        setSelectedPlace(loc);
                        map?.panTo({ lat: loc.lat, lng: loc.lng });
                        map?.setZoom(16);
                      }}
                      className="group flex items-center gap-4 p-4 hover:bg-gray-50 rounded-2xl cursor-pointer transition-all mb-1"
                    >
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-2xl shadow-sm border border-gray-50">{loc.emoji}</div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 truncate">{loc.name}</h3>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter truncate mt-1">{loc.loc}</p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); addToItinerary(loc); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all">
                        <Plus size={18} />
                      </button>
                    </div>
                  ))
               ) : (
                  itinerary[0].items.map(item => (
                    <div key={item.id} className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-2xl mb-2">
                       <div className="text-2xl">{item.emoji}</div>
                       <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold truncate">{item.name}</h3>
                          <p className="text-[9px] font-black text-blue-400 uppercase">{item.cat}</p>
                       </div>
                       <button onClick={() => removeFromItinerary(item.id)} className="p-2 text-gray-300 hover:text-red-500"><Trash2 size={16} /></button>
                    </div>
                  ))
               )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="absolute inset-0 z-0">
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} className="absolute top-6 left-6 z-[2000] w-14 h-14 bg-white rounded-2xl shadow-2xl flex items-center justify-center text-blue-600 border border-white"><Menu size={24} /></button>
        )}

        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[2000] w-full max-w-sm px-4">
          <div className="bg-white/90 backdrop-blur-xl border border-white/50 rounded-3xl shadow-2xl p-2 flex items-center">
             <div className="flex-1 px-4 text-sm font-bold text-gray-900">
               <Autocomplete onLoad={(a) => { autocompleteRef.current = a; }} onPlaceChanged={onPlaceSelected}>
                 <input type="text" placeholder="Search the globe..." className="w-full bg-transparent outline-none placeholder:text-gray-300" />
               </Autocomplete>
             </div>
             <button className="w-11 h-11 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><Search size={20} /></button>
          </div>
        </div>

        {/* GOOGLE MAP CONTAINER */}
        <div style={{ width: '100%', height: '100%' }}>
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={HK_CENTER}
            zoom={3}
            onLoad={(m) => setMap(m)}
            options={mapOptions}
            onClick={() => setSelectedPlace(null)}
          >
            {isLoaded && filteredLocations.map(loc => (
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
                  <div className="p-6 min-w-[260px]">
                    <div className="flex items-center gap-4 mb-4">
                      <span className="text-4xl">{selectedPlace.emoji}</span>
                      <h3 className="text-lg font-black text-gray-900 tracking-tight">{selectedPlace.name}</h3>
                    </div>
                    <button onClick={() => addToItinerary(selectedPlace)} className="w-full py-4 bg-blue-600 text-white rounded-2xl text-xs font-black shadow-xl">Add to Journey</button>
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
