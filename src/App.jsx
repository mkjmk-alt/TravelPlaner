import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Autocomplete, Polyline } from '@react-google-maps/api';
import { Heart, Search, Calendar, MapPin, Navigation, Star, PlusCircle, Trash2, AlertCircle, Wallet, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Plane, Menu, X, Compass, Plus, Edit2, Share2, Users, Copy, Check, Camera, Play, Image, Clock, Sparkles, Brain } from 'lucide-react';
import { supabase } from './supabaseClient';
import './index.css';

// --- CONFIGURATION ---
const HK_CENTER = { lat: 22.2891, lng: 114.1924 };
const MAP_LIBRARIES = ['places']; 
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const countryToCurrency = {
  "대한민국": "KRW",
  "일본": "JPY",
  "홍콩": "HKD",
  "마카오": "MOP",
  "대만": "TWD",
  "중국": "CNY",
  "태국": "THB",
  "베트남": "VND",
  "싱가포르": "SGD",
  "필리핀": "PHP",
  "말레이시아": "MYR",
  "인도네시아": "IDR",
  "몽골": "MNT",
  "미국": "USD",
  "괌/사이판": "USD",
  "캐나다": "CAD",
  "호주": "AUD",
  "뉴질랜드": "NZD",
  "영국": "GBP",
  "프랑스": "EUR",
  "독일": "EUR",
  "이탈리아": "EUR",
  "스페인": "EUR",
  "포르투갈": "EUR",
  "네덜란드": "EUR",
  "스위스": "CHF",
  "오스트리아": "EUR",
  "체코": "CZK",
  "헝가리": "HUF",
  "터키": "TRY"
};

const PremiumTimeInput = ({ value, onChange, label }) => {
  // Ensure we always have a valid time format even if value is empty
  const timeValue = value && value.includes(':') ? value : '09:00';
  const [hh, mm] = timeValue.split(':');
  
  const adjustTime = (type, amount) => {
    let [h, m] = timeValue.split(':').map(Number);
    if (type === 'h') {
      h = (h + amount + 24) % 24;
    } else {
      // Calculate using total minutes to handle hour overflow/underflow
      let totalMinutes = h * 60 + m + amount;
      totalMinutes = (totalMinutes + 1440) % 1440; // Handle 24h wrap around
      h = Math.floor(totalMinutes / 60);
      m = totalMinutes % 60;
    }
    
    const newH = h.toString().padStart(2, '0');
    const newM = m.toString().padStart(2, '0');
    onChange(`${newH}:${newM}`);
  };

  const setNow = () => {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    onChange(`${h}:${m}`);
  };

  return (
    <div style={{ width: '100%', marginBottom: '20px' }}>
      {label && <div style={{ fontSize: '10px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>{label}</div>}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        backgroundColor: 'white',
        padding: '14px',
        borderRadius: '20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
        border: '1px solid #f1f5f9'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <button onClick={() => adjustTime('h', 1)} style={{ border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '2px' }}><ChevronUp size={14} /></button>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', width: '36px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{hh}</div>
            <button onClick={() => adjustTime('h', -1)} style={{ border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '2px' }}><ChevronDown size={14} /></button>
          </div>
          
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#e2e8f0', marginTop: '2px' }}>:</div>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <button onClick={() => adjustTime('m', 5)} style={{ border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '2px' }}><ChevronUp size={14} /></button>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', width: '36px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{mm}</div>
            <button onClick={() => adjustTime('m', -5)} style={{ border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '2px' }}><ChevronDown size={14} /></button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button 
            onClick={setNow}
            style={{ 
              padding: '6px 12px', 
              backgroundColor: '#f8fafc', 
              color: '#64748b', 
              border: '1px solid #e2e8f0', 
              borderRadius: '10px', 
              fontSize: '10px', 
              fontWeight: '900', 
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            NOW
          </button>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => adjustTime('m', -30)} style={{ width: '36px', height: '32px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '8px', fontSize: '10px', fontWeight: '900', color: '#94a3b8', cursor: 'pointer' }}>-30</button>
            <button onClick={() => adjustTime('m', 30)} style={{ width: '36px', height: '32px', backgroundColor: '#eff6ff', border: 'none', borderRadius: '8px', fontSize: '10px', fontWeight: '900', color: '#3b82f6', cursor: 'pointer' }}>+30</button>
          </div>
        </div>
      </div>
    </div>
  );
};


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
    language: 'ko',
    region: 'KR'
  });

  // --- GLOBAL UI & AUTH STATE ---
  const [session, setSession] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [touchStartY, setTouchStartY] = useState(0);

  const onTouchStart = (e) => {
    const target = e.target;
    if (target.closest('.drag-handle') || target.closest('.sidebar-header')) {
      setIsDragging(true);
      setTouchStartY(e.touches[0].clientY);
    }
  };

  const onTouchMove = (e) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY;
    if (sidebarOpen) {
      if (diff > 0) setDragOffset(diff);
    } else {
      if (diff < 0) setDragOffset(diff);
    }
  };

  const onTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (sidebarOpen) {
      if (dragOffset > 100) setSidebarOpen(false);
    } else {
      if (dragOffset < -100) setSidebarOpen(true);
    }
    setDragOffset(0);
  };
  const [viewMode, setViewMode] = useState('trips');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [activeDay, setActiveDay] = useState(1);
  const [expandedCountries, setExpandedCountries] = useState({});
  const [editingTripId, setEditingTripId] = useState(null);
  const [editTripData, setEditTripData] = useState({ name: "", startDate: "", endDate: "", country: "" });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [map, setMap] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [isLoadingDB, setIsLoadingDB] = useState(true);
  const [showShareToast, setShowShareToast] = useState(false);
  const [hasTriggeredToast, setHasTriggeredToast] = useState(false);
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const [itineraryTime, setItineraryTime] = useState('');
  const [editingTimeItem, setEditingTimeItem] = useState(null); // { day, id, time, name }
  const [showAIModal, setShowAIModal] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState(null);
  const slideshowTimerRef = useRef(null);

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

        if (!cloudTrips && (trips || []).length > 0) {
          await supabase.from('user_state').upsert({ user_id: session.user.id, key: 'world_pro_trips_v1', value: trips || [] }, { onConflict: 'user_id,key' });
        } else if (cloudTrips) {
          setTrips(cloudTrips || []);
          localStorage.setItem('world_pro_trips_v1', JSON.stringify(cloudTrips || []));
          if (!activeTripId && (cloudTrips || []).length > 0) setActiveTripId(cloudTrips[0].id);
        }

        if (!cloudFavs && (favorites || []).length > 0) {
          // Initial sync from local to cloud
          await supabase.from('user_state').upsert({ user_id: session.user.id, key: 'world_pro_fav_v1', value: favorites || [] }, { onConflict: 'user_id,key' });
        } else if (cloudFavs) {
          setFavorites(cloudFavs || []);
          localStorage.setItem('world_pro_fav_v1', JSON.stringify(cloudFavs || []));
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
    const safeTrips = trips || [];
    const sharedIds = safeTrips.filter(t => t.sharedId).map(t => t.sharedId);
    if (sharedIds.length === 0) return;

    // Listen for any changes in the shared_trips table
    const channel = supabase
      .channel('shared-trips-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shared_trips' }, payload => {
        const sharedId = payload.new.id;
        const updatedData = payload.new.trip_data;
        
        setTrips(prev => (prev || []).map(t => 
          t.sharedId === sharedId ? { ...updatedData, sharedId } : t
        ));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [(trips || []).filter(t => t.sharedId).length]);

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
  const activeTrip = (trips || []).find(t => t.id === activeTripId);
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
    if (!address) return '기타';
    
    // 1. Check for South Korea specific keywords (provinces, cities)
    const krKeywords = ['강원', '경기', '서울', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '대한민국'];
    if (krKeywords.some(k => address.includes(k))) return '대한민국';

    // 2. Check if the address contains any of our known countries
    const knownCountries = Object.keys(countryToCurrency);
    for (const c of knownCountries) {
      if (address.includes(c)) return c;
    }

    // 3. Fallback to parsing by comma
    const parts = address.split(',').map(p => p.trim());
    let country = parts[parts.length - 1];
    
    // Clean up common noise (postal codes, Plus Codes, etc.)
    country = country.replace(/[0-9]{5,}/g, '') 
                     .replace(/[A-Z0-9]{4}\+[A-Z0-9]{2,}/g, '') 
                     .trim();
    
    if (country.length > 10 || !country) {
      const firstPart = parts[0].split(' ')[0];
      if (knownCountries.includes(firstPart)) return firstPart;
      return '기타';
    }

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
    (favorites || []).forEach(fav => {
      if (!fav || !fav.loc) return;
      const country = getCountryFromAddress(fav.loc);
      if (!groups[country]) groups[country] = [];
      groups[country].push(fav);
    });
    return groups;
  }, [favorites]);

  const polylinePath = useMemo(() => {
    const dayPlan = itinerary.find(d => d.day === activeDay);
    if (!dayPlan || (dayPlan.items || []).length < 2) return [];
    return (dayPlan.items || []).map(item => ({ lat: item.lat, lng: item.lng }));
  }, [itinerary, activeDay]);

  const toggleCountry = (country) => {
    setExpandedCountries(prev => ({
      ...prev,
      [country]: !prev[country]
    }));
  };

  const syncFavoritesToCloud = async (newFavs) => {
    const safeFavs = newFavs || [];
    setFavorites(safeFavs);
    localStorage.setItem('world_pro_fav_v1', JSON.stringify(safeFavs));
    
    if (session?.user?.id) {
      try {
        const { error } = await supabase
          .from('user_state')
          .upsert(
            { user_id: session.user.id, key: 'world_pro_fav_v1', value: safeFavs },
            { onConflict: 'user_id,key' }
          );
        if (error) throw error;
      } catch (err) {
        console.error("Favorites cloud sync failed:", err);
      }
    }
  };

  const saveFavorites = (newFavs) => {
    syncFavoritesToCloud(newFavs);
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
        try {
          const { error } = await supabase
            .from('shared_trips')
            .update({ trip_data: trip })
            .eq('id', trip.sharedId);
          if (error) throw error;
        } catch (err) {
          console.error("Shared trip update failed:", err);
        }
      }
    }
  };

  const shareTrip = async (tripId) => {
    const trip = (trips || []).find(t => t.id === tripId);
    if (!trip) return;
    if (trip.sharedId) {
      copyToClipboard(trip.sharedId, tripId);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('shared_trips')
        .insert({ trip_data: trip })
        .select()
        .single();

      if (error) {
        console.error("Supabase insert error:", error);
        throw new Error(error.message || "Database insert failed");
      }

      const newTrips = trips.map(t => t.id === tripId ? { ...t, sharedId: data.id } : t);
      await syncTripsToCloud(newTrips);
      copyToClipboard(data.id, tripId);
      
      setHasTriggeredToast(true);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 5000);
    } catch (err) {
      console.error("Sharing failed detail:", err);
      alert(`공유에 실패했습니다: ${err.message || "네트워크나 데이터베이스 설정을 확인해주세요."}`);
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

      if ((trips || []).some(t => t.sharedId === data.id)) {
        alert("이미 목록에 있는 일정입니다.");
        return;
      }

      const joinedTrip = { ...data.trip_data, sharedId: data.id };
      const newTrips = [joinedTrip, ...(trips || [])];
      await syncTripsToCloud(newTrips);
      setActiveTripId(joinedTrip.id);
      setViewMode('itinerary');
      alert(`'${joinedTrip.name}' 일정에 참여했습니다!`);
    } catch (err) {
      alert("올바른 공유 코드를 입력해 주세요.");
    }
  };

  const copyToClipboard = (text, id) => {
    if (!text) return;
    
    const performCopy = async () => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          // Fallback for non-secure contexts
          const textArea = document.createElement("textarea");
          textArea.value = text;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
        }
        
        setCopiedId(id);
        setHasTriggeredToast(true);
        setShowShareToast(true);
        setTimeout(() => {
          setCopiedId(null);
          setShowShareToast(false);
        }, 5000);
      } catch (err) {
        console.error("Copy failed:", err);
        alert("초대 코드 복사에 실패했습니다. 수동으로 복사해주세요: " + text);
      }
    };

    performCopy();
  };

  // --- TRIP DATA MUTATORS ---
  const updateActiveTrip = async (updates) => {
    if (!activeTripId) return;
    
    // Calculate new state array based on existing state
    const nextTrips = (trips || []).map(t => t.id === activeTripId ? { ...t, ...updates } : t);
    
    // Sync to cloud and update local state
    await syncTripsToCloud(nextTrips);
  };

  // --- PHOTO HELPERS ---
  const handlePhotoUpload = (file, dayNumber, itemId) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const nextTrips = (trips || []).map(t => {
        if (t.id === activeTripId) {
          const newItin = (t.itinerary || []).map(day => {
            if (day.day === dayNumber) {
              return { ...day, items: day.items.map(it => it.id === itemId ? { ...it, image: reader.result } : it) };
            }
            return day;
          });
          return { ...t, itinerary: newItin };
        }
        return t;
      });
      syncTripsToCloud(nextTrips);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoDelete = (dayNumber, itemId) => {
    const nextTrips = (trips || []).map(t => {
      if (t.id === activeTripId) {
        const newItin = (t.itinerary || []).map(day => {
          if (day.day === dayNumber) {
            return { ...day, items: day.items.map(it => it.id === itemId ? { ...it, image: null } : it) };
          }
          return day;
        });
        return { ...t, itinerary: newItin };
      }
      return t;
    });
    syncTripsToCloud(nextTrips);
  };

  // Collect all photos for slideshow
  const allPhotos = useMemo(() => {
    if (!activeTrip?.itinerary) return [];
    const photos = [];
    (activeTrip.itinerary || []).forEach(day => {
      (day.items || []).forEach(item => {
        if (item.image) {
          photos.push({ image: item.image, name: item.name, emoji: item.emoji, day: day.day, cat: item.cat });
        }
      });
    });
    return photos;
  }, [activeTrip]);

  // Slideshow auto-play
  useEffect(() => {
    if (showSlideshow && allPhotos.length > 1) {
      slideshowTimerRef.current = setInterval(() => {
        setSlideshowIndex(prev => (prev + 1) % allPhotos.length);
      }, 4000);
    }
    return () => {
      if (slideshowTimerRef.current) clearInterval(slideshowTimerRef.current);
    };
  }, [showSlideshow, allPhotos.length]);

  // --- AI ANALYSIS ---
  const generateAIAnalysis = async () => {
    if (!activeTrip) return;
    
    console.log("--- Starting AI Analysis ---");
    console.log("Current API Key:", GEMINI_API_KEY ? "Loaded (starts with " + GEMINI_API_KEY.substring(0, 7) + ")" : "MISSING");

    if (!GEMINI_API_KEY) {
      alert(".env 파일에 VITE_GEMINI_API_KEY를 설정해주세요.");
      setShowAIModal(false);
      return;
    }
    
    setIsAnalyzing(true);
    setShowAIModal(true);
    setAiReport(null);

    // 1. Prepare data for AI
    const itineraryText = (activeTrip.itinerary || []).map(day => (
      `Day ${day.day}:\n${(day.items || []).map(it => `- ${it.time || 'Time TBD'} - ${it.name}(${it.loc})`).join('\n')}`
    )).join('\n\n');

    const totalSpent = (expenses || []).reduce((acc, curr) => acc + (curr.amountKRW || 0), 0);
    const budgetText = `Budget Limit: ₩${budgetSettings.limitKRW.toLocaleString()}, Total Spent: ₩${totalSpent.toLocaleString()}`;

    // 2. Craft the prompt
    const prompt = `
      You are a professional travel consultant. Please analyze this travel itinerary and provide a detailed report.
      Trip Name: ${activeTrip.name}
      Destination: ${activeTrip.country || 'Not specified'}
      
      [Itinerary]
      ${itineraryText}
      
      [Budget]
      ${budgetText}

      Please analyze the following 5 points in Korean:
      1. Route Efficiency (Geographical optimization)
      2. Tempo & Fatigue (Is it too tight or too loose?)
      3. Variety & Theme (Balance of activities)
      4. Budget Realism (Is the budget appropriate for the destination?)
      5. Practical Pro-tips (Specific advice for this trip)

      [Critical Request]
      Also provide an "optimizedItinerary" which is a restructured version of the input itinerary for better efficiency. 
      Keep EXACTLY the same data structure for days and items (including all fields like id, name, time, loc, lat, lng, placeId).

      Respond strictly in JSON format as follows:
      {
        "score": number (overall score 0-100),
        "summary": "Short overall summary in Korean",
        "sections": [
          { "title": "동선 효율성", "score": number, "content": "Detailed analysis in Korean" },
          { "title": "여행 강도", "score": number, "content": "Detailed analysis in Korean" },
          { "title": "테마 및 균형", "score": number, "content": "Detailed analysis in Korean" },
          { "title": "예산 적절성", "score": number, "content": "Detailed analysis in Korean" },
          { "title": "AI 전문가 꿀팁", "score": number, "content": "Detailed analysis in Korean" }
        ],
        "tips": ["Tip 1 in Korean", "Tip 2 in Korean", "Tip 3 in Korean"],
        "optimizedItinerary": [
          { "day": 1, "items": [...] }
        ]
      }
    `;

    try {
      console.log("Sending request to Gemini API...");
      // 최신 고속 모델인 gemini-1.5-flash를 사용합니다. 
      // (주의: Google Cloud Console에서 Generative Language API가 활성화되어 있어야 합니다.)
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      console.log("Response status:", response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("API Error Response:", errorData);
        throw new Error(`API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log("Raw AI Response Data:", data);

      if (!data.candidates || !data.candidates[0]) {
        throw new Error("No candidates found in AI response");
      }

      const text = data.candidates[0].content.parts[0].text;
      console.log("AI Text Output:", text);
      
      // Remove potential markdown code blocks and extract JSON
      const cleanJsonText = text.replace(/```json|```/g, "").trim();
      const jsonMatch = cleanJsonText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          console.log("Parsed JSON Report:", result);
          setAiReport(result);
        } catch (parseError) {
          console.error("JSON Parse Error:", parseError, "Text:", jsonMatch[0]);
          throw new Error("AI 응답을 해석하는 중 오류가 발생했습니다.");
        }
      } else {
        throw new Error("AI가 유효한 JSON 형식을 반환하지 않았습니다.");
      }
    } catch (error) {
      console.error("FULL ERROR LOG:", error);
      alert(`AI 분석 도중 오류가 발생했습니다.\n원인: ${error.message.substring(0, 100)}...`);
      setShowAIModal(false);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyAIProposedPlan = async () => {
    if (!aiReport || !aiReport.optimizedItinerary || !activeTrip) return;

    if (!confirm("AI가 제안한 최적화된 일정으로 현재 일정을 교체하시겠습니까?")) return;

    try {
      const updatedItinerary = aiReport.optimizedItinerary;
      
      // 1. 전체 일정 배열에서 현재 여행의 itinerary만 교체
      const nextTrips = trips.map(t => t.id === activeTrip.id ? { ...t, itinerary: updatedItinerary } : t);
      
      // 2. 통합 동기화 함수 호출 (로컬 저장 및 Cloud DB 업데이트 포함)
      await syncTripsToCloud(nextTrips);

      setShowAIModal(false);
      alert("✨ AI 최적화 일정이 성공적으로 적용되었습니다!");
    } catch (error) {
      console.error("Apply AI Plan failed:", error);
      alert("일정 적용 중 오류가 발생했습니다.");
    }
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
      country: "",
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
    setEditTripData({ name: "New Trip", startDate: today, endDate: today, country: "" });
  };

  const startRenameTrip = (trip) => {
    setEditingTripId(trip.id);
    setEditTripData({ 
      name: trip.name, 
      startDate: trip.startDate || "", 
      endDate: trip.endDate || "",
      country: trip.country || ""
    });
  };

  const saveRenameTrip = (id) => {
    if (editTripData.name.trim() !== "") {
      const { name, startDate, endDate, country } = editTripData;
      let newItinerary = null;
      let travelCurrency = null;
      
      if (country && countryToCurrency[country]) {
        travelCurrency = countryToCurrency[country];
      }
      
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

      const nextTrips = (trips || []).map(t => {
        if (t.id === id) {
          const tripToUpdate = { ...t, name: name.trim(), startDate, endDate, country };
          if (newItinerary) {
             tripToUpdate.itinerary = newItinerary.map((newDay, idx) => t.itinerary[idx] || newDay);
          }
          if (travelCurrency) {
            tripToUpdate.budgetSettings = { ...t.budgetSettings, travelCurrency };
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
    const newTrips = (trips || []).filter(t => t.id !== id);
    // Wait for cloud sync to finish before any UI navigation
    await syncTripsToCloud(newTrips);
    
    if (activeTripId === id) {
      setActiveTripId(newTrips.length > 0 ? newTrips[0].id : null);
      setViewMode('trips');
    }
  };

  const moveTrip = async (id, direction) => {
    const index = (trips || []).findIndex(t => t.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === (trips || []).length - 1) return;

    const newTrips = [...(trips || [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newTrips[index], newTrips[targetIndex]] = [newTrips[targetIndex], newTrips[index]];
    
    await syncTripsToCloud(newTrips);
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
    if (!place) return;
    const safeFavs = favorites || [];
    const isFav = safeFavs.some(f => f.name === place.name);
    const nextFavs = isFav 
      ? safeFavs.filter(f => f.name !== place.name)
      : [...safeFavs, { ...place, id: Date.now() }];
    
    syncFavoritesToCloud(nextFavs);
  };

  const isFavorite = (place) => {
    if (!place) return false;
    return (favorites || []).some(f => f.name === place.name);
  };

  const addToItinerary = (place) => {
    const newItinerary = [...itinerary];
    const dayIndex = newItinerary.findIndex(d => d.day === activeDay);
    
    if (dayIndex !== -1) {
      let finalTime = itineraryTime;
      
      // Option 2: Smart Default Logic
      if (!finalTime) {
        const dayItems = newItinerary[dayIndex].items;
        const itemsWithTime = dayItems.filter(it => it.time);
        
        if (itemsWithTime.length > 0) {
          const lastItem = itemsWithTime[itemsWithTime.length - 1];
          const [h, m] = lastItem.time.split(':').map(Number);
          let totalMins = h * 60 + m + 90; // Suggest 1.5 hours later
          if (totalMins >= 1440) totalMins = totalMins - 1440;
          
          const hh = Math.floor(totalMins / 60).toString().padStart(2, '0');
          const mm = (totalMins % 60).toString().padStart(2, '0');
          finalTime = `${hh}:${mm}`;
        } else {
          finalTime = '09:00'; // Initial default
        }
      }

      newItinerary[dayIndex].items.push({ 
        ...place, 
        id: Date.now(),
        emoji: place.emoji || '📍',
        time: finalTime
      });
      saveItinerary(newItinerary);
      setItineraryTime(''); 
      setViewMode('itinerary');
    }
  };

  const updateItineraryItemTime = (dayNumber, itemId, newTime) => {
    const nextTrips = (trips || []).map(t => {
      if (t.id === activeTripId) {
        const newItin = (t.itinerary || []).map(day => {
          if (day.day === dayNumber) {
            const updatedItems = day.items.map(it => it.id === itemId ? { ...it, time: newTime } : it);
            // Option 1: Auto-sort by time chronologically
            updatedItems.sort((a, b) => {
              if (!a.time) return 1;
              if (!b.time) return -1;
              return a.time.localeCompare(b.time);
            });
            return { ...day, items: updatedItems };
          }
          return day;
        });
        return { ...t, itinerary: newItin };
      }
      return t;
    });
    syncTripsToCloud(nextTrips);
  };

  const moveItineraryItem = (dayNumber, itemId, direction) => {
    const nextTrips = (trips || []).map(t => {
      if (t.id === activeTripId) {
        const newItin = (t.itinerary || []).map(day => {
          if (day.day === dayNumber) {
            const items = [...day.items];
            const index = items.findIndex(it => it.id === itemId);
            if (index === -1) return day;
            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex >= 0 && newIndex < items.length) {
              // Create shallow copies of items to avoid mutating state directly
              const itemA = { ...items[index] };
              const itemB = { ...items[newIndex] };
              
              // Swap the time values between the two items
              const timeA = itemA.time;
              const timeB = itemB.time;
              
              itemA.time = timeB;
              itemB.time = timeA;
              
              // Now swap the entire items at their positions
              items[index] = itemB;
              items[newIndex] = itemA;
            }
            return { ...day, items };
          }
          return day;
        });
        return { ...t, itinerary: newItin };
      }
      return t;
    });
    syncTripsToCloud(nextTrips);
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
            desc: place.formatted_address || 'Selected from Map',
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

  const totalSpots = (itinerary || []).reduce((acc, day) => acc + (day.items || []).length, 0);
  const totalSpentKRW = (expenses || []).reduce((acc, curr) => acc + (curr.amountKRW || 0), 0);
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
    <div className={`app-container ${!sidebarOpen ? 'sidebar-closed' : ''}`}>
      
      {/* GLOBAL SEARCH BAR */}
      <div className="search-bar-container" style={{ 
        position: 'fixed', 
        top: '20px', 
        left: '50%', 
        transform: 'translateX(-50%)', 
        zIndex: 3000, 
        width: 'calc(100% - 32px)', 
        maxWidth: '448px',
        pointerEvents: 'none'
      }}>
        <div className="search-bar-inner" style={{ 
          backgroundColor: 'rgba(255,255,255,0.95)', 
          backdropFilter: 'blur(20px)',
          borderRadius: '24px', 
          display: 'flex', 
          padding: '8px', 
          boxShadow: '0 20px 50px rgba(0,0,0,0.15)', 
          alignItems: 'center',
          border: '1px solid rgba(255,255,255,0.8)',
          pointerEvents: 'auto'
        }}>
           <div style={{ flex: 1, padding: '0 16px', display: 'flex', alignItems: 'center', height: '48px' }}>
             <div style={{ width: '100%' }}>
               <Autocomplete 
                  onLoad={(a) => { autocompleteRef.current = a; }} 
                  onPlaceChanged={onPlaceSelected}
               >
                 <input 
                    type="text" 
                    placeholder="어디로 떠나시나요?" 
                    style={{ 
                      width: '100%', 
                      height: '48px', 
                      lineHeight: 'normal', 
                      background: 'transparent', 
                      border: 'none', 
                      outline: 'none', 
                      fontSize: '16px', 
                      fontWeight: 'bold', 
                      color: '#1f2937', 
                      padding: 0, 
                      margin: 0, 
                      display: 'block' 
                    }}
                 />
               </Autocomplete>
             </div>
           </div>
           <button style={{ width: '48px', height: '48px', backgroundColor: '#2563eb', color: 'white', borderRadius: '16px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>
             <Search size={20} />
           </button>
        </div>
      </div>

      {/* SIDEBAR UI */}
      <aside 
        className={`sidebar-container ${!sidebarOpen ? 'closed' : ''} ${isDragging ? 'dragging' : ''}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: sidebarOpen ? `translateY(${dragOffset}px)` : `translateY(calc(100% - 60px + ${dragOffset}px))`
        }}
      >
        <div 
          className="drag-handle" 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{ cursor: 'pointer' }}
        ></div>

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

                {(trips || []).length === 0 ? (
                  <div style={{ padding: '40px 20px', border: '2px dashed #e5e7eb', borderRadius: '16px', textAlign: 'center' }}>
                    <Plane size={36} color="#d1d5db" style={{ margin: '0 auto 12px auto' }} />
                    <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>No trips planned yet</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(trips || []).map(trip => (
                      <div 
                        key={trip.id} 
                        onClick={() => { setActiveTripId(trip.id); setViewMode('itinerary'); }}
                        style={{ padding: '20px', backgroundColor: activeTripId === trip.id ? '#f5f3ff' : 'white', border: activeTripId === trip.id ? '2px solid #ddd6fe' : '1px solid #e5e7eb', borderRadius: '16px', cursor: 'pointer', transition: '0.2s' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          {editingTripId === trip.id ? (
                            <div 
                              onClick={(e) => e.stopPropagation()} 
                              style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                  <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '10px', fontWeight: '900', color: '#9ca3af' }}>COUNTRY</label>
                                    <select 
                                      value={editTripData.country}
                                      onChange={(e) => setEditTripData({ ...editTripData, country: e.target.value, currency: countryToCurrency[e.target.value] || 'KRW' })}
                                      style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', fontWeight: '700', outline: 'none', boxSizing: 'border-box' }}
                                    >
                                      <option value="">나라 선택</option>
                                      <option value="대한민국">대한민국</option>
                                      {Object.keys(countryToCurrency)
                                        .filter(c => c !== "대한민국")
                                        .sort()
                                        .map(c => (
                                          <option key={c} value={c}>{c}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '10px', fontWeight: '900', color: '#9ca3af' }}>NAME</label>
                                    <input 
                                      type="text" 
                                      value={editTripData.name} 
                                      onChange={(e) => setEditTripData({ ...editTripData, name: e.target.value })}
                                      placeholder="Trip Name"
                                      style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', fontWeight: '700', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                  <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '10px', fontWeight: '900', color: '#9ca3af' }}>START DATE</label>
                                    <input 
                                      type="date" 
                                      value={editTripData.startDate} 
                                      onChange={(e) => setEditTripData({ ...editTripData, startDate: e.target.value })}
                                      style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', fontWeight: '700', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                  <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '10px', fontWeight: '900', color: '#9ca3af' }}>END DATE</label>
                                    <input 
                                      type="date" 
                                      value={editTripData.endDate} 
                                      onChange={(e) => setEditTripData({ ...editTripData, endDate: e.target.value })}
                                      style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', fontWeight: '700', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                </div>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); saveRenameTrip(trip.id); }}
                                style={{ padding: '12px', backgroundColor: '#8b5cf6', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', marginTop: '8px', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.2)' }}
                              >
                                SAVE TRIP DETAILS
                              </button>
                            </div>
                          ) : (
                            <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px' }}>
                          <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#111827', margin: 0, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trip.name}</h3>
                          <div style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <button 
                                onClick={(e) => { e.stopPropagation(); moveTrip(trip.id, 'up'); }}
                                style={{ background: 'none', border: 'none', color: (trips || []).indexOf(trip) === 0 ? '#e5e7eb' : '#9ca3af', cursor: (trips || []).indexOf(trip) === 0 ? 'default' : 'pointer', padding: '2px' }}
                                disabled={(trips || []).indexOf(trip) === 0}
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); moveTrip(trip.id, 'down'); }}
                                style={{ background: 'none', border: 'none', color: (trips || []).indexOf(trip) === (trips || []).length - 1 ? '#e5e7eb' : '#9ca3af', cursor: (trips || []).indexOf(trip) === (trips || []).length - 1 ? 'default' : 'pointer', padding: '2px' }}
                                disabled={(trips || []).indexOf(trip) === (trips || []).length - 1}
                              >
                                <ChevronDown size={14} />
                              </button>
                            </div>
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
                          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', fontWeight: '800', color: '#6b7280', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                              <Calendar size={13} color="#9ca3af" /> 
                              {trip.startDate ? (
                                <>
                                  <span style={{ color: '#111827' }}>{trip.startDate} ~ {trip.endDate}</span>
                                  <span style={{ color: '#9ca3af', marginLeft: '4px' }}>({(trip.itinerary || []).length} {(trip.itinerary || []).length === 1 ? 'Day' : 'Days'})</span>
                                </>
                              ) : (
                                <span style={{ color: '#111827' }}>{(trip.itinerary || []).length} {(trip.itinerary || []).length === 1 ? 'Day' : 'Days'}</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                              <Wallet size={13} color="#9ca3af" /> 
                              <span style={{ color: '#111827' }}>₩ {(trip.expenses || []).reduce((sum, e) => sum + (e.amountKRW || 0), 0).toLocaleString()}</span>
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
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {allPhotos.length > 0 && (
                      <button 
                        onClick={() => { setSlideshowIndex(0); setShowSlideshow(true); }} 
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '800', color: '#8b5cf6', backgroundColor: '#f5f3ff', padding: '8px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}
                      >
                        <Play size={14} /> MOVIE ({allPhotos.length})
                      </button>
                    )}
                    <button onClick={addDay} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '800', color: '#2563eb', backgroundColor: '#eff6ff', padding: '8px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                      <PlusCircle size={14} /> ADD DAY
                    </button>
                    <button 
                      onClick={generateAIAnalysis} 
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '800', color: 'white', backgroundColor: '#8b5cf6', padding: '8px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)' }}
                    >
                      <Sparkles size={14} /> AI 분석
                    </button>
                  </div>
                </div>

                {(itinerary || []).map((dayPlan, dIdx) => (
                  <div 
                    key={dayPlan?.day || dIdx} 
                    style={{ 
                      backgroundColor: 'white', 
                      borderRadius: '24px', 
                      border: '1px solid #f3f4f6', 
                      boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                      overflow: 'hidden',
                      marginBottom: '32px'
                    }}
                  >
                    {/* Day Header */}
                    <div 
                      onClick={() => dayPlan?.day && setActiveDay(dayPlan.day)}
                      style={{ 
                        padding: '20px 24px', 
                        backgroundColor: activeDay === dayPlan?.day ? '#eff6ff' : '#f9fafb', 
                        borderBottom: '1px solid #f3f4f6', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                          width: '40px', 
                          height: '40px', 
                          backgroundColor: activeDay === dayPlan?.day ? '#2563eb' : '#9ca3af', 
                          borderRadius: '12px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: '900',
                          fontSize: '14px',
                          transition: 'background-color 0.2s'
                        }}>
                          {dayPlan?.day}
                        </div>
                        <div>
                          <h3 style={{ fontSize: '16px', fontWeight: '900', color: '#111827', margin: 0 }}>Day {dayPlan?.day}</h3>
                          <p style={{ fontSize: '12px', fontWeight: '700', color: activeDay === dayPlan?.day ? '#3b82f6' : '#9ca3af', margin: 0 }}>
                            {getActualDateForDay(activeTrip?.startDate, dayPlan?.day)}
                          </p>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: '900', color: activeDay === dayPlan?.day ? '#3b82f6' : '#9ca3af', backgroundColor: activeDay === dayPlan?.day ? '#dbeafe' : '#f3f4f6', padding: '4px 10px', borderRadius: '8px' }}>
                        {(dayPlan?.items || []).length} SPOTS
                      </span>
                    </div>

                    {/* Day Items List */}
                    <div style={{ padding: '24px' }}>
                      {(!dayPlan?.items || dayPlan.items.length === 0) ? (
                        <div style={{ padding: '32px', textAlign: 'center', border: '2px dashed #f3f4f6', borderRadius: '16px' }}>
                          <p style={{ fontSize: '13px', color: '#d1d5db', fontWeight: '700', margin: 0 }}>이 날의 일정을 추가해 보세요!</p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          {dayPlan.items.map((item, iIdx) => (
                              <div 
                                key={item.id} 
                                style={{ 
                                  display: 'flex', 
                                  flexDirection: 'column',
                                  gap: '12px', 
                                  padding: '16px', 
                                  backgroundColor: 'white', 
                                  border: '1px solid #f3f4f6',
                                  borderRadius: '20px',
                                  transition: 'all 0.2s',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                      <h4 style={{ 
                                        fontSize: (item.name?.length > 15 ? '12px' : item.name?.length > 10 ? '14px' : '17px'), 
                                        fontWeight: '900', 
                                        color: '#000000', 
                                        margin: 0, 
                                        whiteSpace: 'nowrap',
                                        flexShrink: 1,
                                        transition: 'font-size 0.2s ease'
                                      }}>
                                        {item.name || '장소 이름 정보 없음'}
                                      </h4>
                                      <div 
                                        onClick={() => setEditingTimeItem({ day: dayPlan.day, id: item.id, time: item.time || '09:00', name: item.name })}
                                        style={{ 
                                          display: 'flex', 
                                          alignItems: 'center', 
                                          gap: '4px', 
                                          backgroundColor: '#f1f5f9', 
                                          padding: '4px 10px', 
                                          borderRadius: '8px', 
                                          border: '1px solid #e2e8f0', 
                                          flexShrink: 0,
                                          cursor: 'pointer',
                                          transition: 'all 0.2s',
                                          hover: { backgroundColor: '#e2e8f0' }
                                        }}
                                      >
                                        <Clock size={11} color="#64748b" />
                                        <span style={{ 
                                          fontSize: '12px', 
                                          fontWeight: '800', 
                                          color: '#475569', 
                                          fontVariantNumeric: 'tabular-nums'
                                        }}>
                                          {item.time || '09:00'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginRight: '4px' }}>
                                      <button 
                                        onClick={() => moveItineraryItem(dayPlan.day, item.id, 'up')}
                                        style={{ background: 'none', border: 'none', color: iIdx === 0 ? '#e5e7eb' : '#9ca3af', cursor: iIdx === 0 ? 'default' : 'pointer', padding: '2px' }}
                                        disabled={iIdx === 0}
                                      >
                                        <ChevronUp size={14} />
                                      </button>
                                      <button 
                                        onClick={() => moveItineraryItem(dayPlan.day, item.id, 'down')}
                                        style={{ background: 'none', border: 'none', color: iIdx === dayPlan.items.length - 1 ? '#e5e7eb' : '#9ca3af', cursor: iIdx === dayPlan.items.length - 1 ? 'default' : 'pointer', padding: '2px' }}
                                        disabled={iIdx === dayPlan.items.length - 1}
                                      >
                                        <ChevronDown size={14} />
                                      </button>
                                    </div>
                                    <label style={{ cursor: 'pointer', padding: '10px', color: item.image ? '#8b5cf6' : '#9ca3af', backgroundColor: item.image ? '#f5f3ff' : 'transparent', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="사진 추가">
                                      <Camera size={18} />
                                      <input 
                                        type="file" 
                                        accept="image/*" 
                                        style={{ display: 'none' }} 
                                        onChange={(e) => { handlePhotoUpload(e.target.files[0], dayPlan.day, item.id); e.target.value = ''; }}
                                      />
                                    </label>
                                    <button 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        const isKoreaTrip = activeTrip?.country === '대한민국';
                                        const isKoreaAddress = ['대한민국', '강원', '경기', '서울', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '충북', '충남', '전북', '전남', '경북', '경남', '제주'].some(k => item.loc?.includes(k));
                                        
                                        // 한국 여행이거나 주소에 한국 지명이 포함된 경우에만 네이버 지도 사용
                                          if (isKoreaTrip || isKoreaAddress) {
                                            const destName = encodeURIComponent(item.name);
                                            const dlat = item.lat;
                                            const dlng = item.lng;
                                            
                                            // 네이버 지도 웹용 길찾기 URL (가장 확실한 Lat/Lng 지원 방식)
                                            const webUrl = `https://map.naver.com/index.nhn?elng=${dlng}&elat=${dlat}&etext=${destName}&menu=route&pathType=1`;
                                            
                                            if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                                              // iOS: nmap 앱 딥링크로 길찾기 실행 (pubtrans가 대중교통 모드)
                                              const nMapAppUrl = `nmap://route/pubtrans?dlat=${dlat}&dlng=${dlng}&dname=${destName}&appname=worldpro`;
                                              window.location.href = nMapAppUrl;
                                              setTimeout(() => {
                                                // 앱이 없을 경우 웹으로 폴백
                                                window.open(webUrl, '_blank');
                                              }, 1500);
                                            } else if (/Android/i.test(navigator.userAgent)) {
                                              // 안드로이드: Intent 스킴을 사용하여 앱 실행 시도, 미설치 시 웹/스토어 유도
                                              const intentUrl = `intent://route/pubtrans?dlat=${dlat}&dlng=${dlng}&dname=${destName}&appname=worldpro#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end`;
                                              window.location.href = intentUrl;
                                              setTimeout(() => {
                                                window.open(webUrl, '_blank');
                                              }, 1500);
                                            } else {
                                              // 데스크톱 및 기타 브라우저
                                              window.open(webUrl, '_blank');
                                            }
                                          } else {
                                          // 해외인 경우 구글 지도
                                          const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}&destination_place_id=${item.placeId || ''}`;
                                          
                                          // 아이폰/iOS인 경우 구글 지도 앱 호출 시도
                                          if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                                            const appUrl = `comgooglemaps://?daddr=${item.lat},${item.lng}&directionsmode=walking`;
                                            window.location.href = appUrl;
                                            // 앱이 없는 경우를 대비해 약간의 지연 후 웹으로 연결 (iOS 특성상 앱이 없으면 아무 일도 안 일어남)
                                            setTimeout(() => {
                                              window.open(googleUrl, '_blank');
                                            }, 500);
                                          } else {
                                            window.open(googleUrl, '_blank');
                                          }
                                        }
                                      }}
                                      style={{ padding: '10px', color: '#3b82f6', backgroundColor: '#eff6ff', border: 'none', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                      title="길찾기"
                                    >
                                      <Navigation size={18} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleInlineDelete(e, `itin-${item.id}`, () => removeFromItinerary(dIdx, item.id)); }}
                                      style={{ padding: confirmDeleteId === `itin-${item.id}` ? '10px 14px' : '10px', color: confirmDeleteId === `itin-${item.id}` ? 'white' : '#f87171', backgroundColor: confirmDeleteId === `itin-${item.id}` ? '#ef4444' : 'transparent', border: 'none', borderRadius: '10px', cursor: 'pointer', flexShrink: 0 }}
                                    >
                                      {confirmDeleteId === `itin-${item.id}` ? '확인' : <Trash2 size={18} />}
                                    </button>
                                  </div>
                                </div>

                                {/* Photo Display */}
                                {item.image && (
                                  <div style={{ position: 'relative', width: '100%', height: '180px', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
                                    <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    <div style={{ 
                                      position: 'absolute', bottom: 0, left: 0, right: 0, 
                                      background: 'linear-gradient(transparent, rgba(0,0,0,0.6))', 
                                      padding: '24px 16px 12px', 
                                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' 
                                    }}>
                                      <span style={{ color: 'white', fontSize: '13px', fontWeight: '800', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>{item.emoji} {item.name}</span>
                                    </div>
                                    <button 
                                      onClick={() => handlePhotoDelete(dayPlan.day, item.id)}
                                      style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', color: 'white', border: 'none', borderRadius: '10px', padding: '6px', cursor: 'pointer', display: 'flex' }}
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                )}

                              </div>
                          ))}
                        </div>
                      )}
                    </div>
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
            <span style={{ fontSize: '11px', fontWeight: '900', color: '#111827', letterSpacing: '0.05em' }}>{(favorites || []).length} SAVED • {totalSpots} PLANNED</span>
            <button onClick={() => setSidebarOpen(false)} style={{ fontSize: '11px', fontWeight: '900', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.05em' }}>CLOSE</button>
          </div>
        </aside>

      {/* Share Toast Notification */}
      {hasTriggeredToast && (
        <div style={{ 
          position: 'fixed', 
          bottom: '32px', 
          left: '50%', 
          transform: `translateX(-50%) translateY(${showShareToast ? '0' : '100px'})`, 
          opacity: showShareToast ? 1 : 0,
          visibility: showShareToast ? 'visible' : 'hidden',
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
      )}

      {/* MAP VIEWPORT */}
      <div className="map-wrapper">
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} className="absolute top-6 left-6 z-[2000] w-14 h-14 bg-white rounded-2xl shadow-2xl flex items-center justify-center text-blue-600 hover:scale-110 transition-all border border-white" style={{ position: 'absolute', top: '24px', left: '24px', zIndex: 2000, width: '56px', height: '56px', backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
            <Menu size={24} />
          </button>
        )}

        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={HK_CENTER}
          zoom={3}
          onLoad={(m) => setMap(m)}
          options={mapOptions}
          onClick={onMapClick}
        >
          {/* Favorite Markers */}
          {(favorites || []).map(fav => (
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

                <PremiumTimeInput 
                  label="Arrival Time"
                  value={itineraryTime || '09:00'} 
                  onChange={(val) => setItineraryTime(val)} 
                />
                
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

      {!sidebarOpen && (
        <button 
          onClick={() => setSidebarOpen(true)}
          className="desktop-only"
          style={{ 
            position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', 
            zIndex: 1100, backgroundColor: '#111827', color: 'white', border: 'none', 
            padding: '12px 24px', borderRadius: '30px', fontWeight: '900', fontSize: '13px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '8px',
            cursor: 'pointer', animation: 'fadeIn 0.3s ease'
          }}
        >
          <Menu size={16} /> SHOW MENU
        </button>
      )}
    {/* === SLIDESHOW MODAL === */}
    {showSlideshow && allPhotos.length > 0 && (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
        backgroundColor: '#000', display: 'flex', flexDirection: 'column',
        animation: 'fadeIn 0.5s ease'
      }}>
        {/* Photo */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <img
            key={slideshowIndex}
            src={allPhotos[slideshowIndex]?.image}
            alt={allPhotos[slideshowIndex]?.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', animation: 'fadeIn 1s ease' }}
          />
          {/* Gradient overlay */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.8) 100%)', padding: '60px 32px 32px' }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 8px 0' }}>
              DAY {allPhotos[slideshowIndex]?.day}
            </p>
            <h2 style={{ color: 'white', fontSize: '24px', fontWeight: '900', margin: '0 0 4px 0', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
              {allPhotos[slideshowIndex]?.emoji} {allPhotos[slideshowIndex]?.name}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', fontWeight: '700', margin: 0 }}>
              {activeTrip?.name}
            </p>
          </div>
          {/* Top bar */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(rgba(0,0,0,0.5), transparent)' }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: '800', letterSpacing: '0.1em' }}>
              {slideshowIndex + 1} / {allPhotos.length}
            </span>
            <button 
              onClick={() => setShowSlideshow(false)} 
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', color: 'white', border: 'none', borderRadius: '12px', padding: '8px 16px', cursor: 'pointer', fontWeight: '800', fontSize: '12px' }}
            >
              닫기
            </button>
          </div>
          {/* Nav buttons */}
          {allPhotos.length > 1 && (
            <>
              <button 
                onClick={() => setSlideshowIndex(prev => (prev - 1 + allPhotos.length) % allPhotos.length)}
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', color: 'white', border: 'none', borderRadius: '50%', width: '44px', height: '44px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ChevronLeft size={22} />
              </button>
              <button 
                onClick={() => setSlideshowIndex(prev => (prev + 1) % allPhotos.length)}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', color: 'white', border: 'none', borderRadius: '50%', width: '44px', height: '44px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}
          {/* Progress dots */}
          <div style={{ position: 'absolute', bottom: '120px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '6px' }}>
            {allPhotos.map((_, i) => (
              <div 
                key={i} 
                onClick={() => setSlideshowIndex(i)}
                style={{ 
                  width: i === slideshowIndex ? '24px' : '8px', 
                  height: '8px', 
                  borderRadius: '4px', 
                  backgroundColor: i === slideshowIndex ? 'white' : 'rgba(255,255,255,0.3)', 
                  cursor: 'pointer',
                  transition: 'all 0.3s ease' 
                }} 
              />
            ))}
          </div>
        </div>
      </div>
    )}

      {/* Premium Time Edit Modal */}
      {editingTimeItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '32px',
            width: '100%',
            maxWidth: '360px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            position: 'relative',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <button 
              onClick={() => setEditingTimeItem(null)}
              style={{ position: 'absolute', top: '20px', right: '20px', border: 'none', background: '#f1f5f9', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', fontWeight: '900', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Edit Time</div>
              <h3 style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editingTimeItem.name}</h3>
            </div>

            <PremiumTimeInput 
              value={editingTimeItem.time}
              onChange={(newTime) => setEditingTimeItem({ ...editingTimeItem, time: newTime })}
              label="Select Schedule"
            />

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button 
                onClick={() => setEditingTimeItem(null)}
                style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0', backgroundColor: 'white', color: '#64748b', fontSize: '15px', fontWeight: '900', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  updateItineraryItemTime(editingTimeItem.day, editingTimeItem.id, editingTimeItem.time);
                  setEditingTimeItem(null);
                }}
                style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', backgroundColor: '#3b82f6', color: 'white', fontSize: '15px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.3)' }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      {/* === AI ANALYSIS MODAL === */}
      {showAIModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000,
          backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          animation: 'fadeIn 0.3s ease-out'
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '32px', width: '100%', maxWidth: '500px',
            maxHeight: '85vh', overflowY: 'auto', padding: '32px', position: 'relative',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <button 
              onClick={() => setShowAIModal(false)}
              style={{ position: 'absolute', top: '24px', right: '24px', border: 'none', background: '#f1f5f9', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
            >
              <X size={20} color="#64748b" />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ 
                width: '64px', height: '64px', backgroundColor: '#f5f3ff', borderRadius: '22px', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
                boxShadow: '0 8px 16px rgba(139, 92, 246, 0.15)'
              }}>
                <Sparkles size={32} color="#8b5cf6" />
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>AI 여행 전략 리포트</h2>
              <p style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>{activeTrip?.name} 일정을 전문가가 분석했습니다.</p>
            </div>

            {isAnalyzing ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ width: '48px', height: '48px', border: '4px solid #8b5cf6', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 24px', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ fontWeight: '800', color: '#8b5cf6', letterSpacing: '0.05em', animation: 'pulse 1.5s infinite' }}>데이터 분석 및 전략 수립 중...</p>
              </div>
            ) : aiReport && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Overall Score */}
                <div style={{ 
                  background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)', 
                  padding: '28px', borderRadius: '28px', textAlign: 'center',
                  border: '1px solid rgba(139, 92, 246, 0.1)'
                }}>
                  <div style={{ fontSize: '11px', fontWeight: '900', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>종합 분석 스코어</div>
                  <div style={{ fontSize: '56px', fontWeight: '900', color: '#7c3aed', lineHeight: 1, marginBottom: '16px' }}>
                    {aiReport.score}<span style={{ fontSize: '20px', color: '#a78bfa' }}>/100</span>
                  </div>
                  <p style={{ fontSize: '14px', color: '#4c1d95', fontWeight: '800', margin: 0, lineHeight: 1.6, padding: '0 10px' }}>
                    "{aiReport.summary}"
                  </p>
                </div>

                {/* Analysis Sections */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {aiReport.sections.map((sec, idx) => (
                    <div key={idx} style={{ padding: '20px', border: '1px solid #f1f5f9', borderRadius: '24px', backgroundColor: '#ffffff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h4 style={{ fontSize: '15px', fontWeight: '900', color: '#1e293b', margin: 0 }}>{sec.title}</h4>
                        <div style={{ fontSize: '12px', fontWeight: '900', color: '#8b5cf6', backgroundColor: '#f5f3ff', padding: '4px 10px', borderRadius: '10px' }}>{sec.score}점</div>
                      </div>
                      <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6, margin: 0, fontWeight: '600' }}>{sec.content}</p>
                    </div>
                  ))}
                </div>

                {/* Pro Tips Section */}
                <div style={{ backgroundColor: '#f0f9ff', padding: '24px', borderRadius: '28px', border: '1px solid #e0f2fe' }}>
                  <h4 style={{ fontSize: '15px', fontWeight: '900', color: '#0369a1', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Brain size={18} /> 전문가 추천 Action Item
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {aiReport.tips.map((tip, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#0ea5e9', marginTop: '6px', flexShrink: 0 }}></div>
                        <p style={{ fontSize: '13px', color: '#0c4a6e', fontWeight: '700', margin: 0, lineHeight: 1.4 }}>{tip}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button 
                    onClick={() => setShowAIModal(false)}
                    style={{ flex: 1, padding: '18px', borderRadius: '20px', border: '1px solid #e2e8f0', backgroundColor: 'white', color: '#64748b', fontSize: '15px', fontWeight: '900', cursor: 'pointer' }}
                  >
                    닫기
                  </button>
                  <button 
                    onClick={applyAIProposedPlan}
                    style={{ flex: 2, padding: '18px', borderRadius: '20px', border: 'none', backgroundColor: '#8b5cf6', color: 'white', fontSize: '15px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 10px 20px rgba(139, 92, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <Check size={18} /> 수정안 적용하기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
      `}</style>
    </div>
  );
}

export default App;
