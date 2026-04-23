import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Autocomplete } from '@react-google-maps/api';
import { Search, MapPin, Plus, Trash2, Menu, X, Calendar } from 'lucide-react';
import { allLocations } from './data';
import './index.css';

// --- CONFIG ---
const HK_CENTER = { lat: 22.2891, lng: 114.1924 };
const MAP_LIBRARIES = ['places'];

function App() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries: MAP_LIBRARIES
  });

  const [map, setMap] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [itinerary, setItinerary] = useState([{ day: 1, items: [] }]);

  // 1. Error boundary within component
  if (loadError) {
    return (
      <div style={{ padding: '50px', color: 'red', fontWeight: 'bold', fontFamily: 'sans-serif' }}>
        <h1>Map Load Error</h1>
        <p>{loadError.message}</p>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div style={{ padding: '50px', color: 'orange', fontWeight: 'bold', fontFamily: 'sans-serif' }}>
        <h1>Missing API Key</h1>
        <p>VITE_GOOGLE_MAPS_API_KEY is not defined in your .env file.</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div style={{ padding: '50px', fontWeight: 'bold', fontFamily: 'sans-serif' }}>
        <h1>Connecting to Google Maps...</h1>
        <p>If this screen stays for more than 5 seconds, please check your internet or console.</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Sidebar - Solid Minimal Version */}
      <div style={{
        position: 'absolute', top: '20px', left: '20px', bottom: '20px', width: '350px',
        backgroundColor: 'white', zIndex: 1000, borderRadius: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.1)',
        padding: '30px', overflowY: 'auto', display: 'flex', flexDirection: 'column'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: '900', marginBottom: '20px', color: '#1a1c1e' }}>TravelPro</h1>
        
        <div style={{ marginBottom: '20px' }}>
          <input 
            type="text" 
            placeholder="Find a place..."
            style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #f0f0f0', outline: 'none', backgroundColor: '#f8f9fa' }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '10px', fontWeight: '900', color: '#ccc', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '15px' }}>Quick Select</h2>
          {allLocations.map(loc => (
            <div 
              key={loc.name}
              onClick={() => {
                setSelectedPlace(loc);
                map?.panTo({ lat: loc.lat, lng: loc.lng });
                map?.setZoom(16);
              }}
              style={{ 
                padding: '12px', 
                borderRadius: '12px',
                marginBottom: '5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <span style={{ fontSize: '20px' }}>{loc.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1a1c1e' }}>{loc.name}</div>
                <div style={{ fontSize: '10px', color: '#999' }}>{loc.loc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Map Content */}
      <div style={{ width: '100%', height: '100%' }}>
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={HK_CENTER}
          zoom={3}
          onLoad={(m) => setMap(m)}
          options={{ 
            disableDefaultUI: true,
            styles: [
              { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'off' }] },
              { featureType: 'water', elementType: 'all', stylers: [{ color: '#e7f1ff' }] }
            ]
          }}
          onClick={() => setSelectedPlace(null)}
        >
          {allLocations.map(loc => (
            <Marker
              key={loc.name}
              position={{ lat: loc.lat, lng: loc.lng }}
              onClick={() => setSelectedPlace(loc)}
            />
          ))}

          {selectedPlace && (
            <InfoWindow
              position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }}
              onCloseClick={() => setSelectedPlace(null)}
            >
              <div style={{ padding: '15px', minWidth: '200px', fontFamily: 'sans-serif' }}>
                <div style={{ fontSize: '20px', marginBottom: '5px' }}>{selectedPlace.emoji}</div>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '16px', fontWeight: 'bold' }}>{selectedPlace.name}</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>{selectedPlace.loc}</p>
                <button style={{ 
                  width: '100%', marginTop: '15px', padding: '10px', backgroundColor: '#006adc', 
                  color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer'
                }}>
                  Add to Plan
                </button>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>
    </div>
  );
}

export default App;
