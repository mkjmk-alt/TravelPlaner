import React, { useState, useCallback, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Autocomplete } from '@react-google-maps/api';
import { Search, MapPin, Calendar, Plus, Trash2, Menu, X, Navigation, Star, Globe, Compass } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { allLocations } from './data';
import './index.css';

// --- CONSTANTS FROM STITCH DESIGN SYSTEM ---
const HK_CENTER = { lat: 22.2891, lng: 114.1924 };
const MAP_LIBRARIES = ['places'];
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const containerStyle = {
  width: '100%',
  height: '100%'
};

// "Impactful Itinerary" Map Style
const mapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  styles: [
    { elementType: 'geometry', stylers: [{ color: '#f6f6f6' }] },
    { elementType: 'labels.text.stroke', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#2d2f2f' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#2d2f2f' }, { weight: 8 }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#2d2f2f' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#00fc9a' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d2f2f' }, { weight: 1.5 }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ebf500' }, { weight: 3 }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#ff85e4' }] },
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
    const saved = localStorage.getItem('hk_planner_v3');
    return saved ? JSON.parse(saved) : [{ day: 1, items: [] }];
  });
  const [searchResult, setSearchResult] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('explore');

  const saveItinerary = (newItinerary) => {
    setItinerary(newItinerary);
    localStorage.setItem('hk_planner_v3', JSON.stringify(newItinerary));
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
      cat: 'Discovery',
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
      <div className="flex flex-col items-center justify-center h-screen bg-[#ebf500] text-[#2d2f2f]">
        <div className="brutal-card p-16 text-center max-w-md">
          <div className="w-24 h-24 bg-[#ff85e4] border-4 border-[#2d2f2f] shadow-[6px_6px_0px_#2d2f2f] flex items-center justify-center mx-auto mb-8 animate-bounce">
            <Globe size={48} />
          </div>
          <h2 className="text-4xl font-black mb-4 tracking-tighter">BOOTING PRO...</h2>
          <div className="h-4 bg-[#2d2f2f] w-full mt-8 relative overflow-hidden">
             <div className="absolute top-0 left-0 h-full bg-[#00fc9a] animate-[slide_2s_infinite]"></div>
          </div>
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
            initial={{ x: -500 }}
            animate={{ x: 0 }}
            exit={{ x: -500 }}
            className="brutal-sidebar"
          >
            <div className="p-8 flex flex-col h-full">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-4xl font-black tracking-tighter italic leading-none">
                    WORLD<span className="text-[#ff85e4]">PRO</span>
                  </h1>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] mt-2 text-[#2d2f2f]/60">Editorial Explorer</p>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="p-3 border-4 border-[#2d2f2f] hover:bg-[#ff85e4] transition-colors">
                  <X size={24} />
                </button>
              </div>

              {/* Tabs */}
              <div className="brutal-tabs mb-8">
                <button 
                  onClick={() => setActiveTab('explore')}
                  className={`brutal-tab ${activeTab === 'explore' ? 'active' : 'inactive'}`}
                >
                  Explore
                </button>
                <button 
                  onClick={() => setActiveTab('planner')}
                  className={`brutal-tab ${activeTab === 'planner' ? 'active' : 'inactive'}`}
                >
                  Planner
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto pr-2">
                {activeTab === 'explore' ? (
                  <div className="space-y-8">
                    <div className="flex items-center justify-between bg-[#2d2f2f] text-white p-3">
                      <h2 className="text-sm font-black tracking-widest flex items-center gap-2">
                        <Compass size={16} /> DISCOVERY
                      </h2>
                      <span className="text-[10px] bg-[#00fc9a] text-[#2d2f2f] px-2 py-0.5 font-black">CURATED: HK</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {['all', 'tour', 'tart', 'food', 'korean', 'noodle'].map(cat => (
                        <button
                          key={cat}
                          onClick={() => setActiveCategory(cat)}
                          className={`category-chip ${activeCategory === cat ? 'active' : 'bg-white hover:bg-[#f6f6f6]'}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-4">
                      {filteredLocations.map((loc) => (
                        <div 
                          key={loc.name}
                          onClick={() => {
                            setSelectedPlace(loc);
                            map.panTo({ lat: loc.lat, lng: loc.lng });
                            map.setZoom(17);
                          }}
                          className={`brutal-card p-4 cursor-pointer group ${selectedPlace?.name === loc.name ? 'bg-[#00fc9a]' : ''}`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-2xl">{loc.emoji}</span>
                                <h3 className="text-xl font-black tracking-tight">{loc.name}</h3>
                              </div>
                              <p className="text-[10px] font-black text-[#2d2f2f]/70 mt-2 uppercase flex items-center gap-1">
                                <MapPin size={10} /> {loc.loc}
                              </p>
                            </div>
                            <button 
                              onClick={(e) => { e.stopPropagation(); addToItinerary(loc); }}
                              className="w-12 h-12 border-4 border-[#2d2f2f] flex items-center justify-center bg-white group-hover:bg-[#ebf500] transition-colors"
                            >
                              <Plus size={24} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="flex items-center justify-between border-b-8 border-[#2d2f2f] pb-4">
                      <h2 className="text-3xl font-black italic">ITINERARY</h2>
                      <button onClick={addDay} className="brutal-btn py-2 px-4 text-xs bg-[#00fc9a]">
                        + ADD DAY
                      </button>
                    </div>

                    {itinerary.map((day, dIdx) => (
                      <div key={dIdx} className="brutal-border bg-white mb-6">
                        <div className="bg-[#ebf500] border-b-4 border-[#2d2f2f] p-4 flex justify-between items-center">
                          <h3 className="text-lg font-black tracking-tighter italic">DAY {day.day}</h3>
                          <span className="text-[10px] font-black bg-[#2d2f2f] text-white px-2 py-1">{day.items.length} SPOTS</span>
                        </div>
                        <div className="p-6 space-y-4">
                          {day.items.length === 0 ? (
                            <div className="py-12 text-center border-4 border-dashed border-[#2d2f2f]/20">
                              <p className="text-xs font-black uppercase text-[#2d2f2f]/30">The grid is open.</p>
                            </div>
                          ) : (
                            day.items.map((item) => (
                              <div key={item.id} className="flex items-center gap-4 brutal-border p-4 bg-white hover:bg-[#ff85e4]/10 group transition-colors">
                                <span className="text-2xl">{item.emoji}</span>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-black uppercase truncate leading-none">{item.name}</h4>
                                  <p className="text-[10px] font-bold text-[#2d2f2f]/50 mt-1 uppercase">{item.cat}</p>
                                </div>
                                <button 
                                  onClick={() => removeFromItinerary(dIdx, item.id)}
                                  className="text-[#2d2f2f] hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
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
        {/* Toggle UI */}
        {!sidebarOpen && (
          <button 
            onClick={() => setSidebarOpen(true)}
            className="absolute top-8 left-8 z-[200] brutal-btn p-5 bg-[#ebf500] shadow-[8px_8px_0px_#2d2f2f]"
          >
            <Menu size={32} />
          </button>
        )}

        {/* Floating Search */}
        <div className="brutal-search-bar">
          <Autocomplete
            onLoad={(autocomplete) => { autocompleteRef.current = autocomplete; }}
            onPlaceChanged={onPlaceSelected}
            className="flex-1"
          >
            <input 
              type="text" 
              placeholder="SEARCH THE WORLD FOR IMPACT..." 
              className="placeholder:text-[#2d2f2f]/30"
            />
          </Autocomplete>
          <button className="brutal-search-btn">
            <Search size={28} />
          </button>
        </div>

        {/* MAP CONTAINER */}
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
                url: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${loc.type === 'tour' ? 'gold' : loc.type === 'tart' ? 'orange' : loc.type === 'food' ? 'red' : loc.type === 'korean' ? 'blue' : 'green'}.png`,
                scaledSize: new window.google.maps.Size(30, 50),
              }}
            />
          ))}

          {searchResult && (
            <Marker
              position={{ lat: searchResult.lat, lng: searchResult.lng }}
              icon={{
                url: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
                scaledSize: new window.google.maps.Size(40, 65),
              }}
            />
          )}

          <AnimatePresence>
            {selectedPlace && (
              <InfoWindow
                position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }}
                onCloseClick={() => setSelectedPlace(null)}
              >
                <div className="p-6 min-w-[280px] max-w-[320px] bg-white font-['Inter']">
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-4xl">{selectedPlace.emoji}</span>
                    <h3 className="text-2xl font-black tracking-tighter leading-tight uppercase italic">{selectedPlace.name}</h3>
                  </div>
                  <div className="bg-[#00fc9a] brutal-border p-2 mb-4">
                    <p className="text-[10px] font-black uppercase flex items-center gap-2">
                      <MapPin size={12} /> {selectedPlace.loc}
                    </p>
                  </div>
                  <p className="text-xs font-bold leading-relaxed mb-8 border-l-8 border-[#2d2f2f] pl-4 py-1">{selectedPlace.desc}</p>
                  <button 
                    onClick={() => addToItinerary(selectedPlace)}
                    className="w-full brutal-btn py-4 justify-center text-sm shadow-[6px_6px_0px_#2d2f2f]"
                  >
                    <Plus size={20} /> ADD TO PLAN
                  </button>
                </div>
              </InfoWindow>
            )}
          </AnimatePresence>
        </GoogleMap>

        {/* Floating Metrics */}
        <div className="brutal-stats">
          <div className="w-16 h-16 bg-[#ff85e4] border-4 border-[#2d2f2f] shadow-[4px_4px_0px_#2d2f2f] flex items-center justify-center">
            <Navigation size={32} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] mb-1 text-[#2d2f2f]/50">SPOTS MAPPED</p>
            <h4 className="text-4xl font-black leading-none tracking-tighter">
              {itinerary.reduce((acc, day) => acc + day.items.length, 0)}
            </h4>
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slide {
          from { transform: translateX(-100%); }
          to { transform: translateX(100%); }
        }
      `}} />
    </div>
  );
}

export default App;
