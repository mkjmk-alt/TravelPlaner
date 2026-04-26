import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Autocomplete, Polyline } from '@react-google-maps/api';
import { Heart, Search, Calendar, MapPin, Navigation, Star, PlusCircle, Trash2, AlertCircle, Wallet, ChevronRight, Plane, Menu, X, Compass, Plus, Edit2, Share2, Users, Copy, Check } from 'lucide-react';
import { supabase } from './supabaseClient';
import './index.css';

// --- CONFIGURATION ---
const HK_CENTER = { lat: 22.2891, lng: 114.1924 };
const MAP_LIBRARIES = ['places']; 
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const mapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  gestureHandling: 'greedy',
  styles: [
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#eff6ff' }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#f3f4f6' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
    { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#f9fafb' }] },
    { featureType: 'poi', elementType: 'labels.icon', stylers: [{ saturation: -100 }, { lightness: 15 }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
    { featureType: 'poi', elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff', weight: 3 }] },
    { featureType: 'transit', elementType: 'labels.icon', stylers: [{ saturation: -100 }, { lightness: 10 }] },
    { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] }
  ]
};

function App() {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAP_LIBRARIES,
  });

  // --- GLOBAL UI & AUTH STATE ---
  const [session, setSession] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState('trips');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [activeDay, setActiveDay] = useState(1);
  const [expandedCountries, setExpandedCountries] = useState({});
  const [editingTripId, setEditingTripId] = useState(null);
  const [editTripData, setEditTripData] = useState({ name: "", startDate: "", endDate: "" });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [map, setMap] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [isLoadingDB, setIsLoadingDB] = useState(true);
  const [showShareToast, setShowShareToast] = useState(false);

  // --- DATA STATE ---
  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem('world_pro_fav_v1');
    return saved ? JSON.parse(saved) : [];
  });

  const [trips, setTrips] = useState(() => {
    const savedTrips = localStorage.getItem('world_pro_trips_v1');
    if (savedTrips) return JSON.parse(savedTrips);
    
    const oldItinerary = JSON.parse(localStorage.getItem('world_pro_v16') || '[]');
    let oldBudget = { limitKRW: 1000000, travelCurrency: 'USD' };
    try {
      const budgetRaw = localStorage.getItem('world_pro_budget_v1');
      if (budgetRaw && budgetRaw.startsWith('{')) oldBudget = JSON.parse(budgetRaw);
    } catch {}
    const oldExpenses = JSON.parse(localStorage.getItem('world_pro_expenses_v1') || '[]');
    
    if (oldItinerary.length > 0 || oldExpenses.length > 0) {
      const migratedTrip = {
        id: Date.now().toString(),
        name: "My First Trip",
        itinerary: oldItinerary.length > 0 ? oldItinerary : [{ day: 1, items: [] }],
        budgetSettings: oldBudget,
        expenses: oldExpenses,
        createdAt: Date.now()
      };
      localStorage.setItem('world_pro_trips_v1', JSON.stringify([migratedTrip]));
      return [migratedTrip];
    }
    return [];
  });

  const [activeTripId, setActiveTripId] = useState(() => {
    const savedTrips = JSON.parse(localStorage.getItem('world_pro_trips_v1') || '[]');
    return savedTrips.length > 0 ? savedTrips[0].id : null;
  });

  const [exchangeRates, setExchangeRates] = useState({});
  const [expenseInput, setExpenseInput] = useState({ desc: '', amount: '', currency: '', day: 1 });

  const autocompleteRef = useRef(null);

  // --- EFFECTS ---
  
  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  // Cloud Sync Initialization
  useEffect(() => {
    async function initCloudDB() {
      if (!session) {
        setIsLoadingDB(false);
        return;
      }
      try {
        const { data, error } = await supabase.from('user_state').select('*').eq('user_id', session.user.id);
        if (error) throw error;
        
        let cloudTrips = null;
        let cloudFavs = null;
        
        if (data && data.length > 0) {
          const tripsRow = data.find(r => r.key === 'world_pro_trips_v1');
          if (tripsRow) cloudTrips = tripsRow.value;
          
          const favsRow = data.find(r => r.key === 'world_pro_fav_v1');
          if (favsRow) cloudFavs = favsRow.value;
        }

        if (!cloudTrips && trips.length > 0) {
          await supabase.from('user_state').upsert({ user_id: session.user.id, key: 'world_pro_trips_v1', value: trips });
        } else if (cloudTrips) {
          setTrips(cloudTrips);
          localStorage.setItem('world_pro_trips_v1', JSON.stringify(cloudTrips));
          if (!activeTripId && cloudTrips.length > 0) setActiveTripId(cloudTrips[0].id);
        }

        if (!cloudFavs && favorites.length > 0) {
          await supabase.from('user_state').upsert({ user_id: session.user.id, key: 'world_pro_fav_v1', value: favorites });
        } else if (cloudFavs) {
          setFavorites(cloudFavs);
          localStorage.setItem('world_pro_fav_v1', JSON.stringify(cloudFavs));
        }
      } catch (err) {
        console.error("Supabase sync failed:", err);
      } finally {
        setIsLoadingDB(false);
      }
    }
    initCloudDB();
  }, [session]);

  // --- REALTIME SYNC FOR SHARED TRIPS ---
  useEffect(() => {
    const sharedIds = trips.filter(t => t.sharedId).map(t => t.sharedId);
    if (sharedIds.length === 0) return;

    // Listen for any changes in the shared_trips table
    const channel = supabase
      .channel('shared-trips-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shared_trips' }, payload => {
        const sharedId = payload.new.id;
        const updatedData = payload.new.trip_data;
        
        setTrips(prev => prev.map(t => 
          t.sharedId === sharedId ? { ...updatedData, sharedId } : t
        ));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [trips.filter(t => t.sharedId).length]);

  // Exchange Rates
  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/KRW')
      .then(res => res.json())
      .then(data => {
        if (data && data.rates) {
          setExchangeRates(data.rates);
        }
      })
      .catch(err => console.error("Exchange rate fetch failed", err));
  }, []);

  // --- DERIVED STATE ---
  const activeTrip = trips.find(t => t.id === activeTripId);
  const itinerary = activeTrip?.itinerary || [];
  const budgetSettings = activeTrip?.budgetSettings || { limitKRW: 1000000, travelCurrency: 'USD' };
  const expenses = activeTrip?.expenses || [];

  // Natively translate and sort currencies
  const getCurrencyNameKO = (code) => {
    try {
      return new Intl.DisplayNames(['ko'], { type: 'currency' }).of(code) || code;
    } catch {
      return code;
    }
  };

  const sortedCurrencies = useMemo(() => {
    if (Object.keys(exchangeRates).length === 0) return [];
    const list = Object.keys(exchangeRates).map(code => ({
      code,
      name: getCurrencyNameKO(code)
    }));
    list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return list;
  }, [exchangeRates]);

  const getCountryFromAddress = (address) => {
    if (!address) return 'Unknown';
    const parts = address.split(',');
    let country = parts[parts.length - 1].trim();
    country = country.replace(/^[0-9A-Z-\s]+ /, ''); 
    return country;
  };

  const getActualDateForDay = (startDate, dayNumber) => {
    if (!startDate) return '';
    try {
      const date = new Date(startDate + "T00:00:00");
      date.setDate(date.getDate() + (dayNumber - 1));
      return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' });
    } catch {
      return '';
    }
  };

  const groupedFavorites = useMemo(() => {
    const groups = {};
    favorites.forEach(fav => {
      const country = getCountryFromAddress(fav.loc);
      if (!groups[country]) groups[country] = [];
      groups[country].push(fav);
    });
    return groups;
  }, [favorites]);

  const polylinePath = useMemo(() => {
    const dayPlan = itinerary.find(d => d.day === activeDay);
    if (!dayPlan || dayPlan.items.length < 2) return [];
    return dayPlan.items.map(item => ({ lat: item.lat, lng: item.lng }));
  }, [itinerary, activeDay]);

  const toggleCountry = (country) => {
    setExpandedCountries(prev => ({
      ...prev,
      [country]: !prev[country]
    }));
  };

  const saveFavorites = async (newFavs) => {
    setFavorites(newFavs);
    localStorage.setItem('world_pro_fav_v1', JSON.stringify(newFavs));
    if (session?.user?.id) {
      await supabase.from('user_state').upsert({ user_id: session.user.id, key: 'world_pro_fav_v1', value: newFavs }).catch(console.error);
    }
  };

  const syncTripsToCloud = async (newTrips) => {
    setTrips(newTrips);
    localStorage.setItem('world_pro_trips_v1', JSON.stringify(newTrips));
    
    // 1. Sync to private user_state
    if (session?.user?.id) {
      try {
        const { error } = await supabase
          .from('user_state')
          .upsert(
            { user_id: session.user.id, key: 'world_pro_trips_v1', value: newTrips },
            { onConflict: 'user_id,key' }
          );
        if (error) throw error;
      } catch (err) {
        console.error("Cloud sync failed:", err);
      }
    }

    // 2. Sync individual shared trips to shared_trips table
    for (const trip of newTrips) {
      if (trip.sharedId) {
        await supabase.from('shared_trips').update({ trip_data: trip }).eq('id', trip.sharedId).catch(console.error);
      }
    }
  };

  const shareTrip = async (tripId) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip || trip.sharedId) return;

    try {
      const { data, error } = await supabase
        .from('shared_trips')
        .insert({ trip_data: trip })
        .select()
        .single();

      if (error) throw error;

      const newTrips = trips.map(t => t.id === tripId ? { ...t, sharedId: data.id } : t);
      await syncTripsToCloud(newTrips);
      copyToClipboard(data.id, tripId);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 5000);
    } catch (err) {
      console.error("Sharing failed:", err);
      alert("공유에 실패했습니다.");
    }
  };

  const joinSharedTrip = async () => {
    const code = prompt("친구에게 받은 공유 코드를 입력하세요:");
    if (!code || code.trim().length < 10) return;

    try {
      const { data, error } = await supabase
        .from('shared_trips')
        .select('*')
        .eq('id', code.trim())
        .single();

      if (error || !data) throw new Error("Invalid Code");

      if (trips.some(t => t.sharedId === data.id)) {
        alert("이미 목록에 있는 일정입니다.");
        return;
      }

      const joinedTrip = { ...data.trip_data, sharedId: data.id };
      const newTrips = [joinedTrip, ...trips];
      await syncTripsToCloud(newTrips);
      setActiveTripId(joinedTrip.id);
      setViewMode('itinerary');
      alert(`'${joinedTrip.name}' 일정에 참여했습니다!`);
    } catch (err) {
      alert("올바른 공유 코드를 입력해 주세요.");
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setShowShareToast(true);
    setTimeout(() => {
      setCopiedId(null);
      setShowShareToast(false);
    }, 5000);
  };

  // --- TRIP DATA MUTATORS ---
  const updateActiveTrip = async (updates) => {
    if (!activeTripId) return;
    
    // Calculate new state array based on existing state
    const nextTrips = trips.map(t => t.id === activeTripId ? { ...t, ...updates } : t);
    
    // Sync to cloud and update local state
    await syncTripsToCloud(nextTrips);
  };

  const addDay = async () => {
    if (!activeTrip) return;
    
    const newItinerary = [...itinerary, { day: itinerary.length + 1, items: [] }];
    const totalDays = newItinerary.length;
    let newEndDate = activeTrip.endDate;
    
    if (activeTrip.startDate) {
      const startDateObj = new Date(activeTrip.startDate + "T00:00:00");
      startDateObj.setDate(startDateObj.getDate() + (totalDays - 1));
      
      // Construct YYYY-MM-DD manually using local date methods to avoid UTC shift
      const y = startDateObj.getFullYear();
      const m = String(startDateObj.getMonth() + 1).padStart(2, '0');
      const d = String(startDateObj.getDate()).padStart(2, '0');
      newEndDate = `${y}-${m}-${d}`;
    }
    
    await updateActiveTrip({ 
      itinerary: newItinerary, 
      endDate: newEndDate 
    });
    
    setActiveDay(totalDays);
  };

  const saveItinerary = (newItinerary) => updateActiveTrip({ itinerary: newItinerary });
  const saveBudgetSettings = (newSettings) => updateActiveTrip({ budgetSettings: newSettings });
  const saveExpenses = (newExpenses) => updateActiveTrip({ expenses: newExpenses });

  // --- TRIP CRUD ---
  const createNewTrip = () => {
    const newId = Date.now().toString();
    const today = new Date().toISOString().split('T')[0];
    const newTrip = {
      id: newId,
      name: "New Trip",
      startDate: today,
      endDate: today,
      itinerary: [{ day: 1, items: [] }],
      budgetSettings: { limitKRW: 1000000, travelCurrency: 'USD' },
      expenses: [],
      createdAt: Date.now()
    };
    
    const newTrips = [newTrip, ...trips];
    syncTripsToCloud(newTrips);
    
    // Auto-enter inline edit mode
    setEditingTripId(newId);
    setEditTripData({ name: "New Trip", startDate: today, endDate: today });
  };

  const startRenameTrip = (trip) => {
    setEditingTripId(trip.id);
    setEditTripData({ name: trip.name, startDate: trip.startDate || "", endDate: trip.endDate || "" });
  };

  const saveRenameTrip = (id) => {
    if (editTripData.name.trim() !== "") {
      const { name, startDate, endDate } = editTripData;
      let newItinerary = null;
      
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start <= end) {
          const diffTime = Math.abs(end - start);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          if (diffDays > 0 && diffDays <= 100) {
             newItinerary = Array.from({length: diffDays}, (_, i) => ({ day: i + 1, items: [] }));
          }
        }
      }

      const nextTrips = trips.map(t => {
        if (t.id === id) {
          const tripToUpdate = { ...t, name: name.trim(), startDate, endDate };
          if (newItinerary) {
             tripToUpdate.itinerary = newItinerary.map((newDay, idx) => t.itinerary[idx] || newDay);
          }
          return tripToUpdate;
        }
        return t;
      });
      
      syncTripsToCloud(nextTrips);
    }
    setEditingTripId(null);
  };

  const handleInlineDelete = (e, id, deleteAction) => {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      deleteAction();
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => {
        setConfirmDeleteId((current) => current === id ? null : current);
      }, 3000);
    }
  };

  const deleteTrip = async (id) => {
    const newTrips = trips.filter(t => t.id !== id);
    // Wait for cloud sync to finish before any UI navigation
    await syncTripsToCloud(newTrips);
    
    if (activeTripId === id) {
      setActiveTripId(newTrips.length > 0 ? newTrips[0].id : null);
      setViewMode('trips');
    }
  };

  const addExpense = () => {
    if (!activeTripId || !expenseInput.desc || !expenseInput.amount) return;
    
    let amountKRW = parseFloat(expenseInput.amount);
    
    // Convert to KRW if it's a foreign currency
    const currentCurrency = expenseInput.currency || budgetSettings.travelCurrency || 'USD';
    if (currentCurrency !== 'KRW' && exchangeRates[currentCurrency]) {
      // API returns how much foreign currency 1 KRW buys. 
      amountKRW = parseFloat(expenseInput.amount) / exchangeRates[currentCurrency];
    }

    const newExpense = {
      id: Date.now(),
      desc: expenseInput.desc,
      amount: parseFloat(expenseInput.amount),
      currency: currentCurrency,
      amountKRW: Math.round(amountKRW),
      day: parseInt(expenseInput.day)
    };

    saveExpenses([...expenses, newExpense]);
    setExpenseInput({ ...expenseInput, desc: '', amount: '' });
  };

  const deleteExpense = (id) => {
    saveExpenses(expenses.filter(e => e.id !== id));
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
        map.fitBounds(place.geometry.viewport);
      } else {
        map.panTo(place.geometry.location);
        map.setZoom(18);
      }
    }
  };

  const fetchPlaceDetails = (placeId) => {
    if (!map || !window.google) return;
    const service = new window.google.maps.places.PlacesService(map);
    service.getDetails(
      { placeId, fields: ['name', 'geometry', 'formatted_address'] },
      (place, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place.geometry && place.geometry.location) {
          const newPlace = {
            name: place.name,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            loc: place.formatted_address || 'Selected from Map',
            cat: 'Map Selection',
            desc: place.formatted_address || '',
            emoji: '📍',
            type: 'poi'
          };
          setSearchResult(newPlace);
          setSelectedPlace(newPlace);
        }
      }
    );
  };

  const onMapClick = (e) => {
    if (e.placeId) {
      e.stop(); // Prevent the default Google Maps InfoWindow from opening
      fetchPlaceDetails(e.placeId);
    } else {
      setSelectedPlace(null);
    }
  };

  const totalSpots = itinerary.reduce((acc, day) => acc + day.items.length, 0);
  const totalSpentKRW = expenses.reduce((acc, curr) => acc + curr.amountKRW, 0);
  const budgetProgress = budgetSettings.limitKRW > 0 ? Math.min((totalSpentKRW / budgetSettings.limitKRW) * 100, 100) : 0;

  // Robust Error Boundaries
  if (loadError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-red-50 text-red-500 font-sans p-10 text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#fef2f2', color: '#ef4444' }}>
        <AlertCircle size={48} className="mb-4" />
        <h1 style={{ fontSize: '24px', fontWeight: '900', margin: '16px 0 8px 0' }}>Map Load Error</h1>
        <p style={{ fontWeight: 'bold' }}>{loadError.message}</p>
      </div>
    );
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-orange-50 text-orange-500 font-sans p-10 text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#fff7ed', color: '#f97316' }}>
        <AlertCircle size={48} className="mb-4" />
        <h1 style={{ fontSize: '24px', fontWeight: '900', margin: '16px 0 8px 0' }}>API Key Missing</h1>
        <p style={{ fontWeight: 'bold' }}>Please check your .env file.</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-screen flex flex-col items-center justify-center font-sans bg-white text-gray-400" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'white', color: '#9ca3af' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', marginBottom: '16px', animation: 'spin 1s linear infinite' }}></div>
        <div style={{ fontWeight: '900', letterSpacing: '0.1em' }}>LOADING WORLD...</div>
      </div>
    );
  }


  return (
    <div className="app-container">
      
      {/* SIDEBAR UI */}
      {sidebarOpen && (
        <aside className="sidebar-container">

          {/* Header */}
          <div style={{ padding: '24px 32px', borderBottom: '1px solid #f3f4f6', backgroundColor: 'white' }}>
            {/* Row 1: Logo & Auth */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#111827', margin: 0, letterSpacing: '-0.05em' }}>WorldPro</h1>
                <p style={{ fontSize: '9px', fontWeight: '800', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.15em', margin: '2px 0 0 0' }}>Global Travel Planner</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {session ? (
                  <button onClick={() => supabase.auth.signOut()} style={{ background: '#f3f4f6', border: 'none', color: '#6b7280', fontWeight: '800', fontSize: '10px', cursor: 'pointer', padding: '8px 12px', borderRadius: '10px' }}>LOGOUT</button>
                ) : (
                  <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })} style={{ background: 'white', border: '1px solid #e5e7eb', color: '#4b5563', padding: '8px 12px', borderRadius: '10px', fontWeight: '800', fontSize: '10px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <img src="https://www.google.com/favicon.ico" width="12" height="12" alt="Google" />
                    LOGIN
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Navigation Tabs & Share Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '6px', paddingRight: '12px', borderRight: '1px solid #f3f4f6' }}>
                <button 
                  onClick={() => setViewMode('trips')}
                  style={{ width: '40px', height: '40px', borderRadius: '12px', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s', backgroundColor: viewMode === 'trips' ? '#8b5cf6' : '#f3f4f6', color: viewMode === 'trips' ? 'white' : '#9ca3af' }}
                  title="My Trips"
                >
                  <Plane size={18} />
                </button>
                <button 
                  onClick={() => setViewMode('favorites')}
                  style={{ width: '40px', height: '40px', borderRadius: '12px', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s', backgroundColor: viewMode === 'favorites' ? '#ef4444' : '#f3f4f6', color: viewMode === 'favorites' ? 'white' : '#9ca3af' }}
                  title="Favorites"
                >
                  <Heart size={18} fill={viewMode === 'favorites' ? "currentColor" : "none"} />
                </button>
              </div>

              {activeTripId && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flex: 1 }}>
                  <button 
                    onClick={() => setViewMode('itinerary')}
                    style={{ width: '40px', height: '40px', borderRadius: '12px', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s', backgroundColor: viewMode === 'itinerary' ? '#2563eb' : '#f3f4f6', color: viewMode === 'itinerary' ? 'white' : '#9ca3af' }}
                    title="Planner"
                  >
                    <Calendar size={18} />
                  </button>
                  <button 
                    onClick={() => setViewMode('budget')}
                    style={{ width: '40px', height: '40px', borderRadius: '12px', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s', backgroundColor: viewMode === 'budget' ? '#10b981' : '#f3f4f6', color: viewMode === 'budget' ? 'white' : '#9ca3af' }}
                    title="Budget"
                  >
                    <Wallet size={18} />
                  </button>
                  
                  {/* Unified Invite Action */}
                  <div style={{ marginLeft: 'auto' }}>
                    <button 
                      onClick={() => activeTrip?.sharedId ? copyToClipboard(activeTrip.sharedId, activeTrip.id) : shareTrip(activeTrip.id)}
                      style={{ height: '40px', padding: '0 12px', backgroundColor: activeTrip?.sharedId ? '#f3f4f6' : '#f5f3ff', borderRadius: '12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: activeTrip?.sharedId ? '#6b7280' : '#8b5cf6', fontWeight: '900' }}
                      title={activeTrip?.sharedId ? "초대 코드 복사" : "친구 초대하기"}
                    >
                      {copiedId === activeTrip?.id ? <Check size={14} color="#10b981" /> : (activeTrip?.sharedId ? <Users size={14} /> : <Share2 size={14} />)}
                      {copiedId === activeTrip?.id ? "COPIED" : (activeTrip?.sharedId ? "INVITED" : "INVITE")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* List Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
            
            {/* --- TRIPS MODE --- */}
            {viewMode === 'trips' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '12px', fontWeight: '900', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>My Trips</h2>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={joinSharedTrip} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '800', color: '#10b981', backgroundColor: '#ecfdf5', padding: '8px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                      <Users size={14} /> JOIN
                    </button>
                    <button onClick={createNewTrip} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '800', color: '#8b5cf6', backgroundColor: '#f5f3ff', padding: '8px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                      <PlusCircle size={14} /> NEW TRIP
                    </button>
                  </div>
                </div>

                {trips.length === 0 ? (
                  <div style={{ padding: '40px 20px', border: '2px dashed #e5e7eb', borderRadius: '16px', textAlign: 'center' }}>
                    <Plane size={36} color="#d1d5db" style={{ margin: '0 auto 12px auto' }} />
                    <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>No trips planned yet</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {trips.map(trip => (
                      <div 
                        key={trip.id} 
                        onClick={() => { setActiveTripId(trip.id); setViewMode('itinerary'); }}
                        style={{ padding: '20px', backgroundColor: activeTripId === trip.id ? '#f5f3ff' : 'white', border: activeTripId === trip.id ? '2px solid #ddd6fe' : '1px solid #e5e7eb', borderRadius: '16px', cursor: 'pointer', transition: '0.2s' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          {editingTripId === trip.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                              <input 
                                autoFocus
                                value={editTripData.name}
                                onChange={(e) => setEditTripData({...editTripData, name: e.target.value})}
                                style={{ fontSize: '18px', fontWeight: '900', color: '#111827', margin: 0, padding: '8px 12px', border: '2px solid #8b5cf6', borderRadius: '10px', outline: 'none' }}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="Trip Name"
                              />
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input 
                                  type="date"
                                  value={editTripData.startDate}
                                  onChange={(e) => setEditTripData({...editTripData, startDate: e.target.value})}
                                  style={{ flex: 1, padding: '8px', borderRadius: '10px', border: '1px solid #d1d5db', fontSize: '12px', fontWeight: 'bold', outline: 'none', color: '#4b5563' }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '800' }}>~</span>
                                <input 
                                  type="date"
                                  value={editTripData.endDate}
                                  onChange={(e) => setEditTripData({...editTripData, endDate: e.target.value})}
                                  style={{ flex: 1, padding: '8px', borderRadius: '10px', border: '1px solid #d1d5db', fontSize: '12px', fontWeight: 'bold', outline: 'none', color: '#4b5563' }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); saveRenameTrip(trip.id); }}
                                style={{ padding: '10px', backgroundColor: '#8b5cf6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '900', cursor: 'pointer', marginTop: '4px' }}
                              >
                                SAVE TRIP
                              </button>
                            </div>
                          ) : (
                            <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px' }}>
                          <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#111827', margin: 0, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trip.name}</h3>
                          <div style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'center' }}>
                            <button 
                              onClick={(e) => { e.stopPropagation(); trip.sharedId ? copyToClipboard(trip.sharedId, trip.id) : shareTrip(trip.id); }}
                              style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', backgroundColor: trip.sharedId ? '#f3f4f6' : '#f5f3ff', color: trip.sharedId ? '#6b7280' : '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                              title={trip.sharedId ? "초대 코드 복사" : "친구 초대하기"}
                            >
                              {copiedId === trip.id ? <Check size={14} color="#10b981" /> : (trip.sharedId ? <Users size={14} /> : <Share2 size={14} />)}
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); startRenameTrip(trip); }}
                              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px', borderRadius: '8px' }}
                              title="Edit Trip"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={(e) => handleInlineDelete(e, `trip-${trip.id}`, () => deleteTrip(trip.id))}
                              style={{ background: confirmDeleteId === `trip-${trip.id}` ? '#ef4444' : 'none', border: 'none', color: confirmDeleteId === `trip-${trip.id}` ? 'white' : '#f87171', cursor: 'pointer', padding: confirmDeleteId === `trip-${trip.id}` ? '4px 8px' : '4px', borderRadius: '8px', fontSize: '11px', fontWeight: '800' }}
                              title="Delete Trip"
                            >
                              {confirmDeleteId === `trip-${trip.id}` ? '확인' : <Trash2 size={16} />}
                            </button>
                          </div>
                        </div>
                            </>
                          )}
                        </div>
                        {editingTripId !== trip.id && (
                          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', fontWeight: '800', color: '#6b7280' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Calendar size={14} /> 
                              {trip.startDate ? (
                                <>
                                  <span style={{ color: '#111827' }}>{trip.startDate} ~ {trip.endDate}</span>
                                  <span style={{ color: '#9ca3af', marginLeft: '4px' }}>({trip.itinerary.length} {trip.itinerary.length === 1 ? 'Day' : 'Days'})</span>
                                </>
                              ) : (
                                <span style={{ color: '#111827' }}>{trip.itinerary.length} {trip.itinerary.length === 1 ? 'Day' : 'Days'}</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Wallet size={14} /> ₩ {trip.expenses.reduce((sum, e) => sum + e.amountKRW, 0).toLocaleString()}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* --- FAVORITES MODE --- */}
            {viewMode === 'favorites' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <h2 style={{ fontSize: '12px', fontWeight: '900', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>Saved Places</h2>
                </div>
                {Object.keys(groupedFavorites).length === 0 ? (
                  <div style={{ padding: '40px 20px', border: '2px dashed #fecaca', borderRadius: '16px', textAlign: 'center' }}>
                    <Heart size={36} color="#fca5a5" style={{ margin: '0 auto 12px auto' }} />
                    <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>No places saved yet</p>
                  </div>
                ) : (
                  Object.entries(groupedFavorites).map(([country, places]) => (
                    <div key={`country-${country}`} style={{ marginBottom: '20px' }}>
                      <div 
                        onClick={() => toggleCountry(country)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', backgroundColor: '#fef2f2', borderRadius: '16px', cursor: 'pointer', marginBottom: '12px' }}
                      >
                        <h3 style={{ fontSize: '16px', fontWeight: '900', color: '#ef4444', margin: 0 }}>{country}</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '800', color: '#f87171' }}>{places.length} spots</span>
                          <ChevronRight size={18} color="#f87171" style={{ transform: expandedCountries[country] ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.2s' }} />
                        </div>
                      </div>

                      {expandedCountries[country] && (
                        <div style={{ paddingLeft: '12px', borderLeft: '2px solid #fecaca', marginLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {places.map((loc) => (
                            <div 
                              key={`fav-list-${loc.name}`}
                              onClick={() => {
                                setSelectedPlace(loc);
                                map?.panTo({ lat: loc.lat, lng: loc.lng });
                                map?.setZoom(18);
                              }}
                              style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', backgroundColor: selectedPlace?.name === loc.name ? '#fef2f2' : 'transparent', borderRadius: '16px', cursor: 'pointer', border: '1px solid transparent' }}
                            >
                              <div style={{ width: '48px', height: '48px', backgroundColor: 'white', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', border: '1px solid #f3f4f6', flexShrink: 0 }}>{loc.emoji}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#111827', margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</h3>
                                <p style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.loc}</p>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                {activeTripId && (
                                  <button 
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      addToItinerary(loc);
                                    }} 
                                    style={{ padding: '10px', backgroundColor: '#eff6ff', border: 'none', color: '#3b82f6', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    title={`Day ${activeDay} 일정에 추가`}
                                  >
                                    <Plus size={18} />
                                  </button>
                                )}
                                <button 
                                  onClick={(e) => { e.stopPropagation(); toggleFavorite(loc); }} 
                                  style={{ padding: '10px', backgroundColor: '#fef2f2', border: 'none', color: '#ef4444', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  title="즐겨찾기에서 제거"
                                >
                                  <Heart size={18} fill="currentColor" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </>
            )}

            {/* --- ITINERARY MODE --- */}
            {viewMode === 'itinerary' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '12px', fontWeight: '900', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>My Planner</h2>
                  <button onClick={addDay} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '800', color: '#2563eb', backgroundColor: '#eff6ff', padding: '8px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                    <PlusCircle size={14} /> ADD DAY
                  </button>
                </div>

                {itinerary.map((dayPlan, dIdx) => (
                  <div key={dayPlan.day} style={{ marginBottom: '32px' }}>
                    <div 
                      onClick={() => setActiveDay(dayPlan.day)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', padding: '12px 16px', borderRadius: '12px', cursor: 'pointer', backgroundColor: activeDay === dayPlan.day ? '#eff6ff' : 'transparent', border: activeDay === dayPlan.day ? '1px solid #bfdbfe' : '1px solid transparent' }}
                    >
                      <h3 style={{ fontSize: '14px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, color: activeDay === dayPlan.day ? '#2563eb' : '#9ca3af' }}>
                        Day {dayPlan.day} 
                        {activeTrip?.startDate && (
                          <span style={{ fontSize: '11px', fontWeight: '800', color: activeDay === dayPlan.day ? '#60a5fa' : '#d1d5db', marginLeft: '6px' }}>
                            ({getActualDateForDay(activeTrip.startDate, dayPlan.day)})
                          </span>
                        )}
                      </h3>
                      <span style={{ fontSize: '11px', fontWeight: '800', color: '#9ca3af' }}>{dayPlan.items.length} spots</span>
                    </div>

                    {dayPlan.items.length === 0 ? (
                      <div style={{ padding: '32px 20px', border: '2px dashed #e5e7eb', borderRadius: '16px', textAlign: 'center' }}>
                        <p style={{ fontSize: '11px', color: '#d1d5db', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>No places planned</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {dayPlan.items.map((item) => (
                          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <div style={{ fontSize: '28px', flexShrink: 0 }}>{item.emoji}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#111827', margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</h3>
                              <p style={{ fontSize: '10px', fontWeight: '900', color: '#60a5fa', textTransform: 'uppercase', margin: 0, letterSpacing: '0.05em' }}>{item.cat}</p>
                            </div>
                            <button 
                              onClick={(e) => handleInlineDelete(e, `itin-${item.id}`, () => removeFromItinerary(dIdx, item.id))} 
                              style={{ padding: confirmDeleteId === `itin-${item.id}` ? '10px 14px' : '10px', color: confirmDeleteId === `itin-${item.id}` ? 'white' : '#ef4444', backgroundColor: confirmDeleteId === `itin-${item.id}` ? '#ef4444' : '#fef2f2', border: 'none', borderRadius: '10px', cursor: 'pointer', flexShrink: 0, fontSize: '12px', fontWeight: '800' }}
                            >
                              {confirmDeleteId === `itin-${item.id}` ? '확인' : <Trash2 size={18} />}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* --- BUDGET MODE --- */}
            {viewMode === 'budget' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '12px', fontWeight: '900', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>Budget & Expenses</h2>
                </div>

                {/* Progress Card */}
                <div style={{ backgroundColor: '#ecfdf5', padding: '20px', borderRadius: '16px', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px' }}>
                    <div>
                      <p style={{ fontSize: '10px', fontWeight: '800', color: '#059669', textTransform: 'uppercase', margin: '0 0 4px 0' }}>Total Spent (KRW)</p>
                      <h3 style={{ fontSize: '24px', fontWeight: '900', color: '#064e3b', margin: 0 }}>₩ {totalSpentKRW.toLocaleString()}</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '10px', fontWeight: '800', color: '#34d399', textTransform: 'uppercase', margin: '0 0 4px 0' }}>Budget Limit</p>
                        <input 
                          type="number"
                          value={budgetSettings.limitKRW}
                          onChange={(e) => saveBudgetSettings({ ...budgetSettings, limitKRW: Number(e.target.value) })}
                          style={{ fontSize: '14px', fontWeight: '800', color: '#064e3b', backgroundColor: 'transparent', border: 'none', borderBottom: '2px solid #a7f3d0', width: '100px', textAlign: 'right', outline: 'none' }}
                        />
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '10px', fontWeight: '800', color: '#34d399', textTransform: 'uppercase', margin: '0 0 4px 0' }}>Local Currency</p>
                        <select 
                          value={budgetSettings.travelCurrency}
                          onChange={(e) => saveBudgetSettings({ ...budgetSettings, travelCurrency: e.target.value })}
                          style={{ fontSize: '14px', fontWeight: '800', color: '#064e3b', backgroundColor: 'transparent', border: 'none', borderBottom: '2px solid #a7f3d0', width: '130px', textAlign: 'right', outline: 'none', cursor: 'pointer', textOverflow: 'ellipsis' }}
                        >
                          {sortedCurrencies.length > 0 ? (
                            sortedCurrencies.map(c => <option key={`lc-${c.code}`} value={c.code}>{c.name} ({c.code})</option>)
                          ) : (
                            <option value="USD">미국 달러 (USD)</option>
                          )}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#d1fae5', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${budgetProgress}%`, height: '100%', backgroundColor: budgetProgress > 90 ? '#ef4444' : '#10b981', transition: 'width 0.3s ease' }}></div>
                  </div>
                  <p style={{ fontSize: '10px', fontWeight: '800', color: budgetProgress > 90 ? '#ef4444' : '#059669', marginTop: '8px', textAlign: 'right' }}>
                    {budgetProgress.toFixed(1)}% 사용됨
                    <span style={{ marginLeft: '4px', opacity: 0.8 }}>
                      {budgetSettings.limitKRW - totalSpentKRW >= 0 
                        ? `(남은 예산: ₩${(budgetSettings.limitKRW - totalSpentKRW).toLocaleString()})`
                        : `(예산 초과: ₩${Math.abs(budgetSettings.limitKRW - totalSpentKRW).toLocaleString()})`}
                    </span>
                  </p>
                </div>

                {/* Add Expense Form */}
                <div style={{ padding: '16px', backgroundColor: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '16px', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <select 
                      value={expenseInput.day} 
                      onChange={e => setExpenseInput({...expenseInput, day: e.target.value})}
                      style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: '12px', fontWeight: '700', outline: 'none' }}
                    >
                      <option value={0}>Pre-trip (Flight)</option>
                      {itinerary.map(d => <option key={`opt-day-${d.day}`} value={d.day}>Day {d.day}</option>)}
                    </select>
                    <select 
                      value={expenseInput.currency || budgetSettings.travelCurrency} 
                      onChange={e => setExpenseInput({...expenseInput, currency: e.target.value})}
                      style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: '12px', fontWeight: '700', outline: 'none' }}
                    >
                      {budgetSettings.travelCurrency !== 'KRW' && (
                        <option value={budgetSettings.travelCurrency}>⭐️ {getCurrencyNameKO(budgetSettings.travelCurrency)} ({budgetSettings.travelCurrency})</option>
                      )}
                      <option value="KRW">🇰🇷 대한민국 원 (KRW)</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <input 
                      type="text" 
                      placeholder="What did you buy?" 
                      value={expenseInput.desc}
                      onChange={e => setExpenseInput({...expenseInput, desc: e.target.value})}
                      style={{ flex: 2, minWidth: 0, boxSizing: 'border-box', padding: '10px', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: '12px', fontWeight: '700', outline: 'none' }}
                    />
                    <input 
                      type="number" 
                      placeholder="Amount" 
                      value={expenseInput.amount}
                      onChange={e => setExpenseInput({...expenseInput, amount: e.target.value})}
                      style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: '12px', fontWeight: '700', outline: 'none' }}
                    />
                  </div>
                  <button 
                    onClick={addExpense}
                    style={{ width: '100%', padding: '12px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontSize: '12px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)' }}
                  >
                    + ADD EXPENSE
                  </button>
                </div>

                {/* Expenses List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {expenses.length === 0 ? (
                    <div style={{ padding: '32px 20px', border: '2px dashed #e5e7eb', borderRadius: '16px', textAlign: 'center' }}>
                      <p style={{ fontSize: '11px', color: '#d1d5db', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>No expenses recorded</p>
                    </div>
                  ) : (
                    [0, ...itinerary.map(d=>d.day)].map(dayNum => {
                      const dayExpenses = expenses.filter(e => e.day === dayNum);
                      if (dayExpenses.length === 0) return null;
                      
                      return (
                        <div key={`exp-day-${dayNum}`} style={{ marginBottom: '16px' }}>
                          <h4 style={{ fontSize: '10px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>
                            {dayNum === 0 ? 'Pre-trip (Booking, etc)' : `Day ${dayNum} ${activeTrip?.startDate ? `(${getActualDateForDay(activeTrip.startDate, dayNum)})` : ''}`}
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {dayExpenses.map(exp => (
                              <div key={exp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                <div>
                                  <h5 style={{ fontSize: '13px', fontWeight: '800', color: '#111827', margin: '0 0 2px 0' }}>{exp.desc}</h5>
                                  <p style={{ fontSize: '10px', fontWeight: '700', color: '#9ca3af', margin: 0 }}>
                                    {exp.currency === 'KRW' ? '' : `${exp.amount.toLocaleString()} ${exp.currency}`}
                                  </p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <span style={{ fontSize: '14px', fontWeight: '900', color: '#059669' }}>
                                    ₩{exp.amountKRW.toLocaleString()}
                                  </span>
                                  <button 
                                    onClick={(e) => handleInlineDelete(e, `exp-${exp.id}`, () => deleteExpense(exp.id))} 
                                    style={{ padding: confirmDeleteId === `exp-${exp.id}` ? '6px 10px' : '6px', backgroundColor: confirmDeleteId === `exp-${exp.id}` ? '#ef4444' : '#fef2f2', color: confirmDeleteId === `exp-${exp.id}` ? 'white' : '#ef4444', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: '800' }}
                                  >
                                    {confirmDeleteId === `exp-${exp.id}` ? '확인' : <Trash2 size={14} />}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

          </div>

          {/* Footer */}
        <div style={{ padding: '24px 32px', borderTop: '1px solid #f3f4f6', backgroundColor: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: '900', color: '#111827', letterSpacing: '0.05em' }}>{favorites.length} SAVED • {totalSpots} PLANNED</span>
            <button onClick={() => setSidebarOpen(false)} style={{ fontSize: '11px', fontWeight: '900', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.05em' }}>CLOSE</button>
          </div>
        </aside>
      )}

      {/* Share Toast Notification */}
      <div style={{ 
        position: 'fixed', 
        bottom: '32px', 
        left: '50%', 
        transform: `translateX(-50%) translateY(${showShareToast ? '0' : '100px'})`, 
        opacity: showShareToast ? 1 : 0,
        zIndex: 10000,
        transition: 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        pointerEvents: showShareToast ? 'auto' : 'none'
      }}>
        <div style={{ 
          backgroundColor: 'rgba(17, 24, 39, 0.9)', 
          backdropFilter: 'blur(12px)', 
          color: 'white', 
          padding: '16px 24px', 
          borderRadius: '20px', 
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          minWidth: '320px'
        }}>
          <div style={{ width: '40px', height: '40px', backgroundColor: '#8b5cf6', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={20} color="white" />
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '900', color: '#a78bfa' }}>Code Copied!</h4>
            <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: '#d1d5db', lineHeight: 1.4 }}>이 코드를 친구에게 전달하면<br/>실시간으로 함께 일정을 짤 수 있습니다! 🤝</p>
          </div>
          <button 
            onClick={() => setShowShareToast(false)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* MAP VIEWPORT */}
      <div className="map-wrapper">

        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} className="absolute top-6 left-6 z-[2000] w-14 h-14 bg-white rounded-2xl shadow-2xl flex items-center justify-center text-blue-600 hover:scale-110 transition-all border border-white" style={{ position: 'absolute', top: '24px', left: '24px', zIndex: 2000, width: '56px', height: '56px', backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
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
          onClick={onMapClick}
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

          {/* Route Path (Polyline) */}
          {polylinePath.length > 0 && (
            <Polyline
              path={polylinePath}
              options={{
                strokeColor: '#3b82f6',
                strokeOpacity: 0.8,
                strokeWeight: 4,
                icons: [
                  {
                    icon: { path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, fillOpacity: 1, strokeColor: '#3b82f6' },
                    offset: '50%',
                    repeat: '100px'
                  }
                ],
              }}
            />
          )}

          {/* Itinerary Markers (for active day) */}
          {itinerary.find(d => d.day === activeDay)?.items.map((item, idx) => (
            <Marker
              key={`itin-mark-${item.id}`}
              position={{ lat: item.lat, lng: item.lng }}
              label={{
                text: `${idx + 1}`,
                color: 'white',
                fontSize: '14px',
                fontWeight: '900'
              }}
              onClick={() => setSelectedPlace(item)}
              icon={{
                url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="20" r="16" fill="#3b82f6" stroke="white" stroke-width="3"/>
                  </svg>
                `)}`,
                scaledSize: new window.google.maps.Size(40, 40),
                anchor: new window.google.maps.Point(20, 20)
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
              <div style={{ padding: '20px', minWidth: '300px', maxWidth: '340px', fontFamily: '"Inter", "Roboto", sans-serif' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ width: '56px', height: '56px', backgroundColor: '#f9fafb', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', border: '1px solid #f3f4f6', flexShrink: 0 }}>
                    {selectedPlace.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '900', margin: '0 0 6px 0', color: '#111827', lineHeight: 1.2 }}>{selectedPlace.name}</h3>
                    <p style={{ fontSize: '11px', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, display: 'flex', alignItems: 'flex-start', gap: '4px', lineHeight: 1.4 }}>
                      <MapPin size={12} color="#3b82f6" style={{ marginTop: '2px', flexShrink: 0 }} /> 
                      <span style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{selectedPlace.loc}</span>
                    </p>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => addToItinerary(selectedPlace)} 
                    style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: 'white', borderRadius: '12px', fontSize: '13px', fontWeight: '900', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <PlusCircle size={16} /> ADD TO DAY {activeDay}
                  </button>
                  <button 
                    onClick={() => toggleFavorite(selectedPlace)} 
                    style={{ padding: '12px', borderRadius: '12px', border: `2px solid ${isFavorite(selectedPlace) ? '#fee2e2' : '#f3f4f6'}`, backgroundColor: isFavorite(selectedPlace) ? '#fef2f2' : 'white', color: isFavorite(selectedPlace) ? '#ef4444' : '#9ca3af', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Heart size={20} fill={isFavorite(selectedPlace) ? "currentColor" : "none"} />
                  </button>
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>

    </div>
  );
}

export default App;
