// Build Version: v1.2.2-build-trigger-fix
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, OverlayView, InfoWindow, Polyline } from '@react-google-maps/api';
import { Heart, Search, Calendar, MapPin, Navigation, Star, PlusCircle, Trash2, AlertCircle, Wallet, ChevronRight, ChevronUp, ChevronDown, Plane, Menu, X, Compass, Plus, Edit2, Share2, Users, Copy, Check, Clock, Upload, Clipboard, LocateFixed, Download, Bell, FileText } from 'lucide-react';
import { supabase } from './supabaseClient';
import './index.css';

// --- CONFIGURATION ---
const HK_CENTER = { lat: 22.2891, lng: 114.1924 };
const MAP_LIBRARIES = ['places']; 
const runtimeConfig = typeof window !== "undefined" ? window.__TRAVELPLANER_CONFIG__ || {} : {};
const GOOGLE_MAPS_API_KEY = runtimeConfig.googleMapsApiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const readStoredJson = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (error) {
    console.warn("저장된 데이터를 읽지 못했습니다.", error);
    return fallback;
  }
};

const writeStoredJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn("저장 공간에 데이터를 기록하지 못했습니다.", error);
    return false;
  }
};

const ONBOARDING_STORAGE_KEY = 'travelplaner_onboarding_seen_v1';

const escapeIcsText = (value) => String(value || '')
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

const getIcsDateTime = (startDate, dayNumber, time, offsetMinutes = 0) => {
  const date = new Date(`${startDate}T${time || '09:00'}:00`);
  date.setDate(date.getDate() + (Number(dayNumber) - 1));
  date.setMinutes(date.getMinutes() + offsetMinutes);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
};

const getCurrentTimeInputValue = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getEndDateForDayCount = (startDate, dayCount) => {
  if (!startDate || !Number.isFinite(dayCount) || dayCount < 1) return startDate;
  const endDate = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(endDate.getTime())) return startDate;
  endDate.setDate(endDate.getDate() + dayCount - 1);
  return formatLocalDate(endDate);
};

const buildItineraryForDayCount = (existingItinerary, dayCount) => (
  Array.from({ length: dayCount }, (_, index) => {
    const existingDay = (existingItinerary || [])[index];
    return existingDay
      ? { ...existingDay, day: index + 1 }
      : { day: index + 1, items: [] };
  })
);

const getFormattableText = (value) => {
  if (typeof value === 'string') return value;
  return value?.text || '';
};

const LLM_IMPORT_TEMPLATE = JSON.stringify({
  name: '나트랑 4박 5일 여행',
  country: '베트남',
  startDate: '2026-09-01',
  endDate: '2026-09-05',
  itinerary: [
    {
      day: 1,
      items: [
        {
          name: '깜라인 국제공항 도착',
          displayName: '공항 도착',
          time: '22:00',
          loc: 'Cam Ranh International Airport'
        }
      ]
    },
    {
      day: 2,
      items: [
        {
          name: '포나가르 참탑',
          displayName: '포나가르 참탑 방문',
          time: '10:00',
          loc: 'Po Nagar Cham Towers'
        },
        {
          name: '나트랑 야시장',
          displayName: '저녁 야시장',
          time: '19:00',
          loc: 'Nha Trang Night Market'
        }
      ]
    }
  ],
  reserveItems: [
    {
      name: '아이리조트 온천',
      displayName: '시간이 되면 방문할 장소',
      time: '15:00',
      loc: 'I-Resort Nha Trang'
    }
  ]
}, null, 2);

const parseImportedJsonText = (text) => {
  const trimmed = String(text || '').trim();
  const fencedJson = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fencedJson ? fencedJson[1] : trimmed);
};

const CustomMapMarker = ({ position, onClick, icon, label, ariaLabel }) => {
  const width = Number(icon?.scaledSize?.width) || 40;
  const height = Number(icon?.scaledSize?.height) || width;

  return (
    <OverlayView
      position={position}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={() => ({ x: -width / 2, y: -height / 2 })}
    >
      <button
        type="button"
        aria-label={ariaLabel || (label?.text ? `지도 ${label.text}` : '지도 장소')}
        onClick={onClick}
        style={{
          position: 'relative',
          display: 'block',
          width: `${width}px`,
          height: `${height}px`,
          padding: 0,
          border: 0,
          background: 'transparent',
          cursor: onClick ? 'pointer' : 'default'
        }}
      >
        {icon?.url && <img src={icon.url} alt="" width={width} height={height} draggable="false" style={{ display: 'block' }} />}
        {label?.text && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: label.color || 'white',
              fontSize: label.fontSize || '14px',
              fontWeight: label.fontWeight || '700',
              pointerEvents: 'none',
              lineHeight: 1
            }}
          >
            {label.text}
          </span>
        )}
      </button>
    </OverlayView>
  );
};

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

const CURRENCY_FAVORITES_STORAGE_KEY = 'world_pro_currency_favorites_v1';
const SUPPORTED_CURRENCY_CODES = [
  'USD', 'KRW', 'VND', 'EUR', 'JPY', 'CNY', 'TWD', 'HKD', 'MOP', 'THB',
  'SGD', 'PHP', 'MYR', 'IDR', 'MNT', 'CAD', 'AUD', 'NZD', 'GBP', 'CHF',
  'CZK', 'HUF', 'TRY'
];

const PAYMENT_METHODS = [
  { value: 'cash', label: '현금' },
  { value: 'card', label: '카드' },
  { value: 'transfer', label: '계좌이체' }
];

const getPaymentMethodLabel = (method) => (
  PAYMENT_METHODS.find(option => option.value === method)?.label || '결제수단 미지정'
);

const getCurrencySymbol = (code = 'KRW') => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol'
    }).formatToParts(0).find(part => part.type === 'currency')?.value || code;
  } catch {
    return code;
  }
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
    <div style={{ width: '100%', marginBottom: window.innerWidth < 768 ? '8px' : '20px' }}>
      {label && <div style={{ fontSize: '9px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', marginBottom: window.innerWidth < 768 ? '4px' : '8px', letterSpacing: '0.05em' }}>{label}</div>}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        backgroundColor: 'white',
        padding: window.innerWidth < 768 ? '8px 12px' : '14px',
        borderRadius: '16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
        border: '1px solid #f1f5f9'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
            <button onClick={() => adjustTime('h', 1)} style={{ border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '1px' }}><ChevronUp size={12} /></button>
            <div style={{ fontSize: window.innerWidth < 768 ? '20px' : '26px', fontWeight: '900', color: '#0f172a', width: '30px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{hh}</div>
            <button onClick={() => adjustTime('h', -1)} style={{ border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '1px' }}><ChevronDown size={12} /></button>
          </div>
          
          <div style={{ fontSize: '16px', fontWeight: '900', color: '#e2e8f0' }}>:</div>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
            <button onClick={() => adjustTime('m', 5)} style={{ border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '1px' }}><ChevronUp size={12} /></button>
            <div style={{ fontSize: window.innerWidth < 768 ? '20px' : '26px', fontWeight: '900', color: '#0f172a', width: '30px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{mm}</div>
            <button onClick={() => adjustTime('m', -5)} style={{ border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '1px' }}><ChevronDown size={12} /></button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <button 
            onClick={setNow}
            style={{ 
              padding: '2px 8px', 
              backgroundColor: '#f8fafc', 
              color: '#64748b', 
              border: '1px solid #e2e8f0', 
              borderRadius: '6px', 
              fontSize: '8px', 
              fontWeight: '900', 
              cursor: 'pointer'
            }}
          >
            현재 시간
          </button>
          <div style={{ display: 'flex', gap: '2px' }}>
            <button onClick={() => adjustTime('m', -30)} style={{ width: '28px', height: '24px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '4px', fontSize: '8px', fontWeight: '900', color: '#94a3b8', cursor: 'pointer' }}>-30</button>
            <button onClick={() => adjustTime('m', 30)} style={{ width: '28px', height: '24px', backgroundColor: '#eff6ff', border: 'none', borderRadius: '4px', fontSize: '8px', fontWeight: '900', color: '#3b82f6', cursor: 'pointer' }}>+30</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ScrollTimeInput = ({ value, onChange, label }) => {
  const timeValue = value && value.includes(':') ? value : '09:00';
  const [rawHour, rawMinute] = timeValue.split(':').map(Number);
  const hour = Number.isFinite(rawHour) ? Math.min(Math.max(rawHour, 0), 23) : 9;
  const minute = Number.isFinite(rawMinute) ? Math.min(Math.max(rawMinute, 0), 59) : 0;
  const hourRef = useRef(null);
  const minuteRef = useRef(null);
  const ITEM_HEIGHT = 36;
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const minutes = Array.from({ length: 60 }, (_, index) => index);

  const emitTime = (nextHour, nextMinute) => {
    const nextValue = `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
    if (nextValue !== timeValue) onChange(nextValue);
  };

  const scrollToValue = (ref, index, behavior = 'auto') => {
    if (!ref.current) return;
    ref.current.scrollTo({ top: index * ITEM_HEIGHT, behavior });
  };

  useEffect(() => {
    scrollToValue(hourRef, hour);
    scrollToValue(minuteRef, minute);
  }, [hour, minute]);

  const handleScroll = (type, event) => {
    const index = Math.round(event.currentTarget.scrollTop / ITEM_HEIGHT);
    if (type === 'hour') {
      emitTime(Math.min(Math.max(index, 0), 23), minute);
    } else {
      emitTime(hour, Math.min(Math.max(index, 0), 59));
    }
  };

  const setNow = () => {
    const now = new Date();
    emitTime(now.getHours(), now.getMinutes());
  };

  const adjustMinutes = (amount) => {
    const totalMinutes = (hour * 60 + minute + amount + 1440) % 1440;
    emitTime(Math.floor(totalMinutes / 60), totalMinutes % 60);
  };

  const renderScrollColumn = (items, selectedValue, ref, type) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <div
        ref={ref}
        onScroll={(event) => handleScroll(type, event)}
        aria-label={type === 'hour' ? '시간 선택' : '분 선택'}
        style={{ width: '58px', height: '108px', overflowY: 'auto', overscrollBehavior: 'contain', scrollSnapType: 'y mandatory', scrollbarWidth: 'thin', border: '1px solid #e2e8f0', borderRadius: '12px', backgroundColor: '#f8fafc', WebkitOverflowScrolling: 'touch' }}
      >
        <div style={{ padding: `${ITEM_HEIGHT}px 0` }}>
          {items.map(item => (
            <button
              key={`${type}-${item}`}
              type="button"
              aria-label={`${type === 'hour' ? '시간' : '분'} ${String(item).padStart(2, '0')} 선택`}
              onClick={() => emitTime(type === 'hour' ? item : hour, type === 'minute' ? item : minute)}
              style={{ display: 'block', width: '100%', height: `${ITEM_HEIGHT}px`, padding: 0, border: 'none', backgroundColor: item === selectedValue ? '#dbeafe' : 'transparent', color: item === selectedValue ? '#1d4ed8' : '#94a3b8', fontSize: item === selectedValue ? '20px' : '14px', fontWeight: item === selectedValue ? '900' : '700', fontVariantNumeric: 'tabular-nums', scrollSnapAlign: 'center', cursor: 'pointer' }}
            >
              {String(item).padStart(2, '0')}
            </button>
          ))}
        </div>
      </div>
      <span style={{ fontSize: '16px', fontWeight: '900', color: '#cbd5e1' }}>{type === 'hour' ? '시' : '분'}</span>
    </div>
  );

  return (
    <div style={{ width: '100%', marginBottom: window.innerWidth < 768 ? '8px' : '20px' }}>
      {label && <div style={{ fontSize: '9px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', marginBottom: window.innerWidth < 768 ? '4px' : '8px', letterSpacing: '0.05em' }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', backgroundColor: 'white', padding: window.innerWidth < 768 ? '10px' : '14px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {renderScrollColumn(hours, hour, hourRef, 'hour')}
          <span style={{ fontSize: '20px', fontWeight: '900', color: '#cbd5e1' }}>:</span>
          {renderScrollColumn(minutes, minute, minuteRef, 'minute')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          <button type="button" onClick={setNow} style={{ padding: '5px 7px', backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '8px', fontWeight: '900', cursor: 'pointer', whiteSpace: 'nowrap' }}>현재 시간</button>
          <div style={{ display: 'flex', gap: '3px' }}>
            <button type="button" onClick={() => adjustMinutes(-30)} style={{ width: '30px', height: '25px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '5px', fontSize: '8px', fontWeight: '900', color: '#94a3b8', cursor: 'pointer' }}>-30</button>
            <button type="button" onClick={() => adjustMinutes(30)} style={{ width: '30px', height: '25px', backgroundColor: '#eff6ff', border: 'none', borderRadius: '5px', fontSize: '8px', fontWeight: '900', color: '#3b82f6', cursor: 'pointer' }}>+30</button>
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
  const parseDay = (d) => parseInt(String(d).replace(/[^0-9]/g, '')) || 0;
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAP_LIBRARIES,
    language: 'ko',
    region: 'KR'
  });

  // --- GLOBAL UI & AUTH STATE ---
  const [session, setSession] = useState(null);
  
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [sheetMode, setSheetMode] = useState('half'); // 'collapsed' | 'half' | 'full'
  const sidebarOpen = sheetMode !== 'collapsed';
  const setSidebarOpen = (open) => {
    setSheetMode(open ? 'half' : 'collapsed');
  };

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [touchStartY, setTouchStartY] = useState(0);

  const onTouchStart = (e) => {
    const target = e.target;
    if (
      target.closest('.drag-handle') || 
      (target.closest('.sidebar-header') && !target.closest('button') && !target.closest('a') && !target.closest('input'))
    ) {
      setIsDragging(true);
      setTouchStartY(e.touches[0].clientY);
    }
  };

  const onTouchMove = (e) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY;
    setDragOffset(diff);
  };

  const onTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    if (windowSize.width < 768) {
      const H = windowSize.height;
      const snapPoints = {
        full: 0,
        half: H * 0.45,
        collapsed: H - 60
      };
      
      let baseTranslatePx = snapPoints[sheetMode];
      let finalTranslatePx = baseTranslatePx + dragOffset;
      finalTranslatePx = Math.max(0, Math.min(H - 60, finalTranslatePx));
      
      let closestMode = sheetMode;
      let minDiff = Infinity;
      
      Object.entries(snapPoints).forEach(([mode, value]) => {
        const diff = Math.abs(finalTranslatePx - value);
        if (diff < minDiff) {
          minDiff = diff;
          closestMode = mode;
        }
      });
      
      setSheetMode(closestMode);
    } else {
      if (sidebarOpen) {
        if (dragOffset > 100) setSidebarOpen(false);
      } else {
        if (dragOffset < -100) setSidebarOpen(true);
      }
    }
    setDragOffset(0);
  };
  const [viewMode, setViewMode] = useState('trips');
  const [isMobileHeaderHidden, setIsMobileHeaderHidden] = useState(false);
  const openItinerary = () => {
    setIsMobileHeaderHidden(false);
    setViewMode('itinerary');
    if (windowSize.width < 768) setSheetMode('full');
  };

  const handleSidebarScroll = (e) => {
    if (windowSize.width >= 768) return;
    const shouldHideHeader = e.currentTarget.scrollTop > 8;
    setIsMobileHeaderHidden((hidden) => hidden === shouldHideHeader ? hidden : shouldHideHeader);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [activeDay, setActiveDay] = useState(null);
  const [expandedCountries, setExpandedCountries] = useState({});
  const [editingTripId, setEditingTripId] = useState(null);
  const [editTripData, setEditTripData] = useState({ name: "", startDate: "", endDate: "", country: "" });
  const [showCreateTripModal, setShowCreateTripModal] = useState(false);
  const [createTripData, setCreateTripData] = useState({ name: "", startDate: "", endDate: "", country: "" });
  const [createTripError, setCreateTripError] = useState('');
  const [openItineraryAfterCreate, setOpenItineraryAfterCreate] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [map, setMap] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [isLoadingDB, setIsLoadingDB] = useState(true);
  const [syncStatus, setSyncStatus] = useState('saved');
  const [showShareToast, setShowShareToast] = useState(false);
  const [hasTriggeredToast, setHasTriggeredToast] = useState(false);
  const [showJoinTripModal, setShowJoinTripModal] = useState(false);
  const [joinTripCode, setJoinTripCode] = useState('');
  const [joinTripError, setJoinTripError] = useState('');
  const [isJoiningTrip, setIsJoiningTrip] = useState(false);
  const [itineraryTime, setItineraryTime] = useState('');
  const [itineraryDisplayName, setItineraryDisplayName] = useState('');
  const [editingTimeItem, setEditingTimeItem] = useState(null); // { day, id, time, displayName, originalName }
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [modalConfig, setModalConfig] = useState({ type: 'success', title: '', message: '' });
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showFullRoute, setShowFullRoute] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !readStoredJson(ONBOARDING_STORAGE_KEY, false));
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [mergeNotice, setMergeNotice] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(() => (
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  ));
  const [showCashReconciliation, setShowCashReconciliation] = useState(false);
  const [showCurrencyManager, setShowCurrencyManager] = useState(false);

  const handleMyLocation = () => {
    if (!navigator.geolocation) {
      setModalConfig({ 
        type: 'error', 
        title: '위치 정보 지원 불가', 
        message: '이 브라우저에서는 위치 정보를 사용할 수 없습니다.' 
      });
      setShowCustomModal(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newPos = { lat: latitude, lng: longitude };
        setUserLocation(newPos);
        if (map) {
          map.panTo(newPos);
          map.setZoom(15);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        setModalConfig({ 
          type: 'error', 
          title: '위치 정보 오류', 
          message: '위치 정보를 가져올 수 없습니다. GPS 권한을 허용했는지 확인해주세요.' 
        });
        setShowCustomModal(true);
      },
      { enableHighAccuracy: true }
    );
  };

  const dayColors = [
    '#4f46e5', // Indigo
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#f97316'  // Orange
  ];
  const getDayColor = (idx) => dayColors[idx % dayColors.length];

  // --- DATA STATE ---
  const [favorites, setFavorites] = useState(() => {
    const savedFavorites = readStoredJson("world_pro_fav_v1", []);
    return Array.isArray(savedFavorites) ? savedFavorites : [];
  });

  const [favoriteCurrencies, setFavoriteCurrencies] = useState(() => {
    const savedCurrencies = readStoredJson(CURRENCY_FAVORITES_STORAGE_KEY, null);
    if (!Array.isArray(savedCurrencies)) return ['USD'];
    return Array.from(new Set(savedCurrencies.filter(code => SUPPORTED_CURRENCY_CODES.includes(code))));
  });

  const [trips, setTrips] = useState(() => {
    const savedTrips = readStoredJson("world_pro_trips_v1", null);
    if (Array.isArray(savedTrips)) {
      // Remove local-only test trips when the app starts. Real trips are kept intact.
      const cleanedTrips = savedTrips.filter(trip => !trip.localOnly);
      if (cleanedTrips.length !== savedTrips.length) {
        writeStoredJson("world_pro_trips_v1", cleanedTrips);
      }
      return cleanedTrips.map(trip => ({
        ...trip,
        reserveItems: Array.isArray(trip.reserveItems) ? trip.reserveItems : []
      }));
    }
    
    const oldItinerary = readStoredJson("world_pro_v16", []);
    const oldBudget = readStoredJson("world_pro_budget_v1", { limitKRW: 1000000, travelCurrency: "USD" });
    const oldExpenses = readStoredJson("world_pro_expenses_v1", []);
    
    if (oldItinerary.length > 0 || oldExpenses.length > 0) {
      const migratedTrip = {
        id: Date.now().toString(),
        name: "첫 여행",
        itinerary: oldItinerary.length > 0 ? oldItinerary : [{ day: 1, items: [] }],
        reserveItems: [],
        budgetSettings: oldBudget,
        expenses: oldExpenses,
        createdAt: Date.now()
      };
      writeStoredJson("world_pro_trips_v1", [migratedTrip]);
      return [migratedTrip];
    }
    return [];
  });

  const [activeTripId, setActiveTripId] = useState(null);

  const [exchangeRates, setExchangeRates] = useState({});
  const [expenseInput, setExpenseInput] = useState(() => ({ desc: '', amount: '', currency: '', paymentMethod: '', day: 1, time: getCurrentTimeInputValue() }));
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [placeSuggestions, setPlaceSuggestions] = useState([]);

  const sharedTripCount = (trips || []).filter(t => t.sharedId).length;
  const suggestionRequestRef = useRef(0);
  const autocompleteSessionTokenRef = useRef(null);
  const makeEntityId = () => crypto.randomUUID();

  // --- EFFECTS ---

  // Also clear a test trip that may still be held by an already-open local page.
  useEffect(() => {
    const cleanedTrips = (trips || []).filter(trip => !trip.localOnly);
    if (cleanedTrips.length === (trips || []).length) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrips(cleanedTrips);
    writeStoredJson("world_pro_trips_v1", cleanedTrips);
  }, [trips]);
  
  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  // Reset activeDay when trip changes
  useEffect(() => {
    // Intentionally reset the selected day when switching trips.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveDay(null);
  }, [activeTripId]);

  // Reset the custom itinerary name when the selected place changes
  useEffect(() => {
    // Keep the custom label in sync with the selected place.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItineraryDisplayName(selectedPlace?.displayName || '');
  }, [selectedPlace]);

  // Cloud Sync Initialization
  useEffect(() => {
    async function initCloudDB() {
      if (!session) {
        setIsLoadingDB(false);
        setSyncStatus("saved");
        return;
      }
      setSyncStatus("saving");
      try {
        const { data, error } = await supabase.from('user_state').select('*').eq('user_id', session.user.id);
        if (error) throw error;
        
        let cloudTrips = null;
        let cloudFavs = null;
        let mergedTripCount = 0;
        let mergedFavoriteCount = 0;
        
        if (data && data.length > 0) {
          const tripsRow = data.find(r => r.key === 'world_pro_trips_v1');
          if (tripsRow) cloudTrips = tripsRow.value;
          
          const favsRow = data.find(r => r.key === 'world_pro_fav_v1');
          if (favsRow) cloudFavs = favsRow.value;
        }

        const localTestTrips = (trips || []).filter(trip => trip.localOnly);
        const localRegularTrips = (trips || []).filter(trip => !trip.localOnly);

        if (!cloudTrips && localRegularTrips.length > 0) {
          const { error: localTripSyncError } = await supabase.from("user_state").upsert({ user_id: session.user.id, key: "world_pro_trips_v1", value: localRegularTrips }, { onConflict: "user_id,key" });
          if (localTripSyncError) throw localTripSyncError;
        } else if (cloudTrips) {
          const cloudTripList = (Array.isArray(cloudTrips) ? cloudTrips : []).filter(trip => !trip.localOnly);
          const localOnlyTrips = localRegularTrips.filter(localTrip =>
            !cloudTripList.some(cloudTrip => String(cloudTrip.id) === String(localTrip.id))
          );
          const mergedTrips = [...cloudTripList, ...localTestTrips, ...localOnlyTrips];
          setTrips(mergedTrips);
          writeStoredJson("world_pro_trips_v1", mergedTrips);
          mergedTripCount = localOnlyTrips.length;
          if (localOnlyTrips.length > 0) {
            const { error: mergeTripError } = await supabase.from("user_state").upsert({ user_id: session.user.id, key: "world_pro_trips_v1", value: [...cloudTripList, ...localOnlyTrips] }, { onConflict: "user_id,key" });
            if (mergeTripError) throw mergeTripError;
          }
        }

        if (!cloudFavs && (favorites || []).length > 0) {
          const { error: localFavSyncError } = await supabase.from("user_state").upsert({ user_id: session.user.id, key: "world_pro_fav_v1", value: favorites || [] }, { onConflict: "user_id,key" });
          if (localFavSyncError) throw localFavSyncError;
        } else if (cloudFavs) {
          const cloudFavList = Array.isArray(cloudFavs) ? cloudFavs : [];
          const localOnlyFavs = (favorites || []).filter(localFav =>
            !cloudFavList.some(cloudFav => (cloudFav.name || cloudFav.loc) === (localFav.name || localFav.loc))
          );
          const mergedFavs = [...cloudFavList, ...localOnlyFavs];
          setFavorites(mergedFavs);
          writeStoredJson("world_pro_fav_v1", mergedFavs);
          mergedFavoriteCount = localOnlyFavs.length;
          if (localOnlyFavs.length > 0) {
            const { error: mergeFavError } = await supabase.from("user_state").upsert({ user_id: session.user.id, key: "world_pro_fav_v1", value: mergedFavs }, { onConflict: "user_id,key" });
            if (mergeFavError) throw mergeFavError;
          }
        }
        if (mergedTripCount > 0 || mergedFavoriteCount > 0) {
          setMergeNotice({ trips: mergedTripCount, favorites: mergedFavoriteCount });
        }
        setSyncStatus("saved");
      } catch (err) {
        console.error("Supabase sync failed:", err);
        setSyncStatus("error");
      } finally {
        setIsLoadingDB(false);
      }
    }
    initCloudDB();
  // Cloud initialization intentionally runs only when authentication changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Realtime subscription only needs to change when the number of shared trips changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedTripCount]);

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
  const activeTrip = (trips || []).find(t => String(t.id) === String(activeTripId));
  const itinerary = useMemo(() => activeTrip?.itinerary || [], [activeTrip]);
  const reserveItems = useMemo(() => activeTrip?.reserveItems || [], [activeTrip]);
  const budgetSettings = activeTrip?.budgetSettings || { limitKRW: 1000000, travelCurrency: 'USD' };
  const expenses = useMemo(() => activeTrip?.expenses || [], [activeTrip]);
  const createTripDayCount = useMemo(() => {
    if (!createTripData.startDate || !createTripData.endDate) return 0;
    const start = new Date(`${createTripData.startDate}T00:00:00`);
    const end = new Date(`${createTripData.endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  }, [createTripData.startDate, createTripData.endDate]);

  const getExpenseAmountKRW = (amount, currency) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) return 0;
    if (currency !== 'KRW' && exchangeRates[currency]) {
      return Math.round(numericAmount / exchangeRates[currency]);
    }
    return Math.round(numericAmount);
  };

  const getTodayExpenseDay = (trip) => {
    const availableDays = (trip?.itinerary || [])
      .map(day => parseDay(day.day))
      .filter(day => day > 0);
    if (!trip?.startDate || availableDays.length === 0) return 1;

    const tripStart = new Date(`${trip.startDate}T00:00:00`);
    if (Number.isNaN(tripStart.getTime())) return 1;

    const today = new Date();
    const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tripStartAtMidnight = new Date(tripStart.getFullYear(), tripStart.getMonth(), tripStart.getDate());
    const todayDay = Math.round((todayAtMidnight - tripStartAtMidnight) / 86400000) + 1;

    return availableDays.includes(todayDay) ? todayDay : 1;
  };

  const openBudget = () => {
    setIsMobileHeaderHidden(false);
    setExpenseInput(current => ({
      ...current,
      day: getTodayExpenseDay(activeTrip),
      time: editingExpenseId ? current.time : getCurrentTimeInputValue()
    }));
    setViewMode('budget');
  };

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return 'unsupported';
    const permission = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
    setNotificationPermission(permission);
    return permission;
  };

  const toggleTripReminders = async () => {
    if (!activeTrip) return;
    if (activeTrip.reminders?.enabled) {
      await updateActiveTrip({ reminders: { ...activeTrip.reminders, enabled: false } });
      return;
    }
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      setModalConfig({ type: 'error', title: '알림 권한이 필요합니다', message: '브라우저 설정에서 알림 권한을 허용한 뒤 다시 시도해주세요.' });
      setShowCustomModal(true);
      return;
    }
    await updateActiveTrip({ reminders: { enabled: true, minutesBefore: activeTrip.reminders?.minutesBefore || 30 } });
  };

  useEffect(() => {
    if (!activeTrip?.reminders?.enabled || notificationPermission !== 'granted') return undefined;

    const checkReminders = () => {
      if (!activeTrip.startDate) return;
      const now = new Date();
      const minutesBefore = Number(activeTrip.reminders.minutesBefore) || 30;
      for (const day of activeTrip.itinerary || []) {
        for (const item of day.items || []) {
          if (!item.time) continue;
          const target = new Date(`${activeTrip.startDate}T${item.time}:00`);
          target.setDate(target.getDate() + (parseDay(day.day) - 1));
          const difference = (target.getTime() - now.getTime()) / 60000;
          if (difference >= 0 && difference <= minutesBefore) {
            const reminderKey = `travelplaner-reminder-${activeTrip.id}-${day.day}-${item.id}-${target.toISOString().slice(0, 10)}`;
            if (readStoredJson(reminderKey, false)) continue;
            new Notification(`${item.displayName || item.name || '일정'} 출발 알림`, {
              body: `${day.day}일차 ${item.time} 일정이 ${Math.ceil(difference)}분 후 시작됩니다.`,
              icon: '/favicon.svg'
            });
            writeStoredJson(reminderKey, true);
          }
        }
      }
    };

    checkReminders();
    const timer = window.setInterval(checkReminders, 60000);
    return () => window.clearInterval(timer);
  }, [activeTrip, notificationPermission]);

  // Natively translate and sort currencies
  const getCurrencyNameKO = (code) => {
    try {
      return new Intl.DisplayNames(['ko'], { type: 'currency' }).of(code) || code;
    } catch {
      return code;
    }
  };

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
    const targetDay = parseDay(activeDay);
    const dayPlan = itinerary.find(d => parseDay(d.day) === targetDay);
    if (!dayPlan || (dayPlan.items || []).length < 2) return [];
    
    return (dayPlan.items || [])
      .filter(item => item.lat && item.lng)
      .map(item => ({ 
        lat: Number(item.lat), 
        lng: Number(item.lng) 
      }));
  }, [itinerary, activeDay]);



  const fullTripPaths = (itinerary || []).map(day => (day.items || [])
    .filter(item => item.lat && item.lng)
    .map(item => ({ lat: Number(item.lat), lng: Number(item.lng) }))
  ).filter(path => path.length > 0);

  const interDayPaths = useMemo(() => {
    if (fullTripPaths.length < 2) return [];
    const bridges = [];
    for (let i = 0; i < fullTripPaths.length - 1; i++) {
      const currentDay = fullTripPaths[i];
      const nextDay = fullTripPaths[i + 1];
      if (currentDay.length > 0 && nextDay.length > 0) {
        bridges.push([
          currentDay[currentDay.length - 1],
          nextDay[0]
        ]);
      }
    }
    return bridges;
  }, [fullTripPaths]);

  const toggleCountry = (country) => {
    setExpandedCountries(prev => ({
      ...prev,
      [country]: !prev[country]
    }));
  };

  const syncFavoritesToCloud = async (newFavs) => {
    setSyncStatus('saving');
    const safeFavs = newFavs || [];
    setFavorites(safeFavs);
    if (!writeStoredJson("world_pro_fav_v1", safeFavs)) {
      setSyncStatus("error");
      return;
    }
    
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
        setSyncStatus('error');
        return;
      }
    }
    setSyncStatus('saved');
  };

  const saveFavorites = (newFavs) => {
    syncFavoritesToCloud(newFavs);
  };

  const updateFavoriteCurrencies = (nextCurrencies) => {
    const safeCurrencies = Array.from(new Set(
      (nextCurrencies || []).filter(code => SUPPORTED_CURRENCY_CODES.includes(code))
    ));
    setFavoriteCurrencies(safeCurrencies);
    writeStoredJson(CURRENCY_FAVORITES_STORAGE_KEY, safeCurrencies);
  };

  const addFavoriteCurrency = (code) => {
    if (!code || !SUPPORTED_CURRENCY_CODES.includes(code)) return;
    updateFavoriteCurrencies([...(favoriteCurrencies || []), code]);
  };

  const removeFavoriteCurrency = (code) => {
    updateFavoriteCurrencies((favoriteCurrencies || []).filter(currencyCode => currencyCode !== code));
  };

  const syncTripsToCloud = async (newTrips) => {
    setSyncStatus('saving');
    setTrips(newTrips);
    if (!writeStoredJson("world_pro_trips_v1", newTrips)) {
      setSyncStatus("error");
      return;
    }
    
    const cloudTrips = (newTrips || []).filter(trip => !trip.localOnly);

    // 1. Sync regular trips to private user_state. Local-only test data stays in localStorage only.
    if (session?.user?.id) {
      try {
        const { error } = await supabase
          .from('user_state')
          .upsert(
            { user_id: session.user.id, key: 'world_pro_trips_v1', value: cloudTrips },
            { onConflict: 'user_id,key' }
          );
        if (error) throw error;
      } catch (err) {
        console.error("Cloud sync failed:", err);
        setSyncStatus('error');
        return;
      }
    }

    // 2. Sync individual shared trips to shared_trips table
    for (const trip of cloudTrips) {
      if (trip.sharedId) {
        try {
          const { error } = await supabase
            .from('shared_trips')
            .update({ trip_data: trip })
            .eq('id', trip.sharedId);
          if (error) throw error;
        } catch (err) {
          console.error("Shared trip update failed:", err);
          setSyncStatus('error');
          return;
        }
      }
    }
    setSyncStatus('saved');
  };

  const shareTrip = async (tripId) => {
    const trip = (trips || []).find(t => t.id === tripId);
    if (!trip) return;
    if (trip.localOnly) {
      setModalConfig({ type: 'error', title: '로컬 테스트 데이터', message: '로컬 테스트 여행은 공유하거나 데이터베이스에 저장할 수 없습니다.' });
      setShowCustomModal(true);
      return;
    }
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
      setModalConfig({ type: 'error', title: '공유 실패', message: `공유에 실패했습니다: ${err.message || "네트워크나 데이터베이스 설정을 확인해주세요."}` });
      setShowCustomModal(true);
    }
  };

  const openJoinTripModal = () => {
    setJoinTripCode('');
    setJoinTripError('');
    setShowJoinTripModal(true);
  };

  const cancelJoinTrip = () => {
    if (isJoiningTrip) return;
    setShowJoinTripModal(false);
    setJoinTripCode('');
    setJoinTripError('');
  };

  const pasteJoinTripCode = async () => {
    try {
      if (!navigator.clipboard?.readText) throw new Error('Clipboard unavailable');
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText.trim()) {
        setJoinTripError('클립보드에 공유 코드가 없습니다.');
        return;
      }
      setJoinTripCode(clipboardText.trim());
      setJoinTripError('');
    } catch {
      setJoinTripError('클립보드에 접근할 수 없습니다. 공유 코드를 직접 입력해주세요.');
    }
  };

  const joinSharedTrip = async () => {
    const code = joinTripCode.trim();
    if (!code) {
      setJoinTripError('친구에게 받은 공유 코드를 입력해주세요.');
      return;
    }
    if (code.length < 10) {
      setJoinTripError('공유 코드가 너무 짧습니다. 코드를 다시 확인해주세요.');
      return;
    }

    setIsJoiningTrip(true);
    setJoinTripError('');

    try {
      const { data, error } = await supabase
        .from('shared_trips')
        .select('*')
        .eq('id', code.trim())
        .single();

      if (error || !data) {
        setJoinTripError('올바른 공유 코드를 찾을 수 없습니다. 코드를 다시 확인해주세요.');
        return;
      }

      if ((trips || []).some(t => t.sharedId === data.id)) {
        setJoinTripError('이미 참여 중인 여행입니다.');
        return;
      }

      const joinedTrip = { ...data.trip_data, sharedId: data.id };
      const newTrips = [joinedTrip, ...(trips || [])];
      await syncTripsToCloud(newTrips);
      setActiveTripId(joinedTrip.id);
      openItinerary();
      setShowJoinTripModal(false);
      setJoinTripCode('');
      setModalConfig({ type: 'success', title: '참여 완료', message: `'${joinedTrip.name}' 일정에 참여했습니다!` });
      setShowCustomModal(true);
    } catch {
      setJoinTripError('참여에 실패했습니다. 네트워크 상태와 공유 코드를 확인해주세요.');
    } finally {
      setIsJoiningTrip(false);
    }
  };

  const copyToClipboard = (text, id) => {
    if (!text) return;
    
    const performCopy = async () => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          setModalConfig({ type: 'success', title: '복사 완료', message: "초대 코드가 클립보드에 복사되었습니다." });
          setShowCustomModal(true);
        } else {
          // Fallback for non-secure contexts
          const textArea = document.createElement("textarea");
          textArea.value = text;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
          setModalConfig({ type: 'success', title: '복사 완료', message: "초대 코드가 복사되었습니다." });
          setShowCustomModal(true);
        }
        
        setCopiedId(id);
      } catch (err) {
        console.error("Copy failed:", err);
        setModalConfig({ type: 'error', title: '복사 실패', message: "초대 코드 복사에 실패했습니다. 수동으로 복사해주세요: " + text });
        setShowCustomModal(true);
      }
    };

    performCopy();
  };

  const copyImportTemplate = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(LLM_IMPORT_TEMPLATE);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = LLM_IMPORT_TEMPLATE;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setModalConfig({ type: 'success', title: '예시 형식 복사 완료', message: '복사한 JSON 예시를 ChatGPT나 Gemini에 전달해 여행 일정으로 바꿔 달라고 요청해 보세요.' });
      setShowCustomModal(true);
    } catch (error) {
      console.error('LLM template copy failed:', error);
      setModalConfig({ type: 'error', title: '예시 복사 실패', message: '복사에 실패했습니다. 아래 예시를 직접 선택해 복사해 주세요.' });
      setShowCustomModal(true);
    }
  };

  useEffect(() => {
    if (!map || !activeDay || (itinerary || []).length === 0) return;
    
    const targetDay = parseDay(activeDay);
    const dayPlan = (itinerary || []).find(d => parseDay(d.day) === targetDay);
    if (!dayPlan || (dayPlan.items || []).length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    let count = 0;
    
    dayPlan.items.forEach(item => {
      const lat = Number(item.lat);
      const lng = Number(item.lng);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        bounds.extend({ lat, lng });
        count++;
      }
    });

    if (count > 0) {
      map.fitBounds(bounds);
      
      // Prevent over-zooming when points are very close or it's a single point
      const listener = window.google.maps.event.addListener(map, 'idle', () => {
        if (map.getZoom() > 16) map.setZoom(16);
        window.google.maps.event.removeListener(listener);
      });

      if (count === 1) {
        setTimeout(() => {
          map.setZoom(15);
        }, 100);
      }
    }
  }, [activeDay, itinerary, map]);

  // --- TRIP DATA MUTATORS ---
  const updateActiveTrip = async (updates) => {
    if (!activeTripId) return;
    
    // Calculate new state array based on existing state
    const nextTrips = (trips || []).map(t => t.id === activeTripId ? { ...t, ...updates } : t);
    
    // Sync to cloud and update local state
    await syncTripsToCloud(nextTrips);
  };

  const addDay = async () => {
    if (!activeTrip) return;
    if (itinerary.length >= 100) {
      setModalConfig({ type: "error", title: "일차를 더 추가할 수 없습니다", message: "여행 기간은 최대 100일까지 설정할 수 있습니다." });
      setShowCustomModal(true);
      return;
    }
    
    const newItinerary = [...itinerary, { day: itinerary.length + 1, items: [] }];
    const totalDays = newItinerary.length;
    const newEndDate = activeTrip.startDate
      ? getEndDateForDayCount(activeTrip.startDate, totalDays)
      : activeTrip.endDate;
    
    await updateActiveTrip({ 
      itinerary: newItinerary, 
      endDate: newEndDate 
    });
    
    setActiveDay(totalDays);
  };

  const deleteDay = async (dayNumber) => {
    if (!activeTrip) return;
    if (itinerary.length <= 1) {
      setModalConfig({ type: 'error', title: '일차를 삭제할 수 없습니다', message: '여행에는 최소 한 개의 일차가 필요합니다.' });
      setShowCustomModal(true);
      return;
    }

    const targetDay = parseDay(dayNumber);
    const newItinerary = itinerary
      .filter(day => parseDay(day.day) !== targetDay)
      .map((day, index) => ({ ...day, day: index + 1 }));
    const newEndDate = activeTrip.startDate
      ? getEndDateForDayCount(activeTrip.startDate, newItinerary.length)
      : activeTrip.endDate;

    await updateActiveTrip({ itinerary: newItinerary, endDate: newEndDate });
    setActiveDay(Math.min(targetDay, newItinerary.length));
  };

  const saveItinerary = (newItinerary) => updateActiveTrip({ itinerary: newItinerary });
  const saveBudgetSettings = (newSettings) => updateActiveTrip({ budgetSettings: newSettings });
  const saveExpenses = (newExpenses) => updateActiveTrip({ expenses: newExpenses });

  // --- TRIP CRUD ---
  const createNewTrip = (openAfterCreate = false) => {
    const today = formatLocalDate(new Date());
    setCreateTripData({ name: '', startDate: today, endDate: today, country: '' });
    setCreateTripError('');
    setOpenItineraryAfterCreate(openAfterCreate);
    setShowCreateTripModal(true);
  };

  const cancelCreateTrip = () => {
    setShowCreateTripModal(false);
    setCreateTripError('');
    setOpenItineraryAfterCreate(false);
  };

  const saveNewTrip = async () => {
    const { name, startDate, endDate, country } = createTripData;
    const trimmedName = name.trim();
    const shouldOpenItinerary = openItineraryAfterCreate;

    if (!trimmedName) {
      setCreateTripError('여행 이름을 입력해주세요.');
      return;
    }
    if (!startDate || !endDate) {
      setCreateTripError('여행 시작일과 종료일을 모두 선택해주세요.');
      return;
    }

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      setCreateTripError('시작일은 종료일보다 늦을 수 없습니다.');
      return;
    }

    const dayCount = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (dayCount > 100) {
      setCreateTripError('여행 기간은 최대 100일까지 설정할 수 있습니다.');
      return;
    }

    const newId = Date.now().toString();
    const newTrip = {
      id: newId,
      name: trimmedName,
      country,
      startDate,
      endDate,
      itinerary: buildItineraryForDayCount([], dayCount),
      reserveItems: [],
      budgetSettings: { limitKRW: 1000000, travelCurrency: countryToCurrency[country] || 'USD' },
      expenses: [],
      reminders: { enabled: false, minutesBefore: 30 },
      createdAt: Date.now()
    };

    const newTrips = [newTrip, ...(trips || [])];
    await syncTripsToCloud(newTrips);
    setShowCreateTripModal(false);
    setCreateTripError('');
    setOpenItineraryAfterCreate(false);

    if (shouldOpenItinerary) {
      setActiveTripId(newId);
      openItinerary();
      setShowOnboarding(false);
      setOnboardingStep(1);
    }
  };

  const dismissOnboarding = () => {
    writeStoredJson(ONBOARDING_STORAGE_KEY, true);
    setShowOnboarding(false);
  };

  const handleOnboardingAction = () => {
    if (onboardingStep === 0) {
      createNewTrip(true);
      return;
    }
    if (onboardingStep === 1) {
      openItinerary();
      setShowOnboarding(false);
      setOnboardingStep(2);
      return;
    }
    dismissOnboarding();
  };

  const exportTripBackupAsJson = (trip = activeTrip) => {
    if (!trip) return;

    const exportData = { ...trip };
    delete exportData.sharedId;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = (trip.name || "travel-plan").replace(/[^\w가-힣-]+/g, "_");
    link.href = url;
    link.download = safeName + "-backup.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setModalConfig({ type: "success", title: "여행 데이터 백업 완료", message: "일정·지출·예산이 포함된 여행 데이터 백업 파일을 저장했습니다." });
    setShowCustomModal(true);
  };

  const downloadTextFile = (fileName, content, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportTripAsIcal = (trip = activeTrip) => {
    if (!trip) return;
    const events = (trip.itinerary || []).flatMap(day => (day.items || []).map(item => {
      const start = getIcsDateTime(trip.startDate || new Date().toISOString().slice(0, 10), day.day, item.time);
      const end = getIcsDateTime(trip.startDate || new Date().toISOString().slice(0, 10), day.day, item.time, 60);
      return [
        'BEGIN:VEVENT',
        `UID:${escapeIcsText(item.id || crypto.randomUUID())}@travelplaner`,
        `DTSTAMP:${getIcsDateTime(new Date().toISOString().slice(0, 10), 1, new Date().toTimeString().slice(0, 5))}Z`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${escapeIcsText(item.displayName || item.name || '여행 일정')}`,
        `LOCATION:${escapeIcsText(item.loc || '')}`,
        `DESCRIPTION:${escapeIcsText(item.desc || '')}`,
        'END:VEVENT'
      ].join('\r\n');
    }));
    const ical = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TravelPlaner//Itinerary//KO', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n');
    downloadTextFile(`${(trip.name || 'travel-plan').replace(/[^\w가-힣-]+/g, '_')}.ics`, ical, 'text/calendar;charset=utf-8');
    setModalConfig({ type: 'success', title: '캘린더 내보내기 완료', message: 'Google Calendar, Apple 캘린더 등에서 열 수 있는 iCal 파일을 저장했습니다.' });
    setShowCustomModal(true);
  };

  const exportBudgetAsCsv = (trip = activeTrip) => {
    if (!trip) return;
    const header = ['일차', '날짜', '지출 내용', '금액', '통화', '결제 수단', '원화 환산', '소비 시간'].join(',');
    const rows = (trip.expenses || []).map(expense => [
      expense.day === 0 ? '여행 전 준비' : `${expense.day}일차`,
      expense.day === 0 ? '' : getActualDateForDay(trip.startDate, expense.day),
      expense.desc,
      expense.amount,
      expense.currency || 'KRW',
      getPaymentMethodLabel(expense.paymentMethod),
      expense.amountKRW ?? expense.amount,
      expense.time || ''
    ].map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','));
    downloadTextFile(`${(trip.name || 'travel-plan').replace(/[^\w가-힣-]+/g, '_')}-budget.csv`, `\uFEFF${[header, ...rows].join('\r\n')}`, 'text/csv;charset=utf-8');
    setModalConfig({ type: 'success', title: 'CSV 내보내기 완료', message: '예산 및 지출 내역을 CSV 파일로 저장했습니다.' });
    setShowCustomModal(true);
  };

  const duplicateTrip = (trip) => {
    if (!trip) return;
    const duplicateId = Date.now().toString();
    const tripWithoutShare = { ...trip };
    delete tripWithoutShare.sharedId;
    const duplicate = {
      ...tripWithoutShare,
      id: duplicateId,
      name: (trip.name || "여행") + " 복사본",
      createdAt: Date.now(),
      itinerary: (trip.itinerary || []).map((day, dayIndex) => ({
        ...day,
        items: (day.items || []).map((item, itemIndex) => ({
          ...item,
          id: duplicateId + "-" + dayIndex + "-" + itemIndex
        }))
      })),
      reserveItems: (trip.reserveItems || []).map((item, itemIndex) => ({
        ...item,
        id: `${duplicateId}-reserve-${itemIndex}`
      }))
    };
    syncTripsToCloud([duplicate, ...(trips || [])]);
    setActiveTripId(duplicateId);
    openItinerary();
  };

  const handleUploadJson = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target.result;
          const data = JSON.parse(content);

          if (!data.name || !data.itinerary) {
            setModalConfig({ 
              type: 'error', 
              title: '업로드 실패', 
              message: '올바른 형식의 여행 일정 JSON 파일이 아닙니다. name과 itinerary 필드가 필요합니다.' 
            });
            setShowCustomModal(true);
            return;
          }

          const newId = Date.now().toString();
          const newTrip = {
            id: newId,
            name: data.name || "업로드한 여행",
            country: data.country || "",
            startDate: data.startDate || new Date().toISOString().split('T')[0],
            endDate: data.endDate || new Date().toISOString().split('T')[0],
            itinerary: (data.itinerary || []).map((day, idx) => ({
              ...day,
              day: day.day || idx + 1,
              items: (day.items || []).map(item => ({
                ...item,
                id: item.id || Math.random().toString(36).substr(2, 9)
              }))
            })),
            reserveItems: (Array.isArray(data.reserveItems) ? data.reserveItems : []).map(item => ({
              ...item,
              id: item.id || Math.random().toString(36).substr(2, 9)
            })),
            budgetSettings: data.budgetSettings || { limitKRW: 1000000, travelCurrency: 'USD' },
            expenses: (data.expenses || []).map(exp => ({
              ...exp,
              id: exp.id || Math.random().toString(36).substr(2, 9),
              createdAt: exp.createdAt || Date.now()
            })),
            reminders: data.reminders || { enabled: false, minutesBefore: 30 },
            createdAt: Date.now()
          };

          const newTrips = [newTrip, ...trips];
          await syncTripsToCloud(newTrips);
          setActiveTripId(newId);
          
          setModalConfig({ 
            type: 'success', 
            title: '업로드 완료', 
            message: `'${newTrip.name}' 일정을 성공적으로 불러왔습니다.` 
          });
          setShowCustomModal(true);
        } catch (err) {
          console.error("JSON parsing error:", err);
          setModalConfig({ 
            type: 'error', 
            title: '파일 오류', 
            message: 'JSON 파일을 파싱하는 중 오류가 발생했습니다.' 
          });
          setShowCustomModal(true);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handlePasteImport = () => {
    if (!pasteText.trim()) return;
    try {
      const data = parseImportedJsonText(pasteText);
      if (!data.name || !data.itinerary) {
        setModalConfig({ 
          type: 'error', 
          title: '가져오기 실패', 
          message: '올바른 형식의 여행 일정 JSON이 아닙니다. name과 itinerary 필드가 필요합니다.' 
        });
        setShowCustomModal(true);
        return;
      }

      const newId = Date.now().toString();
      const newTrip = {
        id: newId,
        name: data.name || "붙여넣은 여행",
        country: data.country || "",
        startDate: data.startDate || new Date().toISOString().split('T')[0],
        endDate: data.endDate || new Date().toISOString().split('T')[0],
        itinerary: (data.itinerary || []).map((day, idx) => ({
          ...day,
          day: day.day || idx + 1,
          items: (day.items || []).map(item => ({
            ...item,
            id: item.id || Math.random().toString(36).substr(2, 9)
          }))
        })),
        reserveItems: (Array.isArray(data.reserveItems) ? data.reserveItems : []).map(item => ({
          ...item,
          id: item.id || Math.random().toString(36).substr(2, 9)
        })),
        budgetSettings: data.budgetSettings || { limitKRW: 1000000, travelCurrency: 'USD' },
        expenses: (data.expenses || []).map(exp => ({
          ...exp,
          id: exp.id || Math.random().toString(36).substr(2, 9),
          createdAt: exp.createdAt || Date.now()
        })),
        createdAt: Date.now()
      };

      const newTrips = [newTrip, ...trips];
      syncTripsToCloud(newTrips);
      setActiveTripId(newId);
      
      setShowPasteModal(false);
      setPasteText('');
      setModalConfig({ 
        type: 'success', 
        title: '가져오기 완료', 
        message: `'${newTrip.name}' 일정을 성공적으로 불러왔습니다.` 
      });
      setShowCustomModal(true);
    } catch {
      setModalConfig({ 
        type: 'error', 
        title: '형식 오류', 
        message: 'JSON 형식이 올바르지 않습니다. 복사한 텍스트를 다시 확인해주세요.' 
      });
      setShowCustomModal(true);
    }
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
        const start = new Date(startDate + "T00:00:00");
        const end = new Date(endDate + "T00:00:00");
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
          setModalConfig({ type: "error", title: "날짜를 확인해 주세요", message: "시작일은 종료일보다 늦을 수 없습니다." });
          setShowCustomModal(true);
          return;
        }
        if (start <= end) {
          const diffTime = Math.abs(end - start);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          if (diffDays > 100) {
            setModalConfig({ type: "error", title: "여행 기간이 너무 깁니다", message: "여행 기간은 최대 100일까지 설정할 수 있습니다." });
            setShowCustomModal(true);
            return;
          }
          if (diffDays > 0 && diffDays <= 100) {
             newItinerary = buildItineraryForDayCount(
               (trips || []).find(trip => trip.id === id)?.itinerary,
               diffDays
             );
          }
        }
      }

      const targetTrip = (trips || []).find(trip => trip.id === id);
      const currentItinerary = targetTrip?.itinerary || [];
      const removedTrailingItems = newItinerary && newItinerary.length < currentItinerary.length
        ? currentItinerary
          .slice(newItinerary.length)
          .flatMap(dayPlan => dayPlan?.items || [])
        : [];

      if (removedTrailingItems.length > 0) {
        setModalConfig({
          type: "error",
          title: "일정이 있는 일차는 줄일 수 없습니다",
          message: "마지막 일차에 일정이 남아 있습니다. 해당 일정을 예비 목록으로 이동하거나 삭제한 뒤 여행 기간을 줄여주세요."
        });
        setShowCustomModal(true);
        return;
      }

      const nextTrips = (trips || []).map(t => {
        if (t.id === id) {
          const tripToUpdate = { ...t, name: name.trim(), startDate, endDate, country };
          if (newItinerary) {
             tripToUpdate.itinerary = buildItineraryForDayCount(t.itinerary, newItinerary.length);
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
      setIsMobileHeaderHidden(false);
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


  const addToItinerary = (place) => {
    const targetDay = parseDay(activeDay);
    const displayName = itineraryDisplayName.trim() || place.displayName || place.name || '장소 이름 정보 없음';

    if (activeDay === 'reserve') {
      const reserveItem = {
        ...place,
        id: makeEntityId(),
        emoji: place.emoji || '📍',
        displayName,
        time: itineraryTime || ''
      };
      updateActiveTrip({ reserveItems: [...reserveItems, reserveItem] });
      setItineraryTime('');
      setItineraryDisplayName('');
      openItinerary();
      return;
    }

    if (!targetDay) return;
    const newItinerary = (itinerary || []).map(d => ({ ...d, items: [...(d.items || [])] }));
    const dayIndex = newItinerary.findIndex(d => parseDay(d.day) === targetDay);
    
    if (dayIndex !== -1) {
      let finalTime = itineraryTime;
      
      if (!finalTime) {
        const dayItems = newItinerary[dayIndex].items;
        const itemsWithTime = dayItems.filter(it => it.time);
        
        if (itemsWithTime.length > 0) {
          const lastItem = itemsWithTime[itemsWithTime.length - 1];
          const [h, m] = lastItem.time.split(':').map(Number);
          let totalMins = h * 60 + m + 90; 
          if (totalMins >= 1440) totalMins = totalMins - 1440;
          const hh = Math.floor(totalMins / 60).toString().padStart(2, '0');
          const mm = (totalMins % 60).toString().padStart(2, '0');
          finalTime = `${hh}:${mm}`;
        } else {
          finalTime = '09:00';
        }
      }

      newItinerary[dayIndex].items = [
        ...newItinerary[dayIndex].items,
        { ...place, id: makeEntityId(), emoji: place.emoji || '📍', displayName, time: finalTime }
      ].sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
    } else {
      newItinerary.push({ 
        day: targetDay, 
        items: [{ ...place, id: makeEntityId(), emoji: place.emoji || '📍', displayName, time: itineraryTime || '09:00' }]
      });
    }
    saveItinerary(newItinerary);
    setItineraryTime('');
    setItineraryDisplayName('');
    openItinerary();
  };

  const moveReserveItem = (itemId, direction) => {
    const itemIndex = reserveItems.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return;
    const targetIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1;
    if (targetIndex < 0 || targetIndex >= reserveItems.length) return;

    const nextReserveItems = [...reserveItems];
    [nextReserveItems[itemIndex], nextReserveItems[targetIndex]] = [nextReserveItems[targetIndex], nextReserveItems[itemIndex]];
    updateActiveTrip({ reserveItems: nextReserveItems });
  };

  const moveReserveItemToDay = (itemId, dayNumber) => {
    const targetDay = parseDay(dayNumber);
    if (!targetDay) return;

    const reserveItem = reserveItems.find(item => item.id === itemId);
    if (!reserveItem) return;

    const nextItinerary = (itinerary || []).map(dayPlan => {
      if (parseDay(dayPlan.day) !== targetDay) return dayPlan;
      const items = [...(dayPlan.items || []), { ...reserveItem, time: reserveItem.time || '09:00' }]
        .sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
      return { ...dayPlan, items };
    });

    if (!nextItinerary.some(dayPlan => parseDay(dayPlan.day) === targetDay)) return;
    updateActiveTrip({
      itinerary: nextItinerary,
      reserveItems: reserveItems.filter(item => item.id !== itemId)
    });
    setActiveDay(targetDay);
  };

  const removeReserveItem = (itemId) => {
    updateActiveTrip({ reserveItems: reserveItems.filter(item => item.id !== itemId) });
  };

  const addExpense = () => {
    const numericAmount = Number(expenseInput.amount);
    if (!activeTripId || !expenseInput.desc.trim() || !expenseInput.paymentMethod || !Number.isFinite(numericAmount) || numericAmount <= 0) return;

    const currentCurrency = expenseInput.currency || budgetSettings.travelCurrency || 'USD';

    const newExpense = {
      id: makeEntityId(),
      desc: expenseInput.desc.trim(),
      amount: numericAmount,
      currency: currentCurrency,
      paymentMethod: expenseInput.paymentMethod,
      amountKRW: getExpenseAmountKRW(expenseInput.amount, currentCurrency),
      day: parseInt(expenseInput.day, 10) || 0,
      time: expenseInput.time || ''
    };

    saveExpenses([...expenses, newExpense]);
    setExpenseInput({ ...expenseInput, desc: '', amount: '', time: getCurrentTimeInputValue() });
  };

  const startEditingExpense = (expense) => {
    setEditingExpenseId(expense.id);
    setExpenseInput({
      desc: expense.desc || '',
      amount: String(expense.amount ?? ''),
      currency: expense.currency || budgetSettings.travelCurrency || 'USD',
      paymentMethod: expense.paymentMethod || '',
      day: expense.day ?? 1,
      time: expense.time || ''
    });
  };

  const cancelEditingExpense = () => {
    setEditingExpenseId(null);
    setExpenseInput(current => ({ ...current, desc: '', amount: '', time: getCurrentTimeInputValue() }));
  };

  const saveExpenseEdit = () => {
    if (!activeTripId || !editingExpenseId || !expenseInput.desc.trim() || !expenseInput.paymentMethod || !expenseInput.amount) return;

    const currentCurrency = expenseInput.currency || budgetSettings.travelCurrency || 'USD';
    const nextExpenses = expenses.map(expense => expense.id === editingExpenseId ? {
      ...expense,
      desc: expenseInput.desc.trim(),
      amount: Number(expenseInput.amount),
      currency: currentCurrency,
      paymentMethod: expenseInput.paymentMethod,
      amountKRW: getExpenseAmountKRW(expenseInput.amount, currentCurrency),
      day: parseInt(expenseInput.day, 10) || 0,
      time: expenseInput.time || ''
    } : expense);

    saveExpenses(nextExpenses);
    cancelEditingExpense();
  };

  const moveExpense = (id, direction) => {
    const targetExpense = expenses.find(expense => expense.id === id);
    if (!targetExpense) return;

    const sameDayIndices = expenses
      .map((expense, index) => parseDay(expense.day) === parseDay(targetExpense.day) ? index : -1)
      .filter(index => index !== -1);
    const currentPosition = sameDayIndices.indexOf(expenses.findIndex(expense => expense.id === id));
    const targetPosition = currentPosition + direction;
    if (currentPosition === -1 || targetPosition < 0 || targetPosition >= sameDayIndices.length) return;

    const nextExpenses = [...expenses];
    const currentIndex = sameDayIndices[currentPosition];
    const targetIndex = sameDayIndices[targetPosition];
    [nextExpenses[currentIndex], nextExpenses[targetIndex]] = [nextExpenses[targetIndex], nextExpenses[currentIndex]];
    saveExpenses(nextExpenses);
  };

  const deleteExpense = (id) => {
    saveExpenses(expenses.filter(e => e.id !== id));
    if (editingExpenseId === id) cancelEditingExpense();
  };

  const toggleFavorite = (place) => {
    if (!place) return;
    const safeFavs = favorites || [];
    const isFav = safeFavs.some(f => f.name === place.name);
    const nextFavs = isFav 
      ? safeFavs.filter(f => f.name !== place.name)
      : [...safeFavs, { ...place, id: makeEntityId() }];
    
    saveFavorites(nextFavs);
  };

  const isFavorite = (place) => {
    if (!place) return false;
    return (favorites || []).some(f => f.name === place.name);
  };

  const startEditingItineraryItem = (dayNumber, item) => {
    const day = parseDay(dayNumber);
    setEditingTimeItem({
      sourceDay: day,
      day,
      id: item.id,
      time: item.time || '09:00',
      displayName: item.displayName || item.name || '',
      originalName: item.name || '',
    });
  };


  const updateItineraryItem = (dayNumber, itemId, updates) => {
    const sourceDayNum = parseDay(dayNumber);
    const destinationIsReserve = updates.day === 'reserve';
    const destinationDayNum = destinationIsReserve ? null : parseDay(updates.day ?? dayNumber);
    const itemUpdates = { ...updates };
    delete itemUpdates.day;

    const sortItems = (items) => [...items].sort((a, b) => {
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

    const nextTrips = (trips || []).map(t => {
      if (t.id !== activeTripId) return t;
      const sourceDay = (t.itinerary || []).find(day => parseDay(day.day) === sourceDayNum);
      const sourceItem = sourceDay?.items?.find(item => item.id === itemId);
      if (!sourceItem) return t;
      const updatedItem = { ...sourceItem, ...itemUpdates };
      const newItin = (t.itinerary || []).map(day => {
        const dayNum = parseDay(day.day);
        if (destinationIsReserve && dayNum === sourceDayNum) {
          return { ...day, items: day.items.filter(item => item.id !== itemId) };
        }
        if (dayNum === sourceDayNum && dayNum === destinationDayNum) {
          return { ...day, items: sortItems(day.items.map(item => item.id === itemId ? updatedItem : item)) };
        }
        if (dayNum === sourceDayNum) {
          return { ...day, items: day.items.filter(item => item.id !== itemId) };
        }
        if (dayNum === destinationDayNum) {
          return { ...day, items: sortItems([...day.items, updatedItem]) };
        }
        return day;
      });
      return destinationIsReserve
        ? { ...t, itinerary: newItin, reserveItems: [...(t.reserveItems || []), updatedItem] }
        : { ...t, itinerary: newItin };
    });
    syncTripsToCloud(nextTrips);
  };

  const moveItineraryItem = (dayNumber, itemId, direction) => {
    const targetDayNum = parseDay(dayNumber);

    const nextTrips = (trips || []).map(t => {
      if (t.id === activeTripId) {
        const newItin = (t.itinerary || []).map(day => {
          if (parseDay(day.day) === targetDayNum) {
            const items = [...day.items];
            const index = items.findIndex(it => it.id === itemId);
            if (index === -1) return day;
            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex >= 0 && newIndex < items.length) {
              const itemA = { ...items[index] };
              const itemB = { ...items[newIndex] };
              const timeA = itemA.time;
              const timeB = itemB.time;
              itemA.time = timeB;
              itemB.time = timeA;
              items[index] = itemB;
              items[newIndex] = itemA;
              items.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
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

  const removeFromItinerary = (dayNumber, itemId) => {
    const targetDayNum = parseDay(dayNumber);

    const newItinerary = (itinerary || []).map(day => {
      if (parseDay(day.day) === targetDayNum) {
        return { ...day, items: day.items.filter(i => i.id !== itemId) };
      }
      return day;
    });
    saveItinerary(newItinerary);
  };

  const requestPlaceSuggestions = async (value) => {
    const query = value.trim();
    const requestId = ++suggestionRequestRef.current;
    if (query.length < 2 || !window.google?.maps) {
      setPlaceSuggestions([]);
      return;
    }

    try {
      const placesLibrary = window.google.maps.places?.AutocompleteSuggestion
        ? window.google.maps.places
        : await window.google.maps.importLibrary?.('places');
      const AutocompleteSuggestion = placesLibrary?.AutocompleteSuggestion;
      if (!AutocompleteSuggestion) {
        setPlaceSuggestions([]);
        return;
      }
      if (!autocompleteSessionTokenRef.current && placesLibrary.AutocompleteSessionToken) {
        autocompleteSessionTokenRef.current = new placesLibrary.AutocompleteSessionToken();
      }
      const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        includedRegionCodes: ['kr'],
        sessionToken: autocompleteSessionTokenRef.current || undefined
      });
      if (requestId !== suggestionRequestRef.current) return;
      setPlaceSuggestions((response?.suggestions || []).filter(item => item?.placePrediction).slice(0, 6));
    } catch (error) {
      if (requestId === suggestionRequestRef.current) setPlaceSuggestions([]);
      console.warn('장소 자동완성 제안을 불러오지 못했습니다.', error);
    }
  };

  const selectPlaceSuggestion = async (suggestion) => {
    const prediction = suggestion?.placePrediction;
    if (!prediction) return;

    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'viewport'] });
      const location = place.location;
      if (!location) return;

      const name = getFormattableText(place.displayName) || getFormattableText(prediction.mainText) || getFormattableText(prediction.text) || '선택한 장소';
      const address = getFormattableText(place.formattedAddress) || getFormattableText(prediction.secondaryText) || '';
      const newPlace = {
        name,
        lat: location.lat(),
        lng: location.lng(),
        loc: address,
        desc: address,
        emoji: '📍',
        type: 'search'
      };

      setSearchResult(newPlace);
      setSelectedPlace(newPlace);
      setSearchInput(name);
      setSearchQuery(address || name);
      setPlaceSuggestions([]);
      autocompleteSessionTokenRef.current = null;

      if (map) {
        if (place.viewport) {
          map.fitBounds(place.viewport);
        } else {
          map.panTo(location);
          map.setZoom(18);
        }
      }
    } catch (error) {
      console.warn('선택한 장소 정보를 불러오지 못했습니다.', error);
    }
  };

  const handleSearchSubmit = () => {
    const query = searchInput.trim() || searchQuery.trim();
    if (!query) {
      setSearchInput('');
      setSearchQuery('');
      setSearchResult(null);
      setSelectedPlace(null);
      return;
    }
    if (!window.google?.maps) return;

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: query }, (results, status) => {
      const result = results?.[0];
      if (status !== 'OK' || !result?.geometry?.location) {
        setModalConfig({ type: 'error', title: '검색 결과 없음', message: '주소나 장소명을 다시 확인해 주세요.' });
        setShowCustomModal(true);
        return;
      }
      const location = result.geometry.location;
      const newPlace = {
        name: result.formatted_address || query,
        lat: location.lat(),
        lng: location.lng(),
        loc: result.formatted_address || query,
        desc: result.formatted_address || query,
        emoji: '📍',
        type: 'geocoded-search'
      };
      setSearchResult(newPlace);
      setSelectedPlace(newPlace);
      setSearchInput(newPlace.name);
      if (map) {
        map.panTo({ lat: newPlace.lat, lng: newPlace.lng });
        map.setZoom(16);
      }
    });
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
          setSearchInput(newPlace.name || '');
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
  const totalSpentKRW = (expenses || []).reduce((acc, curr) => acc + (Number(curr.amountKRW) || 0), 0);
  const expenseTotalsByCurrency = useMemo(() => (expenses || []).reduce((totals, expense) => {
    const currency = expense.currency || 'KRW';
    const amount = Number(expense.amount) || 0;
    totals[currency] = (totals[currency] || 0) + amount;
    return totals;
  }, {}), [expenses]);
  const expenseKRWTotalsByCurrency = useMemo(() => (expenses || []).reduce((totals, expense) => {
    const currency = expense.currency || 'KRW';
    const numericAmount = Number(expense.amount) || 0;
    const convertedAmount = currency !== 'KRW' && exchangeRates[currency]
      ? Math.round(numericAmount / exchangeRates[currency])
      : Math.round(numericAmount);
    const amountKRW = Number(expense.amountKRW ?? convertedAmount) || 0;
    totals[currency] = (totals[currency] || 0) + amountKRW;
    return totals;
  }, {}), [expenses, exchangeRates]);
  const cashSpentByCurrency = useMemo(() => (expenses || []).reduce((totals, expense) => {
    if (expense.paymentMethod !== 'cash') return totals;
    const currency = expense.currency || 'KRW';
    const amount = Number(expense.amount) || 0;
    totals[currency] = (totals[currency] || 0) + amount;
    return totals;
  }, {}), [expenses]);
  const krwSpent = expenseTotalsByCurrency.KRW || 0;
  const localCurrencyTotals = Object.entries(expenseTotalsByCurrency)
    .filter(([currency]) => currency !== 'KRW')
    .sort(([first], [second]) => first.localeCompare(second));
  const cashCurrencyChoices = Array.from(new Set([
    budgetSettings.cashLedgerCurrency,
    budgetSettings.travelCurrency,
    ...Object.keys(expenseTotalsByCurrency),
    ...(favoriteCurrencies || []),
    'USD',
    'VND',
    'KRW'
  ].filter(currency => SUPPORTED_CURRENCY_CODES.includes(currency))));
  const cashLedgerCurrency = cashCurrencyChoices.includes(budgetSettings.cashLedgerCurrency)
    ? budgetSettings.cashLedgerCurrency
    : cashCurrencyChoices.find(currency => currency !== 'KRW' && (cashSpentByCurrency[currency] || expenseTotalsByCurrency[currency]))
      || budgetSettings.travelCurrency
      || 'USD';
  const cashLedgers = budgetSettings.cashLedgers || {};
  const cashLedger = cashLedgers[cashLedgerCurrency] || {};
  const cashInitialAmount = Number(cashLedger.initial) || 0;
  const cashAdditionalAmount = Number(cashLedger.additional) || 0;
  const cashUsedAmount = cashSpentByCurrency[cashLedgerCurrency] || 0;
  const expectedCashBalance = cashInitialAmount + cashAdditionalAmount - cashUsedAmount;
  const actualCashBalance = cashLedger.actualRemaining === '' || cashLedger.actualRemaining === null || cashLedger.actualRemaining === undefined
    ? null
    : Number(cashLedger.actualRemaining);
  const cashDifference = actualCashBalance === null || !Number.isFinite(actualCashBalance)
    ? null
    : actualCashBalance - expectedCashBalance;
  const unassignedPaymentCount = (expenses || []).filter(expense => !expense.paymentMethod).length;
  const updateCashLedger = (updates) => {
    const currentLedger = cashLedgers[cashLedgerCurrency] || {};
    saveBudgetSettings({
      ...budgetSettings,
      cashLedgerCurrency,
      cashLedgers: {
        ...cashLedgers,
        [cashLedgerCurrency]: { ...currentLedger, ...updates }
      }
    });
  };
  const editingExpense = (expenses || []).find(expense => expense.id === editingExpenseId);
  const budgetProgress = budgetSettings.limitKRW > 0 ? Math.min((totalSpentKRW / budgetSettings.limitKRW) * 100, 100) : 0;
  const expenseCurrencyCode = expenseInput.currency || budgetSettings.travelCurrency || 'KRW';
  const expenseCurrencySymbol = getCurrencySymbol(expenseCurrencyCode);
  const expenseAmountValue = Number(expenseInput.amount);
  const expenseFormIsValid = Boolean(
    activeTripId
    && expenseInput.desc.trim()
    && expenseInput.paymentMethod
    && Number.isFinite(expenseAmountValue)
    && expenseAmountValue > 0
  );
  const expenseFormHint = !expenseInput.desc.trim()
    ? '지출 내용을 입력하면 추가할 수 있어요.'
    : !expenseInput.paymentMethod
      ? '현금, 카드 또는 계좌이체를 선택해 주세요.'
    : !Number.isFinite(expenseAmountValue) || expenseAmountValue <= 0
      ? '0보다 큰 금액을 입력하면 추가할 수 있어요.'
      : `${getCurrencyNameKO(expenseCurrencyCode)} 기준 금액으로 저장하고 한화로 자동 환산합니다.`;
  const expenseCurrencyChoices = Array.from(new Set([
    expenseInput.currency,
    budgetSettings.travelCurrency,
    ...(favoriteCurrencies || []),
    'USD',
    'KRW'
  ].filter(Boolean)));
  const useFloatingPlacePanel = true;

  // Robust Error Boundaries
  if (loadError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-red-50 text-red-500 font-sans p-10 text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#fef2f2', color: '#ef4444' }}>
        <AlertCircle size={48} className="mb-4" />
        <h1 style={{ fontSize: '24px', fontWeight: '900', margin: '16px 0 8px 0' }}>지도를 불러오지 못했습니다</h1>
        <p style={{ fontWeight: 'bold' }}>{loadError.message}</p>
      </div>
    );
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-orange-50 text-orange-500 font-sans p-10 text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#fff7ed', color: '#f97316' }}>
        <AlertCircle size={48} className="mb-4" />
        <h1 style={{ fontSize: '24px', fontWeight: '900', margin: '16px 0 8px 0' }}>지도 API 키가 없습니다</h1>
        <p style={{ fontWeight: 'bold' }}>환경 설정을 확인해주세요.</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-screen flex flex-col items-center justify-center font-sans bg-white text-gray-400" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'white', color: '#9ca3af' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', marginBottom: '16px', animation: 'spin 1s linear infinite' }}></div>
        <div style={{ fontWeight: '900', letterSpacing: '0.1em' }}>여행 지도를 불러오는 중…</div>
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
             <div style={{ width: '100%', position: 'relative' }}>
               <input
                  type="text"
                  className="search-input"
                  value={searchInput}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setSearchInput(nextValue);
                    setSearchQuery(nextValue);
                    setSearchResult(null);
                    requestPlaceSuggestions(nextValue);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setPlaceSuggestions([]);
                    if (e.key === "Enter") { e.preventDefault(); setPlaceSuggestions([]); handleSearchSubmit(); }
                  }}
                  aria-label="장소 또는 주소 검색"
                  placeholder="어디로 떠나시나요?"
                  autoComplete="off"
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
               {placeSuggestions.length > 0 && (
                 <div role="listbox" aria-label="장소 검색 제안" className="search-suggestions">
                   {placeSuggestions.map((suggestion, index) => {
                     const prediction = suggestion.placePrediction;
                     const primary = getFormattableText(prediction?.mainText) || getFormattableText(prediction?.text) || '장소';
                     const secondary = getFormattableText(prediction?.secondaryText);
                     return (
                       <button
                         type="button"
                         role="option"
                         key={`place-suggestion-${index}`}
                         onMouseDown={(event) => event.preventDefault()}
                         onClick={() => selectPlaceSuggestion(suggestion)}
                         className="search-suggestion-item"
                       >
                         <MapPin size={16} aria-hidden="true" />
                         <span>
                           <strong>{primary}</strong>
                           {secondary && <small>{secondary}</small>}
                         </span>
                       </button>
                     );
                   })}
                 </div>
               )}
             </div>
           </div>
           <button type="button" onClick={handleSearchSubmit} aria-label="장소 검색" style={{ width: '48px', height: '48px', backgroundColor: '#2563eb', color: 'white', borderRadius: '16px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>
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
          height: windowSize.width < 768 ? `${windowSize.height}px` : undefined,
          transform: windowSize.width < 768
            ? `translateY(${Math.max(0, Math.min(windowSize.height - 60, (sheetMode === 'full' ? 0 : sheetMode === 'half' ? windowSize.height * 0.45 : windowSize.height - 60) + dragOffset))}px)`
            : (sidebarOpen ? `translateY(${dragOffset}px)` : `translateY(calc(100% - 60px + ${dragOffset}px))`)
        }}
      >
        <div 
        role="button"
        tabIndex={0}
        aria-label={sheetMode === 'full' ? '일정 패널 줄이기' : '일정 패널 크게 보기'}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
          className="drag-handle" 
          onClick={() => {
            if (windowSize.width < 768) {
              if (sheetMode === 'collapsed') {
                setSheetMode('half');
              } else if (sheetMode === 'half') {
                setSheetMode('full');
              } else {
                setSheetMode('half');
              }
            } else {
              setSidebarOpen(!sidebarOpen);
            }
          }}
          style={{ cursor: 'pointer' }}
        ></div>

          {/* Header */}
          <div className={"sidebar-header " + (isMobileHeaderHidden ? "mobile-header-hidden" : "")} style={{ padding: '24px 32px', borderBottom: '1px solid #f3f4f6', backgroundColor: 'white', userSelect: 'none' }}>
            {/* Row 1: Logo & Auth */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#111827', margin: 0, letterSpacing: '-0.05em' }}>TravelPlaner</h1>
                <p style={{ fontSize: '9px', fontWeight: '800', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.15em', margin: '2px 0 0 0' }}>여행 일정 플래너</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {session ? (
                  <button onClick={() => supabase.auth.signOut()} style={{ background: '#f3f4f6', border: 'none', color: '#6b7280', fontWeight: '800', fontSize: '10px', cursor: 'pointer', padding: '8px 12px', borderRadius: '10px' }}>로그아웃</button>
                ) : (
                  <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })} style={{ background: 'white', border: '1px solid #e5e7eb', color: '#4b5563', padding: '8px 12px', borderRadius: '10px', fontWeight: '800', fontSize: '10px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <img src="https://www.google.com/favicon.ico" width="12" height="12" alt="Google" />
                    로그인
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Navigation Tabs & Share Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '6px', paddingRight: '12px', borderRight: '1px solid #f3f4f6' }}>
                <button 
                  onClick={() => { setIsMobileHeaderHidden(false); setViewMode('trips'); }}
                  style={{ width: '40px', height: '40px', borderRadius: '12px', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s', backgroundColor: viewMode === 'trips' ? '#8b5cf6' : '#f3f4f6', color: viewMode === 'trips' ? 'white' : '#9ca3af' }}
                  aria-label="내 여행" title="내 여행"
                >
                  <Plane size={18} />
                </button>
                <button 
                  onClick={() => { setIsMobileHeaderHidden(false); setViewMode('favorites'); }}
                  style={{ width: '40px', height: '40px', borderRadius: '12px', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s', backgroundColor: viewMode === 'favorites' ? '#ef4444' : '#f3f4f6', color: viewMode === 'favorites' ? 'white' : '#9ca3af' }}
                  aria-label="저장한 장소" title="저장한 장소"
                >
                  <Heart size={18} fill={viewMode === 'favorites' ? "currentColor" : "none"} />
                </button>
              </div>

              {activeTripId && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flex: 1 }}>
                  <button 
                    onClick={() => openItinerary()}
                    style={{ width: '40px', height: '40px', borderRadius: '12px', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s', backgroundColor: viewMode === 'itinerary' ? '#2563eb' : '#f3f4f6', color: viewMode === 'itinerary' ? 'white' : '#9ca3af' }}
                    aria-label="내 일정" title="내 일정"
                  >
                    <Calendar size={18} />
                  </button>
                  <button 
                    onClick={openBudget}
                    style={{ width: '40px', height: '40px', borderRadius: '12px', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s', backgroundColor: viewMode === 'budget' ? '#10b981' : '#f3f4f6', color: viewMode === 'budget' ? 'white' : '#9ca3af' }}
                    aria-label="예산" title="예산"
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
                      {copiedId === activeTrip?.id ? "복사됨" : (activeTrip?.sharedId ? "공유 중" : "초대")}
                    </button>
                  </div>
                </div>
              )}
              </div>
            </div>

          {/* List Content */}
          <div
            className="sidebar-list-content"
            onScroll={handleSidebarScroll}
            style={{
            flex: 1,
            overflowY: 'auto', 
            padding: '24px 32px',
            msOverflowStyle: 'none',
            scrollbarWidth: 'none'
          }}>
            <style>{`
              div::-webkit-scrollbar { display: none; }
            `}</style>
            
            {/* --- TRIPS MODE --- */}
            {viewMode === 'trips' && (
              <>
                <div style={{ marginBottom: '32px' }}>
                  <h2 className="menu-section-title" style={{ marginBottom: '24px' }}>내 여행</h2>
                  
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Row 1: Import Options */}
                      <div className="trip-action-grid">
                        <button onClick={() => setShowPasteModal(true)} className="trip-action-button" style={{ color: '#4f46e5', backgroundColor: '#f5f7ff', borderColor: '#e0e7ff' }}>
                          <Clipboard size={18} /> AI 일정 만들기
                        </button>
                        <button onClick={() => setShowPasteModal(true)} className="trip-action-button" style={{ color: '#2563eb', backgroundColor: '#f0f7ff', borderColor: '#dbeafe' }}>
                          <Clipboard size={18} /> 일정 텍스트 붙여넣기
                        </button>
                      </div>

                      {/* Row 2: Create & Join Options */}
                      <div className="trip-action-grid">
                        <button onClick={createNewTrip} className="trip-action-button" style={{ fontSize: '14px', color: 'white', backgroundColor: '#8b5cf6', borderColor: '#8b5cf6', boxShadow: '0 10px 15px -3px rgba(139, 92, 246, 0.3)' }}>
                          <PlusCircle size={18} /> 새 여행 계획하기
                        </button>
                        <button onClick={openJoinTripModal} className="trip-action-button" style={{ color: '#059669', backgroundColor: '#f0fdf4', borderColor: '#dcfce7' }}>
                          <Users size={18} /> 참여하기
                        </button>
                      </div>
                    </div>
                </div>

                {(trips || []).length === 0 ? (
                  <div style={{ padding: '60px 20px', border: '2px dashed #f3f4f6', borderRadius: '24px', textAlign: 'center' }}>
                    <Plane size={48} color="#e5e7eb" style={{ margin: '0 auto 16px auto' }} />
                    <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>아직 계획된 여행이 없습니다</p>
                    <p style={{ fontSize: "12px", color: "#94a3b8", fontWeight: "600", margin: "8px 0 0" }}>새 여행을 만들고 장소를 검색해 일정에 추가해 보세요.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(trips || []).map(trip => (
                      <div 
                        key={trip.id} 
                        onClick={() => { setActiveTripId(trip.id); openItinerary(); }}
                        role="button"
                        tabIndex={0}
                        aria-label={`${trip.name} 여행 열기`}
                        onKeyDown={(event) => {
                          if ((event.key === 'Enter' || event.key === ' ') && editingTripId !== trip.id) {
                            event.preventDefault();
                            setActiveTripId(trip.id);
                            openItinerary();
                          }
                        }}
                        style={{ padding: '24px', backgroundColor: activeTripId === trip.id ? '#f5f3ff' : 'white', border: activeTripId === trip.id ? '2px solid #ddd6fe' : '1px solid #f3f4f6', borderRadius: '20px', cursor: 'pointer', transition: '0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                          {editingTripId === trip.id ? (
                            <div 
                              onClick={(e) => e.stopPropagation()} 
                              style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                  <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '10px', fontWeight: '900', color: '#9ca3af' }}>국가</label>
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
                                    <label style={{ fontSize: '10px', fontWeight: '900', color: '#9ca3af' }}>여행 이름</label>
                                    <input 
                                      type="text" 
                                      value={editTripData.name} 
                                      onChange={(e) => setEditTripData({ ...editTripData, name: e.target.value })}
                                      placeholder="여행 이름"
                                      style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', fontWeight: '700', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                  <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '10px', fontWeight: '900', color: '#9ca3af' }}>시작일</label>
                                    <input 
                                      type="date" 
                                      value={editTripData.startDate} 
                                      onChange={(e) => setEditTripData({ ...editTripData, startDate: e.target.value })}
                                      style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', fontWeight: '700', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                  <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '10px', fontWeight: '900', color: '#9ca3af' }}>종료일</label>
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
                                여행 정보 저장
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', gap: '12px' }}>
                              <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#111827', margin: 0, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {trip.name}
                              </h3>
                              
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', borderRight: '1px solid #f3f4f6', paddingRight: '8px' }}>
                                  <button 
                                    type="button"
                                    aria-label={`${trip.name} 목록에서 위로 이동`}
                                    title="여행을 위로 이동"
                                    onClick={(e) => { e.stopPropagation(); moveTrip(trip.id, 'up'); }}
                                    style={{ background: 'none', border: 'none', color: (trips || []).indexOf(trip) === 0 ? '#f3f4f6' : '#cbd5e1', cursor: (trips || []).indexOf(trip) === 0 ? 'default' : 'pointer', padding: '1px', display: 'flex' }}
                                    disabled={(trips || []).indexOf(trip) === 0}
                                  >
                                    <ChevronUp size={14} />
                                  </button>
                                  <button 
                                    type="button"
                                    aria-label={`${trip.name} 목록에서 아래로 이동`}
                                    title="여행을 아래로 이동"
                                    onClick={(e) => { e.stopPropagation(); moveTrip(trip.id, 'down'); }}
                                    style={{ background: 'none', border: 'none', color: (trips || []).indexOf(trip) === (trips || []).length - 1 ? '#f3f4f6' : '#cbd5e1', cursor: (trips || []).indexOf(trip) === (trips || []).length - 1 ? 'default' : 'pointer', padding: '1px', display: 'flex' }}
                                    disabled={(trips || []).indexOf(trip) === (trips || []).length - 1}
                                  >
                                    <ChevronDown size={14} />
                                  </button>
                                </div>

                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button 
                                    type="button"
                                    aria-label={trip.sharedId ? `${trip.name} 초대 코드 복사` : `${trip.name} 친구 초대`}
                                    onClick={(e) => { e.stopPropagation(); trip.sharedId ? copyToClipboard(trip.sharedId, trip.id) : shareTrip(trip.id); }}
                                    style={{ width: '36px', height: '36px', borderRadius: '10px', border: 'none', backgroundColor: trip.sharedId ? '#f3f4f6' : '#f5f3ff', color: trip.sharedId ? '#6b7280' : '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                                    title={trip.sharedId ? "초대 코드 복사" : "친구 초대하기"}
                                  >
                                    {copiedId === trip.id ? <Check size={16} color="#10b981" /> : <Share2 size={16} />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); duplicateTrip(trip); }}
                                    style={{ width: "36px", height: "36px", borderRadius: "10px", border: "none", backgroundColor: "#f8fafc", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.2s" }}
                                    title="여행 복제"
                                    aria-label="여행 복제"
                                  >
                                    <Copy size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`${trip.name} 여행 정보 수정`}
                                    onClick={(e) => { e.stopPropagation(); startRenameTrip(trip); }}
                                    style={{ width: '36px', height: '36px', borderRadius: '10px', border: 'none', backgroundColor: '#f8fafc', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                                    title="여행 정보 수정"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button 
                                    type="button"
                                    aria-label={`${trip.name} 여행 삭제`}
                                    onClick={(e) => handleInlineDelete(e, `trip-${trip.id}`, () => deleteTrip(trip.id))}
                                    style={{ 
                                      minWidth: confirmDeleteId === `trip-${trip.id}` ? '60px' : '36px', 
                                      height: '36px', 
                                      borderRadius: '10px', 
                                      border: 'none', 
                                      backgroundColor: confirmDeleteId === `trip-${trip.id}` ? '#ef4444' : '#fff5f5', 
                                      color: confirmDeleteId === `trip-${trip.id}` ? 'white' : '#f87171', 
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s',
                                      fontSize: '11px', fontWeight: '800'
                                    }}
                                    title="여행 삭제"
                                  >
                                    {confirmDeleteId === `trip-${trip.id}` ? '확인' : <Trash2 size={16} />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        {editingTripId !== trip.id && (
                          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', fontWeight: '800', color: '#6b7280', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                              <Calendar size={13} color="#9ca3af" /> 
                              {trip.startDate ? (
                                <>
                                  <span style={{ color: '#111827' }}>{trip.startDate} ~ {trip.endDate}</span>
                                  <span style={{ color: '#9ca3af', marginLeft: '4px' }}>({(trip.itinerary || []).length}일차)</span>
                                </>
                              ) : (
                                <span style={{ color: '#111827' }}>{(trip.itinerary || []).length}일차</span>
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
                  <h2 className="menu-section-title">저장한 장소</h2>
                </div>
                {Object.keys(groupedFavorites).length === 0 ? (
                  <div style={{ padding: '40px 20px', border: '2px dashed #fecaca', borderRadius: '16px', textAlign: 'center' }}>
                    <Heart size={36} color="#fca5a5" style={{ margin: '0 auto 12px auto' }} />
                    <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>저장한 장소가 없습니다</p>
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
                          <span style={{ fontSize: '12px', fontWeight: '800', color: '#f87171' }}>{places.length} 장소</span>
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
                                    title={`${activeDay}일차 일정에 추가`}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, marginBottom: '24px' }}>
                  <h2 className="menu-section-title" style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}>내 일정</h2>
                  <div style={{ 
                    flex: '1 1 auto',
                    minWidth: 0,
                    display: 'flex', 
                    gap: '10px', 
                    alignItems: 'center', 
                    overflowX: 'auto', 
                    msOverflowStyle: 'none', 
                    scrollbarWidth: 'none',
                    paddingBottom: '4px' // 여백을 주어 그림자가 잘리지 않게 함
                  }}>
                    <style>{`
                      div::-webkit-scrollbar { display: none; }
                    `}</style>
                    <button
                        onClick={toggleTripReminders}
                        type="button"
                        aria-label="일정 알림 설정"
                        title="출발 전 알림 설정"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '800', color: activeTrip?.reminders?.enabled ? '#b45309' : '#64748b', backgroundColor: activeTrip?.reminders?.enabled ? '#fef3c7' : '#f8fafc', padding: '8px 12px', borderRadius: '14px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        <Bell size={14} /> {activeTrip?.reminders?.enabled ? '알림 켜짐' : '알림 설정'}
                    </button>
                    <button
                      onClick={() => exportTripAsIcal(activeTrip)}
                      type="button"
                      aria-label="캘린더 파일 내보내기"
                      title="Google Calendar/iCal 내보내기"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '800', color: '#2563eb', backgroundColor: '#eff6ff', padding: '8px 12px', borderRadius: '14px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      <Calendar size={14} /> 캘린더
                    </button>
                    <button
                      onClick={addDay} 
                      style={{ 
                        display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '800', 
                        color: '#2563eb', backgroundColor: '#eff6ff', padding: '8px 12px', borderRadius: '14px', 
                        border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dbeafe'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#eff6ff'}
                    >
                      <PlusCircle size={14} /> 일차 추가
                    </button>
                    <button
                      onClick={() => exportTripBackupAsJson(activeTrip)}
                      type="button"
                      aria-label="여행 데이터 백업 내보내기"
                      title="일정·지출·예산이 포함된 여행 데이터 백업"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '800', color: '#64748b', backgroundColor: '#f8fafc', padding: '8px 12px', borderRadius: '14px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      <Download size={14} /> 데이터 백업
                    </button>
                </div>
                </div>

                {/* Reserve list: places saved before assigning them to a day. */}
                <div
                  className="itinerary-reserve-card"
                  onClick={() => setActiveDay('reserve')}
                  style={{
                    backgroundColor: activeDay === 'reserve' ? '#fffbeb' : 'white',
                    borderRadius: '24px',
                    border: `1px solid ${activeDay === 'reserve' ? '#fcd34d' : '#fef3c7'}`,
                    boxShadow: '0 4px 20px rgba(245, 158, 11, 0.08)',
                    overflow: 'hidden',
                    marginBottom: '32px',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ padding: '20px 24px', backgroundColor: activeDay === 'reserve' ? '#fef3c7' : '#fffbeb', borderBottom: '1px solid #fef3c7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '14px', backgroundColor: '#f59e0b', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Star size={21} fill="currentColor" />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: 0, color: '#92400e', fontSize: '17px', fontWeight: '900' }}>예비 목록</h3>
                        <p style={{ margin: '4px 0 0', color: '#b45309', fontSize: '11px', fontWeight: '700' }}>일차를 정하기 전 잠시 보관하는 장소</p>
                      </div>
                    </div>
                    <span style={{ flexShrink: 0, padding: '7px 10px', borderRadius: '10px', backgroundColor: 'white', color: '#b45309', fontSize: '11px', fontWeight: '900' }}>{reserveItems.length} 장소</span>
                  </div>

                  <div onClick={(event) => event.stopPropagation()} style={{ padding: '20px 24px' }}>
                    {reserveItems.length === 0 ? (
                      <div style={{ padding: '24px 16px', textAlign: 'center', border: '2px dashed #fde68a', borderRadius: '16px' }}>
                        <p style={{ margin: 0, color: '#d97706', fontSize: '12px', fontWeight: '800' }}>장소 추가 창에서 예비 목록을 선택해 보관할 수 있습니다.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {reserveItems.map((item, reserveIndex) => {
                          const reserveDeleteId = `reserve-${item.id}`;
                          return (
                            <div key={item.id} className="reserve-item-card" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '14px', backgroundColor: 'white', border: '1px solid #fef3c7', borderRadius: '18px', boxShadow: '0 2px 8px rgba(245, 158, 11, 0.05)' }}>
                              <div aria-label={`${reserveIndex + 1}번째 예비 장소`} style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#f59e0b', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: '900', flexShrink: 0 }}>{reserveIndex + 1}</div>
                              <div style={{ flex: '1 1 150px', minWidth: 0 }}>
                                <h4
                                  onClick={() => {
                                    if (!item.lat || !item.lng) return;
                                    const newPos = { lat: Number(item.lat), lng: Number(item.lng) };
                                    setSelectedPlace(item);
                                    map?.panTo(newPos);
                                    map?.setZoom(16);
                                    if (windowSize.width < 768 && sheetMode === 'full') setSheetMode('half');
                                  }}
                                  style={{ margin: 0, color: item.lat && item.lng ? '#2563eb' : '#111827', textDecoration: item.lat && item.lng ? 'underline' : 'none', textDecorationColor: '#93c5fd', fontSize: '15px', fontWeight: '900', lineHeight: 1.3, whiteSpace: 'normal', overflow: 'visible', overflowWrap: 'anywhere', wordBreak: 'keep-all', cursor: item.lat && item.lng ? 'pointer' : 'default' }}
                                  title={item.lat && item.lng ? '지도에서 위치 보기' : undefined}
                                >
                                  {item.displayName || item.name || '장소 이름 정보 없음'}
                                </h4>
                                {item.loc && <p style={{ display: 'flex', alignItems: 'center', gap: '3px', margin: '4px 0 0', color: '#94a3b8', fontSize: '10px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><MapPin size={10} />{item.loc}</p>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 230px', justifyContent: 'flex-end' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '10px', overflow: 'hidden' }}>
                                  <button type="button" aria-label="예비 장소 위로 이동" onClick={() => moveReserveItem(item.id, 'up')} disabled={reserveIndex === 0} style={{ width: '28px', height: '20px', padding: 0, border: 'none', background: 'transparent', color: reserveIndex === 0 ? '#fcd34d' : '#b45309', cursor: reserveIndex === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronUp size={14} /></button>
                                  <button type="button" aria-label="예비 장소 아래로 이동" onClick={() => moveReserveItem(item.id, 'down')} disabled={reserveIndex === reserveItems.length - 1} style={{ width: '28px', height: '20px', padding: 0, border: 'none', borderTop: '1px solid #fef3c7', background: 'transparent', color: reserveIndex === reserveItems.length - 1 ? '#fcd34d' : '#b45309', cursor: reserveIndex === reserveItems.length - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronDown size={14} /></button>
                                </div>
                                <select value="" aria-label={`${item.displayName || item.name || '예비 장소'} 일차로 이동`} onChange={(event) => moveReserveItemToDay(item.id, event.target.value)} onClick={(event) => event.stopPropagation()} style={{ minWidth: '116px', maxWidth: '140px', padding: '8px 8px', border: '1px solid #fde68a', borderRadius: '10px', backgroundColor: '#fffdf5', color: '#92400e', fontSize: '11px', fontWeight: '800', outline: 'none' }}>
                                  <option value="">일차로 이동</option>
                                  {itinerary.map(dayPlan => <option key={`reserve-move-${item.id}-${dayPlan.day}`} value={parseDay(dayPlan.day)}>{parseDay(dayPlan.day)}일차</option>)}
                                </select>
                                <button type="button" aria-label="예비 장소 삭제" onClick={(event) => { event.stopPropagation(); handleInlineDelete(event, reserveDeleteId, () => removeReserveItem(item.id)); }} style={{ width: '36px', height: '36px', flexShrink: 0, border: `1px solid ${confirmDeleteId === reserveDeleteId ? '#dc2626' : '#fee2e2'}`, borderRadius: '10px', backgroundColor: confirmDeleteId === reserveDeleteId ? '#ef4444' : '#fff5f5', color: confirmDeleteId === reserveDeleteId ? 'white' : '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '900' }}>
                                  {confirmDeleteId === reserveDeleteId ? '확인' : <Trash2 size={16} />}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {(itinerary || []).map((dayPlan, dIdx) => (
                  <div 
                    className="itinerary-day-card"
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
                      className="itinerary-day-header"
                      onClick={() => dayPlan?.day && setActiveDay(parseDay(dayPlan.day))}
                      role="button"
                      tabIndex={0}
                      aria-label={`${dayPlan?.day}일차 선택`}
                      onKeyDown={(event) => {
                        if ((event.key === 'Enter' || event.key === ' ') && dayPlan?.day) {
                          event.preventDefault();
                          setActiveDay(parseDay(dayPlan.day));
                        }
                      }}
                      style={{ 
                        padding: '20px 24px', 
                        backgroundColor: parseDay(activeDay) === parseDay(dayPlan?.day) ? '#eff6ff' : '#f9fafb', 
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
                          backgroundColor: parseDay(activeDay) === parseDay(dayPlan?.day) ? '#2563eb' : '#9ca3af', 
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
                          <h3 style={{ fontSize: '16px', fontWeight: '900', color: '#111827', margin: 0 }}>{dayPlan?.day}일차</h3>
                          <p style={{ fontSize: '12px', fontWeight: '700', color: parseDay(activeDay) === parseDay(dayPlan?.day) ? '#3b82f6' : '#9ca3af', margin: 0 }}>
                            {getActualDateForDay(activeTrip?.startDate, dayPlan?.day)}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '900', color: parseDay(activeDay) === parseDay(dayPlan?.day) ? '#3b82f6' : '#9ca3af', backgroundColor: parseDay(activeDay) === parseDay(dayPlan?.day) ? '#dbeafe' : '#f3f4f6', padding: '4px 10px', borderRadius: '8px' }}>
                          {(dayPlan?.items || []).length} 장소
                        </span>
                        <button
                            type="button"
                            aria-label={`${dayPlan?.day}일차 삭제`}
                            title="이 일차 삭제"
                            onClick={(event) => { event.stopPropagation(); handleInlineDelete(event, `day-${dayPlan?.day}`, () => deleteDay(dayPlan?.day)); }}
                            style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '10px', backgroundColor: confirmDeleteId === `day-${dayPlan?.day}` ? '#ef4444' : '#fff5f5', color: confirmDeleteId === `day-${dayPlan?.day}` ? 'white' : '#f87171', cursor: 'pointer' }}
                          >
                            {confirmDeleteId === `day-${dayPlan?.day}` ? '확인' : <Trash2 size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* Day Items List */}
                    <div className="itinerary-day-items" style={{ padding: '24px' }}>
                      {(!dayPlan?.items || dayPlan.items.length === 0) ? (
                        <div style={{ padding: '32px', textAlign: 'center', border: '2px dashed #f3f4f6', borderRadius: '16px' }}>
                          <p style={{ fontSize: '13px', color: '#d1d5db', fontWeight: '700', margin: 0 }}>이 날의 일정을 추가해 보세요!</p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          {dayPlan.items.map((item, iIdx) => (
                              <div 
                                className="itinerary-item-card"
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
                                <div className="itinerary-item-main" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div
                                    className="itinerary-item-number"
                                    aria-label={`${iIdx + 1}번째 일정`}
                                    style={{
                                      width: '34px',
                                      height: '34px',
                                      borderRadius: '50%',
                                      backgroundColor: '#3b82f6',
                                      color: 'white',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '15px',
                                      fontWeight: '900',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {iIdx + 1}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                      <div
                                        aria-label={`${item.displayName || item.name || '일정'} 도착 시간 ${item.time || '09:00'}`}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          backgroundColor: '#f1f5f9',
                                          padding: '4px 10px',
                                          borderRadius: '8px',
                                          border: '1px solid #e2e8f0',
                                          flexShrink: 0,
                                          fontFamily: 'inherit',
                                          whiteSpace: 'nowrap',
                                          textAlign: 'left'
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
                                      <h4 
                                        onClick={() => {
                                          if (item.lat && item.lng) {
                                            const newPos = { lat: Number(item.lat), lng: Number(item.lng) };
                                            setSelectedPlace(item);
                                            if (map) {
                                              map.panTo(newPos);
                                              map.setZoom(16);
                                            }
                                            if (windowSize.width < 768 && sheetMode === 'full') {
                                              setSheetMode('half');
                                            }
                                          }
                                        }}
                                        style={{ 
                                          fontSize: '15px',
                                          fontWeight: '900', 
                                          color: (item.lat && item.lng) ? '#2563eb' : '#000000',
                                          textDecoration: (item.lat && item.lng) ? 'underline' : 'none',
                                          textDecorationColor: (item.lat && item.lng) ? '#93c5fd' : 'transparent',
                                          margin: 0, 
                                          whiteSpace: 'normal',
                                          minWidth: 0,
                                          flex: '1 1 140px',
                                          overflow: 'visible',
                                          overflowWrap: 'anywhere',
                                          wordBreak: 'keep-all',
                                          cursor: (item.lat && item.lng) ? 'pointer' : 'default',
                                          transition: 'all 0.2s ease'
                                        }}
                                        title={(item.lat && item.lng) ? "지도에서 위치 보기" : undefined}
                                      >
                                        {item.displayName || item.name || '장소 이름 정보 없음'}
                                      </h4>
                                    </div>
                                  </div>
                                  <div className="itinerary-item-actions" style={{
                                    display: 'grid', 
                                    gridTemplateColumns: 'repeat(2, 44px)', 
                                    gridTemplateRows: 'repeat(2, 44px)',
                                    gap: '6px',
                                    alignItems: 'center'
                                  }}>
                                    {/* Order Group */}
                                    <div style={{ 
                                      display: 'flex', 
                                      flexDirection: 'column', 
                                      backgroundColor: '#f8fafc', 
                                      borderRadius: '12px', 
                                      overflow: 'hidden',
                                      border: '1px solid #f1f5f9'
                                    }}>
                                      <button 
                                        type="button"
                                        aria-label={`${item.displayName || item.name || '일정'} 위로 이동`}
                                        title="위로 이동"
                                        onClick={() => moveItineraryItem(dayPlan.day, item.id, 'up')}
                                        style={{ background: 'none', border: 'none', color: iIdx === 0 ? '#e5e7eb' : '#9ca3af', cursor: iIdx === 0 ? 'default' : 'pointer', padding: '4px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        disabled={iIdx === 0}
                                      >
                                        <ChevronUp size={14} />
                                      </button>
                                      <button 
                                        type="button"
                                        aria-label={`${item.displayName || item.name || '일정'} 아래로 이동`}
                                        title="아래로 이동"
                                        onClick={() => moveItineraryItem(dayPlan.day, item.id, 'down')}
                                        style={{ background: 'none', border: 'none', color: iIdx === dayPlan.items.length - 1 ? '#e5e7eb' : '#9ca3af', cursor: iIdx === dayPlan.items.length - 1 ? 'default' : 'pointer', padding: '4px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid #f1f5f9' }}
                                        disabled={iIdx === dayPlan.items.length - 1}
                                      >
                                        <ChevronDown size={14} />
                                      </button>
                                    </div>

                                    {/* Edit Button */}
                                    <button
                                      type="button"
                                      aria-label={`${item.displayName || item.name || '일정'} 편집`}
                                      title="일정 편집: 이름, 시간, 일정 위치 변경"
                                      onClick={(event) => { event.stopPropagation(); startEditingItineraryItem(dayPlan.day, item); }}
                                      style={{
                                        height: '44px', width: '44px',
                                        color: '#2563eb', backgroundColor: '#eff6ff',
                                        border: '1px solid #bfdbfe', borderRadius: '12px',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.2s'
                                      }}
                                    >
                                      <Edit2 size={18} />
                                    </button>

                                    {/* Navigation Button */}
                                    <button 
                                      type="button"
                                      aria-label={`${item.displayName || item.name || '일정'} 길찾기`}
                                      title="길찾기"
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        const isKoreaTrip = activeTrip?.country === '대한민국';
                                        const isKoreaAddress = ['대한민국', '강원', '경기', '서울', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '충북', '충남', '전북', '전남', '경북', '경남', '제주'].some(k => item.loc?.includes(k));
                                        
                                          if (isKoreaTrip || isKoreaAddress) {
                                            const destName = encodeURIComponent(item.name);
                                            const dlat = item.lat;
                                            const dlng = item.lng;
                                            const webUrl = `https://map.naver.com/index.nhn?elng=${dlng}&elat=${dlat}&etext=${destName}&menu=route&pathType=1`;
                                            if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                                              window.location.href = `nmap://route/pubtrans?dlat=${dlat}&dlng=${dlng}&dname=${destName}&appname=worldpro`;
                                              setTimeout(() => { window.open(webUrl, '_blank'); }, 1500);
                                            } else if (/Android/i.test(navigator.userAgent)) {
                                              window.location.href = `intent://route/pubtrans?dlat=${dlat}&dlng=${dlng}&dname=${destName}&appname=worldpro#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end`;
                                            } else { window.open(webUrl, '_blank'); }
                                          } else {
                                          const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}&destination_place_id=${item.placeId || ''}`;
                                          if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                                            window.location.href = `comgooglemaps://?daddr=${item.lat},${item.lng}&directionsmode=walking`;
                                            setTimeout(() => { window.open(googleUrl, '_blank'); }, 500);
                                          } else { window.open(googleUrl, '_blank'); }
                                        }
                                      }}
                                      style={{ 
                                        height: '44px', width: '44px',
                                        color: '#3b82f6', backgroundColor: '#eff6ff', 
                                        border: '1px solid #dbeafe', borderRadius: '12px', 
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.2s'
                                      }}
                                    >
                                      <Navigation size={18} />
                                    </button>

                                    {/* Delete Button */}
                                    <div style={{ position: 'relative', width: '44px', height: '44px' }}>
                                      <button 
                                        type="button"
                                        aria-label={`${item.displayName || item.name || '일정'} 일정 삭제`}
                                        title={confirmDeleteId === `itin-${item.id}` ? '삭제 확인' : '일정 삭제'}
                                        onClick={(e) => { e.stopPropagation(); handleInlineDelete(e, `itin-${item.id}`, () => removeFromItinerary(dayPlan.day, item.id)); }}
                                        style={{ 
                                          position: confirmDeleteId === `itin-${item.id}` ? 'absolute' : 'relative',
                                          right: 0,
                                          top: 0,
                                          height: '44px', 
                                          width: confirmDeleteId === `itin-${item.id}` ? '94px' : '44px',
                                          zIndex: confirmDeleteId === `itin-${item.id}` ? 50 : 1,
                                          color: confirmDeleteId === `itin-${item.id}` ? 'white' : '#f87171', 
                                          backgroundColor: confirmDeleteId === `itin-${item.id}` ? '#ef4444' : '#fff5f5', 
                                          border: `1px solid ${confirmDeleteId === `itin-${item.id}` ? '#dc2626' : '#fee2e2'}`,
                                          borderRadius: '12px', 
                                          cursor: 'pointer', 
                                          display: 'flex', 
                                          alignItems: 'center', 
                                          justifyContent: 'center',
                                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                          fontSize: '11px', 
                                          fontWeight: '900',
                                          boxShadow: confirmDeleteId === `itin-${item.id}` ? '0 4px 12px rgba(239, 68, 68, 0.3)' : 'none',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {confirmDeleteId === `itin-${item.id}` ? '삭제 확인' : <Trash2 size={18} />}
                                      </button>
                                    </div>
                                  </div>
                                </div>

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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '24px' }}>
                  <h2 className="menu-section-title">예산 및 지출</h2>
                  <button type="button" onClick={() => exportBudgetAsCsv(activeTrip)} aria-label="예산 CSV 내보내기" title="예산 CSV 내보내기" style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 11px', border: 'none', borderRadius: '12px', backgroundColor: '#ecfdf5', color: '#059669', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}><FileText size={14} /> CSV</button>
                </div>

                {/* Progress Card */}
                <div style={{ backgroundColor: '#ecfdf5', padding: '20px', borderRadius: '16px', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px' }}>
                    <div>
                      <p style={{ fontSize: '10px', fontWeight: '800', color: '#059669', textTransform: 'uppercase', margin: '0 0 4px 0' }}>총 지출 (한화 환산)</p>
                      <h3 style={{ fontSize: '24px', fontWeight: '900', color: '#064e3b', margin: 0 }}>₩ {totalSpentKRW.toLocaleString()}</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '10px', fontWeight: '800', color: '#34d399', textTransform: 'uppercase', margin: '0 0 4px 0' }}>예산 한도</p>
                        <div style={{ display: 'inline-flex', alignItems: 'center', borderBottom: '2px solid #a7f3d0' }}>
                          <span style={{ fontSize: '14px', fontWeight: '900', color: '#064e3b' }}>₩</span>
                          <input
                            type="number"
                            value={budgetSettings.limitKRW}
                            onChange={(e) => saveBudgetSettings({ ...budgetSettings, limitKRW: Number(e.target.value) })}
                            aria-label="예산 한도(원화)"
                            style={{ fontSize: '14px', fontWeight: '800', color: '#064e3b', backgroundColor: 'transparent', border: 'none', width: '92px', textAlign: 'right', outline: 'none' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="budget-spend-summary-grid">
                    <div className="budget-spend-summary-item">
                      <span>한화로 입력한 지출</span>
                      <strong>₩{krwSpent.toLocaleString()}</strong>
                    </div>
                    {localCurrencyTotals.length > 0 ? localCurrencyTotals.map(([currency, amount]) => (
                      <div className="budget-spend-summary-item" key={`summary-currency-${currency}`}>
                        <span>{getCurrencyNameKO(currency)} ({currency})</span>
                        <div className="budget-spend-summary-values">
                          <strong>{getCurrencySymbol(currency)}{amount.toLocaleString()}</strong>
                          <small>₩{(expenseKRWTotalsByCurrency[currency] || 0).toLocaleString()}</small>
                        </div>
                      </div>
                    )) : (
                      <div className="budget-spend-summary-item budget-spend-summary-empty">
                        <span>현지 통화 지출</span>
                        <strong>기록 없음</strong>
                      </div>
                    )}
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
                <div className="expense-form-card" style={{ padding: '16px', backgroundColor: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '16px', marginBottom: '24px' }}>
                  <div className="expense-form-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px' }}>
                    <div>
                      <h3 style={{ margin: 0, color: '#0f172a', fontSize: '15px', fontWeight: '900' }}>지출 추가</h3>
                      <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '10px', fontWeight: '700' }}>여행 일차와 통화를 확인한 뒤 내용을 입력하세요.</p>
                    </div>
                    <span className="expense-form-required" style={{ flexShrink: 0, padding: '5px 8px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#059669', fontSize: '10px', fontWeight: '900' }}>내용 · 결제수단 · 금액 필수</span>
                  </div>

                  <div className="expense-form-row expense-form-day-time">
                    <div className="expense-form-field" style={{ flex: '1 1 0' }}>
                      <label className="expense-form-label" htmlFor="expense-day-select">사용 일차</label>
                      <select
                        id="expense-day-select"
                        className="expense-form-control"
                        value={expenseInput.day}
                        onChange={e => setExpenseInput({ ...expenseInput, day: e.target.value })}
                        aria-label="지출 사용 일차"
                      >
                        <option value={0}>여행 전 준비</option>
                        {itinerary.map(dayPlan => {
                          const dayNumber = parseInt(dayPlan.day, 10);
                          const actualDate = activeTrip?.startDate ? getActualDateForDay(activeTrip.startDate, dayNumber) : '';
                          return <option key={`opt-day-${dayNumber}`} value={dayNumber}>{dayNumber}일차{actualDate ? ` · ${actualDate}` : ''}</option>;
                        })}
                      </select>
                    </div>
                    <div className="expense-form-field" style={{ flex: '1 1 0' }}>
                      <label className="expense-form-label" htmlFor="expense-time-input">소비 시간</label>
                      <div className="expense-form-time-control">
                        <Clock size={14} color="#64748b" aria-hidden="true" />
                        <input
                          id="expense-time-input"
                          type="time"
                          value={expenseInput.time || ''}
                          onChange={e => setExpenseInput({ ...expenseInput, time: e.target.value })}
                          aria-label="소비 시간"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="expense-form-row">
                    <div className="expense-form-field" style={{ flex: '1 1 100%' }}>
                      <label className="expense-form-label" htmlFor="expense-description-input">지출 내용</label>
                      <input
                        id="expense-description-input"
                        className="expense-form-control"
                        type="text"
                        placeholder="예: 저녁 식사, 택시비"
                        value={expenseInput.desc}
                        onChange={e => setExpenseInput({ ...expenseInput, desc: e.target.value })}
                        aria-label="지출 내용"
                        maxLength={120}
                      />
                    </div>
                  </div>

                  <div className="expense-form-row expense-form-currency-payment-amount">
                    <div className="expense-form-field" style={{ flex: '1.2 1 0' }}>
                      <label className="expense-form-label" htmlFor="expense-currency-select">사용 통화</label>
                      <select
                        id="expense-currency-select"
                        className="expense-form-control"
                        value={expenseInput.currency || budgetSettings.travelCurrency}
                        onChange={e => setExpenseInput({ ...expenseInput, currency: e.target.value })}
                        aria-label="지출 입력 통화"
                      >
                        {expenseCurrencyChoices.map(code => (
                          <option key={`expense-currency-${code}`} value={code}>
                            {code === budgetSettings.travelCurrency ? '기본 · ' : ''}{getCurrencySymbol(code)} {getCurrencyNameKO(code)} ({code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="expense-form-field">
                      <label className="expense-form-label" htmlFor="expense-payment-method-select">결제 수단</label>
                      <select
                        id="expense-payment-method-select"
                        className="expense-form-control"
                        value={expenseInput.paymentMethod}
                        onChange={e => setExpenseInput({ ...expenseInput, paymentMethod: e.target.value })}
                        aria-label="지출 결제 수단"
                      >
                        <option value="">결제 수단 선택</option>
                        {PAYMENT_METHODS.map(method => <option key={`expense-payment-${method.value}`} value={method.value}>{method.label}</option>)}
                      </select>
                    </div>
                    <div className="expense-form-field expense-form-amount-field">
                      <label className="expense-form-label" htmlFor="expense-amount-input">금액 · {expenseCurrencySymbol} {expenseCurrencyCode}</label>
                      <div className="expense-form-amount-control">
                        <span aria-hidden="true">{expenseCurrencySymbol}</span>
                        <input
                          id="expense-amount-input"
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          placeholder="0"
                          value={expenseInput.amount}
                          onChange={e => setExpenseInput({ ...expenseInput, amount: e.target.value })}
                          aria-label={`지출 금액(${expenseCurrencyCode})`}
                        />
                      </div>
                    </div>
                  </div>

                  <p className={`expense-form-hint${expenseFormIsValid ? ' expense-form-hint-valid' : ''}`} role="status" aria-live="polite">{expenseFormHint}</p>
                  <button
                    type="button"
                    onClick={addExpense}
                    disabled={!expenseFormIsValid}
                    aria-disabled={!expenseFormIsValid}
                    style={{ width: '100%', padding: '12px', backgroundColor: expenseFormIsValid ? '#10b981' : '#cbd5e1', color: 'white', border: 'none', borderRadius: '10px', fontSize: '12px', fontWeight: '900', cursor: expenseFormIsValid ? 'pointer' : 'not-allowed', boxShadow: expenseFormIsValid ? '0 4px 10px rgba(16, 185, 129, 0.2)' : 'none', transition: 'all 0.2s' }}
                  >
                    + 지출 추가
                  </button>
                </div>

                {/* Expenses List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {expenses.length === 0 ? (
                    <div style={{ padding: '32px 20px', border: '2px dashed #e5e7eb', borderRadius: '16px', textAlign: 'center' }}>
                      <p style={{ fontSize: '11px', color: '#d1d5db', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>기록된 지출이 없습니다</p>
                    </div>
                  ) : (
                    [0, ...itinerary.map(d=>d.day)].map(dayNum => {
                      const dayExpenses = expenses.filter(e => e.day === dayNum);
                      if (dayExpenses.length === 0) return null;
                      const daySubtotalKRW = dayExpenses.reduce((sum, expense) => sum + Number(expense.amountKRW ?? expense.amount ?? 0), 0);
                      const dayCurrencyTotals = dayExpenses.reduce((totals, expense) => {
                        const currency = expense.currency || 'KRW';
                        const amount = Number(expense.amount) || 0;
                        totals[currency] = (totals[currency] || 0) + amount;
                        return totals;
                      }, {});
                      const daySubtotalCurrencies = Object.entries(dayCurrencyTotals)
                        .filter(([, amount]) => amount > 0)
                        .sort(([currency]) => currency === 'KRW' ? -1 : 0);
                      
                      return (
                        <div key={`exp-day-${dayNum}`} style={{ marginBottom: '16px' }}>
                          <div className="expense-day-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                            <h4 style={{ flex: 1, minWidth: 0, fontSize: '10px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', margin: 0 }}>
                              {dayNum === 0 ? '여행 전 준비' : `${dayNum}일차 ${activeTrip?.startDate ? `(${getActualDateForDay(activeTrip.startDate, dayNum)})` : ''}`}
                            </h4>
                            <div className="expense-subtotal-summary">
                              <strong>소계 ₩{daySubtotalKRW.toLocaleString()}</strong>
                              {daySubtotalCurrencies.length > 0 && (
                                <span className="expense-subtotal-breakdown">
                                  {daySubtotalCurrencies.map(([currency, amount], index) => (
                                    <React.Fragment key={`subtotal-${dayNum}-${currency}`}>
                                      {index > 0 ? ' + ' : ''}
                                      {currency === 'KRW' ? '원화 ' : index === 0 ? '현지 ' : ''}
                                      {getCurrencySymbol(currency)}{amount.toLocaleString()}
                                    </React.Fragment>
                                  ))}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {dayExpenses.map((exp, expenseIndex) => {
                              const localAmount = Number(exp.amount) || 0;
                              const amountKRW = Number(exp.amountKRW ?? exp.amount) || 0;
                              const expenseCurrency = exp.currency || 'KRW';

                              return (
                              <div key={exp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 16px', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  {exp.time && (
                                    <div className="expense-item-time">
                                      <Clock size={10} aria-hidden="true" />
                                      소비 시간 {exp.time}
                                    </div>
                                  )}
                                  <h5 style={{ fontSize: '13px', fontWeight: '800', color: '#111827', margin: '0 0 4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.desc}</h5>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span className={`expense-payment-badge${exp.paymentMethod ? ` is-${exp.paymentMethod}` : ' is-unassigned'}`}>
                                      {getPaymentMethodLabel(exp.paymentMethod)}
                                    </span>
                                    {expenseCurrency !== 'KRW' && (
                                      <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', whiteSpace: 'nowrap' }}>
                                        현지 {getCurrencySymbol(expenseCurrency)}{localAmount.toLocaleString()} ({expenseCurrency})
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '7px', flexShrink: 0 }}>
                                  <span style={{ fontSize: '13px', fontWeight: '900', color: '#059669', whiteSpace: 'nowrap' }}>
                                    <span style={{ fontSize: '9px', marginRight: '3px', color: '#10b981' }}>한화</span>
                                    ₩{amountKRW.toLocaleString()}
                                  </span>
                                  <div className="expense-item-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '32px', height: '40px', padding: '2px', boxSizing: 'border-box', border: '1px solid #f1f5f9', borderRadius: '10px', backgroundColor: '#f8fafc' }}>
                                      <button
                                        type="button"
                                        onClick={() => moveExpense(exp.id, -1)}
                                        disabled={expenseIndex === 0}
                                        aria-label={`${exp.desc} 위로 이동`}
                                        title="위로 이동"
                                        style={{ width: '26px', height: '17px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: 'none', borderRadius: '5px', backgroundColor: 'transparent', color: expenseIndex === 0 ? '#d1d5db' : '#64748b', cursor: expenseIndex === 0 ? 'default' : 'pointer' }}
                                      >
                                        <ChevronUp size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => moveExpense(exp.id, 1)}
                                        disabled={expenseIndex === dayExpenses.length - 1}
                                        aria-label={`${exp.desc} 아래로 이동`}
                                        title="아래로 이동"
                                        style={{ width: '26px', height: '17px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: 'none', borderTop: '1px solid #e5e7eb', borderRadius: '0 0 5px 5px', backgroundColor: 'transparent', color: expenseIndex === dayExpenses.length - 1 ? '#d1d5db' : '#64748b', cursor: expenseIndex === dayExpenses.length - 1 ? 'default' : 'pointer' }}
                                      >
                                        <ChevronDown size={13} />
                                      </button>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => startEditingExpense(exp)}
                                      aria-label={`${exp.desc} 지출 수정`}
                                      title="지출 수정"
                                      style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: '1px solid #bfdbfe', borderRadius: '10px', backgroundColor: '#eff6ff', color: '#2563eb', cursor: 'pointer', transition: 'all 0.2s' }}
                                    >
                                      <Edit2 size={17} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => handleInlineDelete(e, `exp-${exp.id}`, () => deleteExpense(exp.id))}
                                      aria-label={`${exp.desc} 지출 삭제`}
                                      title="지출 삭제"
                                      style={{ minWidth: confirmDeleteId === `exp-${exp.id}` ? '40px' : '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: confirmDeleteId === `exp-${exp.id}` ? '6px 8px' : '6px', backgroundColor: confirmDeleteId === `exp-${exp.id}` ? '#ef4444' : '#fef2f2', color: confirmDeleteId === `exp-${exp.id}` ? 'white' : '#ef4444', border: '1px solid #fee2e2', borderRadius: '10px', cursor: 'pointer', fontSize: '11px', fontWeight: '800' }}
                                    >
                                      {confirmDeleteId === `exp-${exp.id}` ? '확인' : <Trash2 size={16} />}
                                    </button>
                                  </div>
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Cash Reconciliation */}
                <div className="cash-reconciliation-card" style={{ padding: '16px', backgroundColor: '#fffaf0', border: '1px solid #fde68a', borderRadius: '16px', marginTop: '24px', marginBottom: '16px' }}>
                  <button
                    type="button"
                    className="cash-reconciliation-toggle"
                    onClick={() => setShowCashReconciliation((visible) => !visible)}
                    aria-expanded={showCashReconciliation}
                    aria-controls="cash-reconciliation-panel"
                  >
                    <span>
                      <strong className="cash-reconciliation-toggle-title">현금 정산</strong>
                      <span className="cash-reconciliation-toggle-description">환전·인출한 금액과 현금 지출을 비교해 잔액을 확인하세요.</span>
                    </span>
                    <span className={`cash-reconciliation-status-chip${cashDifference === null ? ' is-pending' : cashDifference === 0 ? ' is-matched' : ' is-mismatch'}`}>
                      {cashDifference === null ? '입력 필요' : cashDifference === 0 ? '정산 일치' : '확인 필요'}
                      <ChevronDown size={15} className={showCashReconciliation ? 'is-open' : ''} aria-hidden="true" />
                    </span>
                  </button>

                  {showCashReconciliation && (
                    <div id="cash-reconciliation-panel" className="cash-reconciliation-panel">
                      <div className="cash-reconciliation-panel-heading">
                        <span>정산 통화</span>
                        <select
                          value={cashLedgerCurrency}
                          onChange={(e) => saveBudgetSettings({ ...budgetSettings, cashLedgerCurrency: e.target.value })}
                          aria-label="현금 정산 통화"
                        >
                          {cashCurrencyChoices.map(code => (
                            <option key={`cash-ledger-currency-${code}`} value={code}>
                              {getCurrencySymbol(code)} {getCurrencyNameKO(code)} ({code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="cash-reconciliation-fields">
                        <div className="expense-form-field">
                          <label className="expense-form-label" htmlFor="cash-initial-input">여행 전 환전·인출</label>
                          <div className="expense-form-amount-control cash-reconciliation-input">
                            <span aria-hidden="true">{getCurrencySymbol(cashLedgerCurrency)}</span>
                            <input id="cash-initial-input" type="number" min="0" step="any" inputMode="decimal" value={cashLedger.initial ?? ''} onChange={(e) => updateCashLedger({ initial: e.target.value })} placeholder="0" aria-label={`여행 전 환전·인출 금액(${cashLedgerCurrency})`} />
                          </div>
                        </div>
                        <div className="expense-form-field">
                          <label className="expense-form-label" htmlFor="cash-additional-input">추가 환전·인출</label>
                          <div className="expense-form-amount-control cash-reconciliation-input">
                            <span aria-hidden="true">{getCurrencySymbol(cashLedgerCurrency)}</span>
                            <input id="cash-additional-input" type="number" min="0" step="any" inputMode="decimal" value={cashLedger.additional ?? ''} onChange={(e) => updateCashLedger({ additional: e.target.value })} placeholder="0" aria-label={`추가 환전·인출 금액(${cashLedgerCurrency})`} />
                          </div>
                        </div>
                        <div className="expense-form-field">
                          <label className="expense-form-label" htmlFor="cash-actual-input">실제 남은 현금</label>
                          <div className="expense-form-amount-control cash-reconciliation-input">
                            <span aria-hidden="true">{getCurrencySymbol(cashLedgerCurrency)}</span>
                            <input id="cash-actual-input" type="number" min="0" step="any" inputMode="decimal" value={cashLedger.actualRemaining ?? ''} onChange={(e) => updateCashLedger({ actualRemaining: e.target.value })} placeholder="확인 후 입력" aria-label={`실제 남은 현금(${cashLedgerCurrency})`} />
                          </div>
                        </div>
                      </div>

                      <div className="cash-reconciliation-summary">
                        <div><span>현금 사용</span><strong>{getCurrencySymbol(cashLedgerCurrency)}{cashUsedAmount.toLocaleString()}</strong></div>
                        <div><span>예상 잔액</span><strong>{getCurrencySymbol(cashLedgerCurrency)}{expectedCashBalance.toLocaleString()}</strong></div>
                        <div className={cashDifference === null ? '' : cashDifference === 0 ? 'is-matched' : 'is-mismatch'}>
                          <span>차이</span>
                          <strong>{cashDifference === null ? '실제 잔액 입력 필요' : `${cashDifference >= 0 ? '+' : ''}${getCurrencySymbol(cashLedgerCurrency)}${cashDifference.toLocaleString()}`}</strong>
                        </div>
                      </div>

                      <p className={`cash-reconciliation-status${cashDifference === 0 ? ' is-matched' : cashDifference !== null ? ' is-mismatch' : ''}`} role="status" aria-live="polite">
                        {cashDifference === null
                          ? '실제 남은 현금을 입력하면 예상 잔액과 비교할 수 있어요.'
                          : cashDifference === 0
                            ? '정산 일치 · 입력한 현금과 예상 잔액이 같습니다.'
                            : `확인 필요 · 실제 잔액이 예상보다 ${getCurrencySymbol(cashLedgerCurrency)}${Math.abs(cashDifference).toLocaleString()} ${cashDifference > 0 ? '많습니다.' : '적습니다.'}`}
                      </p>
                      {unassignedPaymentCount > 0 && (
                        <p className="cash-reconciliation-note">결제 수단이 지정된 현금 지출만 현금 사용액에 반영됩니다. 아직 결제 수단이 없는 지출 {unassignedPaymentCount}건이 있습니다.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Currency Manager */}
                <div className="currency-manager-card" style={{ padding: '14px 16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', marginBottom: '20px' }}>
                  <button
                    type="button"
                    className="currency-manager-toggle"
                    onClick={() => setShowCurrencyManager((visible) => !visible)}
                    aria-expanded={showCurrencyManager}
                    aria-controls="currency-manager-panel"
                  >
                    <span>
                      <strong className="currency-manager-toggle-title">즐겨찾기 통화</strong>
                      <span className="currency-manager-toggle-description">지출 입력에서 빠르게 선택할 통화를 관리하세요.</span>
                    </span>
                    <span className="currency-manager-count">{(favoriteCurrencies || []).length}개 <ChevronDown size={15} className={showCurrencyManager ? 'is-open' : ''} aria-hidden="true" /></span>
                  </button>

                  {showCurrencyManager && (
                    <div id="currency-manager-panel" className="currency-manager-panel">
                      <select
                        value=""
                        onChange={(e) => addFavoriteCurrency(e.target.value)}
                        aria-label="즐겨찾기 통화 추가"
                      >
                        <option value="">＋ 통화 추가</option>
                        {SUPPORTED_CURRENCY_CODES
                          .filter(code => !(favoriteCurrencies || []).includes(code))
                          .map(code => (
                            <option key={`favorite-currency-option-${code}`} value={code}>
                              {getCurrencySymbol(code)} {getCurrencyNameKO(code)} ({code})
                            </option>
                          ))}
                      </select>
                      <div className="currency-manager-chips">
                        {(favoriteCurrencies || []).length === 0 ? (
                          <span>즐겨찾기 통화가 없습니다.</span>
                        ) : (
                          (favoriteCurrencies || []).map(code => (
                            <div key={`favorite-currency-${code}`} className={`currency-manager-chip${expenseCurrencyCode === code ? ' is-selected' : ''}`}>
                              <button type="button" onClick={() => setExpenseInput(current => ({ ...current, currency: code }))} title={`${getCurrencyNameKO(code)}를 지출 입력 통화로 선택`}>
                                {getCurrencySymbol(code)} {code}
                              </button>
                              <button type="button" onClick={() => removeFavoriteCurrency(code)} aria-label={`${getCurrencyNameKO(code)} 즐겨찾기에서 제거`} title="즐겨찾기에서 제거">×</button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

          </div>

          {/* Footer */}
        <div style={{ padding: '24px 32px', borderTop: '1px solid #f3f4f6', backgroundColor: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: "11px", fontWeight: "900", color: "#111827", letterSpacing: "0.05em" }}>{(favorites || []).length} 저장 • {totalSpots} 일정</span>
            <span style={{ fontSize: "10px", fontWeight: "800", color: syncStatus === "error" ? "#ef4444" : syncStatus === "saving" ? "#f59e0b" : "#10b981" }}>{isLoadingDB ? "동기화 중…" : syncStatus === "saving" ? "저장 중…" : syncStatus === "error" ? "로컬 저장됨" : "저장됨"}</span>
            <button onClick={() => setSidebarOpen(false)} style={{ fontSize: '11px', fontWeight: '900', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.05em' }}>닫기</button>
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
              <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '900', color: '#a78bfa' }}>초대 코드 복사됨</h4>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: '#d1d5db', lineHeight: 1.4 }}>이 코드를 친구에게 전달하면<br/>실시간으로 함께 일정을 짤 수 있습니다! 🤝</p>
            </div>
            <button 
              aria-label="알림 닫기"
              title="알림 닫기"
              onClick={() => setShowShareToast(false)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: '4px' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {mergeNotice && (
        <div role="status" style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 11000, width: 'min(92vw, 480px)', padding: '16px 18px', borderRadius: '18px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', boxShadow: '0 12px 30px rgba(15,23,42,0.12)', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <Check size={18} color="#059669" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', color: '#065f46', fontSize: '13px', marginBottom: '4px' }}>기존 일정과 동기화했습니다</strong>
            <span style={{ color: '#047857', fontSize: '12px', lineHeight: 1.5 }}>로그인 전 저장된 여행 {mergeNotice.trips}개{mergeNotice.favorites > 0 ? `와 장소 ${mergeNotice.favorites}개` : ''}를 계정에 병합했습니다.</span>
          </div>
          <button type="button" aria-label="동기화 안내 닫기" onClick={() => setMergeNotice(null)} style={{ border: 'none', background: 'none', color: '#059669', cursor: 'pointer', padding: '2px' }}><X size={16} /></button>
        </div>
      )}

      {showCreateTripModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-trip-modal-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancelCreateTrip();
          }}
          style={{
            position: 'fixed', inset: 0, zIndex: 13000,
            backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px', animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <form
            onSubmit={(event) => { event.preventDefault(); saveNewTrip(); }}
            style={{
              backgroundColor: 'white', borderRadius: '28px', width: '100%', maxWidth: '440px',
              maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', padding: '28px 24px',
              boxShadow: '0 25px 60px rgba(15, 23, 42, 0.25)', position: 'relative',
              animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            <button
              type="button"
              aria-label="새 여행 만들기 창 닫기"
              title="닫기"
              onClick={cancelCreateTrip}
              style={{ position: 'absolute', top: '20px', right: '20px', border: 'none', background: '#f1f5f9', width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>

            <div style={{ paddingRight: '44px', marginBottom: '24px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 9px', borderRadius: '999px', backgroundColor: '#f5f3ff', color: '#7c3aed', fontSize: '11px', fontWeight: '900', marginBottom: '10px' }}>
                <PlusCircle size={14} /> 새 여행
              </div>
              <h2 id="create-trip-modal-title" style={{ margin: 0, color: '#0f172a', fontSize: '22px', fontWeight: '900', letterSpacing: '-0.04em' }}>여행 기본 정보</h2>
              <p style={{ margin: '7px 0 0', color: '#64748b', fontSize: '12px', lineHeight: 1.5 }}>일정을 추가하기 전에 여행 이름과 기간을 입력해주세요.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <span style={{ color: '#475569', fontSize: '11px', fontWeight: '900' }}>여행 이름 <span style={{ color: '#ef4444' }}>*</span></span>
                <input
                  autoFocus
                  type="text"
                  value={createTripData.name}
                  onChange={(event) => { setCreateTripData({ ...createTripData, name: event.target.value }); setCreateTripError(''); }}
                  placeholder="예: 나트랑 4박 5일 여행"
                  maxLength={80}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', border: '1px solid #e2e8f0', borderRadius: '13px', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '14px', fontWeight: '700', outline: 'none' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <span style={{ color: '#475569', fontSize: '11px', fontWeight: '900' }}>여행 국가 <span style={{ color: '#94a3b8', fontWeight: '700' }}>(선택)</span></span>
                <select
                  value={createTripData.country}
                  onChange={(event) => setCreateTripData({ ...createTripData, country: event.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', border: '1px solid #e2e8f0', borderRadius: '13px', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '14px', fontWeight: '700', outline: 'none' }}
                >
                  <option value="">나라를 선택해주세요</option>
                  {Object.keys(countryToCurrency).map((countryName) => (
                    <option key={`create-trip-country-${countryName}`} value={countryName}>{countryName}</option>
                  ))}
                </select>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  <span style={{ color: '#475569', fontSize: '11px', fontWeight: '900' }}>시작일 <span style={{ color: '#ef4444' }}>*</span></span>
                  <input
                    type="date"
                    value={createTripData.startDate}
                    onChange={(event) => setCreateTripData({ ...createTripData, startDate: event.target.value })}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '13px 10px', border: '1px solid #e2e8f0', borderRadius: '13px', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '13px', fontWeight: '700', outline: 'none' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  <span style={{ color: '#475569', fontSize: '11px', fontWeight: '900' }}>종료일 <span style={{ color: '#ef4444' }}>*</span></span>
                  <input
                    type="date"
                    value={createTripData.endDate}
                    onChange={(event) => setCreateTripData({ ...createTripData, endDate: event.target.value })}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '13px 10px', border: '1px solid #e2e8f0', borderRadius: '13px', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '13px', fontWeight: '700', outline: 'none' }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', borderRadius: '13px', backgroundColor: createTripDayCount > 0 ? '#eff6ff' : '#f8fafc', color: createTripDayCount > 0 ? '#2563eb' : '#94a3b8', fontSize: '12px', fontWeight: '800' }}>
                <span>생성될 일정</span>
                <strong>{createTripDayCount > 0 ? `${createTripDayCount}일차` : '날짜를 확인해주세요'}</strong>
              </div>
            </div>

            {createTripError && (
              <p role="alert" style={{ margin: '14px 0 0', padding: '10px 12px', borderRadius: '11px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '12px', fontWeight: '800', lineHeight: 1.45 }}>{createTripError}</p>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button
                type="button"
                onClick={cancelCreateTrip}
                style={{ flex: 1, padding: '14px', border: '1px solid #e2e8f0', borderRadius: '14px', backgroundColor: 'white', color: '#64748b', fontSize: '14px', fontWeight: '900', cursor: 'pointer' }}
              >
                취소
              </button>
              <button
                type="submit"
                style={{ flex: 1.6, padding: '14px', border: 'none', borderRadius: '14px', backgroundColor: '#8b5cf6', color: 'white', fontSize: '14px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 10px 20px rgba(139, 92, 246, 0.22)' }}
              >
                여행 만들기
              </button>
            </div>
          </form>
        </div>
      )}

      {showJoinTripModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-trip-modal-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancelJoinTrip();
          }}
          style={{
            position: 'fixed', inset: 0, zIndex: 13000,
            backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px', animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <form
            onSubmit={(event) => { event.preventDefault(); joinSharedTrip(); }}
            style={{
              backgroundColor: 'white', borderRadius: '28px', width: '100%', maxWidth: '420px',
              padding: '28px 24px', boxShadow: '0 25px 60px rgba(15, 23, 42, 0.25)',
              position: 'relative', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            <button
              type="button"
              aria-label="참여하기 창 닫기"
              title="닫기"
              onClick={cancelJoinTrip}
              disabled={isJoiningTrip}
              style={{ position: 'absolute', top: '20px', right: '20px', border: 'none', background: '#f1f5f9', width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: isJoiningTrip ? 'not-allowed' : 'pointer', opacity: isJoiningTrip ? 0.5 : 1 }}
            >
              <X size={18} />
            </button>

            <div style={{ paddingRight: '44px', marginBottom: '22px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 9px', borderRadius: '999px', backgroundColor: '#ecfdf5', color: '#059669', fontSize: '11px', fontWeight: '900', marginBottom: '10px' }}>
                <Users size={14} /> 공유 일정
              </div>
              <h2 id="join-trip-modal-title" style={{ margin: 0, color: '#0f172a', fontSize: '22px', fontWeight: '900', letterSpacing: '-0.04em' }}>여행에 참여하기</h2>
              <p style={{ margin: '7px 0 0', color: '#64748b', fontSize: '12px', lineHeight: 1.5 }}>친구에게 받은 공유 코드를 입력하면 여행 일정이 내 목록에 추가됩니다.</p>
            </div>

            <label htmlFor="join-trip-code" style={{ display: 'block', color: '#475569', fontSize: '11px', fontWeight: '900', marginBottom: '8px' }}>공유 코드</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
              <input
                id="join-trip-code"
                autoFocus
                type="text"
                value={joinTripCode}
                onChange={(event) => { setJoinTripCode(event.target.value); setJoinTripError(''); }}
                placeholder="공유 코드를 붙여넣어 주세요"
                autoComplete="off"
                spellCheck="false"
                disabled={isJoiningTrip}
                style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '13px 14px', border: '1px solid #d1fae5', borderRadius: '13px', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '14px', fontWeight: '700', outline: 'none' }}
              />
              <button
                type="button"
                onClick={pasteJoinTripCode}
                disabled={isJoiningTrip}
                aria-label="클립보드에서 공유 코드 붙여넣기"
                title="클립보드에서 붙여넣기"
                style={{ flexShrink: 0, width: '48px', border: '1px solid #d1fae5', borderRadius: '13px', backgroundColor: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isJoiningTrip ? 'not-allowed' : 'pointer', opacity: isJoiningTrip ? 0.5 : 1 }}
              >
                <Clipboard size={18} />
              </button>
            </div>

            {joinTripError && (
              <p role="alert" style={{ margin: '12px 0 0', padding: '10px 12px', borderRadius: '11px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '12px', fontWeight: '800', lineHeight: 1.45 }}>{joinTripError}</p>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button
                type="button"
                onClick={cancelJoinTrip}
                disabled={isJoiningTrip}
                style={{ flex: 1, padding: '14px', border: '1px solid #e2e8f0', borderRadius: '14px', backgroundColor: 'white', color: '#64748b', fontSize: '14px', fontWeight: '900', cursor: isJoiningTrip ? 'not-allowed' : 'pointer', opacity: isJoiningTrip ? 0.5 : 1 }}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isJoiningTrip}
                style={{ flex: 1.6, padding: '14px', border: 'none', borderRadius: '14px', backgroundColor: '#059669', color: 'white', fontSize: '14px', fontWeight: '900', cursor: isJoiningTrip ? 'wait' : 'pointer', boxShadow: '0 10px 20px rgba(5, 150, 105, 0.2)', opacity: isJoiningTrip ? 0.7 : 1 }}
              >
                {isJoiningTrip ? '참여 중...' : '일정에 참여하기'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showOnboarding && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 12000, backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '420px', backgroundColor: 'white', borderRadius: '28px', padding: '28px', boxShadow: '0 24px 80px rgba(15,23,42,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '14px', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plane size={22} /></div>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: '#0f172a' }}>여행을 시작해볼까요?</h2>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b', fontWeight: '700' }}>3단계로 간단하게 일정을 만들 수 있어요.</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '24px 0' }}>
              {[['여행 만들기', '여행 이름과 날짜를 정해요.'], ['장소 검색', '지도에서 장소나 주소를 검색해요.'], ['일정 추가', '시간과 표시 이름을 정해 일정에 넣어요.']].map(([title, description], index) => (
                <div key={title} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '14px', backgroundColor: onboardingStep === index ? '#eff6ff' : '#f8fafc', border: onboardingStep === index ? '1px solid #bfdbfe' : '1px solid transparent' }}>
                  <div style={{ width: '30px', height: '30px', flexShrink: 0, borderRadius: '50%', backgroundColor: onboardingStep >= index ? '#2563eb' : '#e2e8f0', color: onboardingStep >= index ? 'white' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '900' }}>{index + 1}</div>
                  <div><strong style={{ display: 'block', fontSize: '13px', color: '#1e293b' }}>{title}</strong><span style={{ fontSize: '11px', color: '#64748b' }}>{description}</span></div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={dismissOnboarding} style={{ flex: 1, padding: '13px', border: 'none', borderRadius: '14px', backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>나중에</button>
              <button type="button" onClick={handleOnboardingAction} style={{ flex: 1.5, padding: '13px', border: 'none', borderRadius: '14px', backgroundColor: '#2563eb', color: 'white', fontSize: '13px', fontWeight: '900', cursor: 'pointer' }}>{onboardingStep === 0 ? '여행 만들기' : onboardingStep === 1 ? '장소 검색하기' : '시작하기'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MAP VIEWPORT */}
      <div className="map-wrapper">
        {/* MAP CONTROLS (TOP-RIGHT) */}
        <div className="map-controls-group">
          {/* Full Route Toggle */}
          <button 
            onClick={() => setShowFullRoute(!showFullRoute)} 
            style={{ 
              width: '56px', height: '56px', 
              backgroundColor: showFullRoute ? '#4f46e5' : 'white', 
              borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
              cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', 
              color: showFullRoute ? 'white' : '#4f46e5',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            aria-label={showFullRoute ? "일차별 경로 보기" : "전체 경로 보기"} title={showFullRoute ? "일차별 경로 보기" : "전체 경로 보기"}
          >
            <Navigation size={24} style={{ transform: showFullRoute ? 'rotate(45deg)' : 'none', transition: 'transform 0.3s' }} />
          </button>

          {/* My Location Button */}
          <button 
            onClick={handleMyLocation} 
            style={{ 
              width: '56px', height: '56px', 
              backgroundColor: 'white', 
              borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
              cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', 
              color: '#10b981',
              transition: 'all 0.2s'
            }}
            aria-label="내 현재 위치 찾기" title="내 현재 위치 찾기"
          >
            <LocateFixed size={24} />
          </button>
        </div>

        {/* SIDEBAR TOGGLE (ONLY WHEN CLOSED) */}
        {!sidebarOpen && (
          <div className="sidebar-toggle-btn">
            <button aria-label="메뉴 열기" title="메뉴 열기" onClick={() => setSidebarOpen(true)} style={{ width: '56px', height: '56px', backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
              <Menu size={24} />
            </button>
          </div>
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
            <CustomMapMarker
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

          {/* User Current Location Marker */}
          {userLocation && (
            <CustomMapMarker
              position={userLocation}
              icon={{
                url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="8" fill="#3b82f6" stroke="white" stroke-width="2"/>
                    <circle cx="12" cy="12" r="11" stroke="#3b82f6" stroke-opacity="0.3" stroke-width="2">
                      <animate attributeName="r" from="8" to="11" dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="stroke-opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                  </svg>
                `)}`,
                scaledSize: new window.google.maps.Size(24, 24),
                anchor: new window.google.maps.Point(12, 12)
              }}
            />
          )}

          {/* Route Path (Polyline) */}
          {window.google && !showFullRoute && polylinePath.length > 0 && (
            <Polyline
              key={`route-polyline-${activeDay}`}
              path={polylinePath}
              options={{
                strokeColor: '#3b82f6',
                strokeOpacity: 0.8,
                strokeWeight: 4,
                icons: [{ icon: { path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, fillOpacity: 1, strokeColor: '#3b82f6' }, offset: '50%', repeat: '100px' }],
              }}
            />
          )}

          {/* --- FULL TRIP ROUTE RENDERING --- */}
          {window.google && showFullRoute && (
            <>
              {/* 1. Inter-day Connections (Dashed) */}
              {interDayPaths.map((path, idx) => (
                <Polyline
                  key={`inter-day-${idx}`}
                  path={path}
                  options={{
                    strokeColor: '#94a3b8',
                    strokeOpacity: 0.4,
                    strokeWeight: 2,
                    icons: [{
                      icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.6, scale: 3 },
                      offset: '0',
                      repeat: '15px'
                    }],
                  }}
                />
              ))}

              {/* 2. Daily Routes (Solid with Arrows) */}
              {fullTripPaths.map((path, idx) => (
                <Polyline
                  key={`full-route-day-${idx}`}
                  path={path}
                  options={{
                    strokeColor: dayColors[idx % dayColors.length],
                    strokeOpacity: 0.8,
                    strokeWeight: 5,
                    icons: [{ 
                      icon: { 
                        path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW, 
                        scale: 3, 
                        fillOpacity: 1, 
                        strokeColor: dayColors[idx % dayColors.length] 
                      }, 
                      offset: '50%', 
                      repeat: '100px' 
                    }],
                  }}
                />
              ))}

              {/* 3. Day Markers (Labels for the start of each day) */}
              {fullTripPaths.map((path, idx) => (
                <CustomMapMarker
                  key={`day-label-${idx}`}
                  position={path[0]}
                  label={{
                    text: `${idx + 1}일차`,
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: '900'
                  }}
                  icon={{
                    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                      <svg width="60" height="30" viewBox="0 0 60 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect width="60" height="24" rx="12" fill="${dayColors[idx % dayColors.length]}" />
                        <path d="M30 30L26 24H34L30 30Z" fill="${dayColors[idx % dayColors.length]}" />
                      </svg>
                    `)}`,
                    scaledSize: new window.google.maps.Size(60, 30),
                    anchor: new window.google.maps.Point(30, 30)
                  }}
                />
              ))}
            </>
          )}

          {/* Itinerary Markers */}
          {!showFullRoute && (
            <React.Fragment key={`markers-daily-${activeDay}`}>
              {(() => {
                const targetDay = parseDay(activeDay);
                const dayPlan = (itinerary || []).find(d => parseDay(d.day) === targetDay);
                return (dayPlan?.items || [])
                  .filter(item => item.lat && item.lng)
                  .map((item, idx) => (
                  <CustomMapMarker
                    key={`itin-mark-${activeDay}-${item.id}`}
                    position={{ lat: Number(item.lat), lng: Number(item.lng) }}
                    label={{ text: `${idx + 1}`, color: 'white', fontSize: '14px', fontWeight: '900' }}
                    onClick={() => setSelectedPlace(item)}
                    icon={{
                      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="20" cy="20" r="16" fill="#3b82f6" stroke="white" stroke-width="3"/>
                        </svg>
                      `)}`,
                      scaledSize: new window.google.maps.Size(40, 40), anchor: new window.google.maps.Point(20, 20)
                    }}
                  />
                ));
              })()}
            </React.Fragment>
          )}

          {/* Reserve markers: numbered only, without a route or directional arrows. */}
          {!showFullRoute && activeDay === 'reserve' && (
            <React.Fragment key="markers-reserve">
              {reserveItems
                .filter(item => item.lat && item.lng)
                .map((item, idx) => (
                  <CustomMapMarker
                    key={`reserve-mark-${item.id}`}
                    position={{ lat: Number(item.lat), lng: Number(item.lng) }}
                    label={{ text: `${idx + 1}`, color: 'white', fontSize: '14px', fontWeight: '900' }}
                    onClick={() => setSelectedPlace(item)}
                    icon={{
                      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="20" cy="20" r="16" fill="#f59e0b" stroke="white" stroke-width="3"/>
                        </svg>
                      `)}`,
                      scaledSize: new window.google.maps.Size(40, 40), anchor: new window.google.maps.Point(20, 20)
                    }}
                  />
                ))}
            </React.Fragment>
          )}

          {showFullRoute && itinerary.map((day, dIdx) => (
            <React.Fragment key={`markers-full-${dIdx}`}>
              {(day.items || [])
                .filter(item => item.lat && item.lng)
                .map((item, idx) => (
                  <CustomMapMarker
                    key={`full-itin-mark-${dIdx}-${item.id}`}
                    position={{ lat: Number(item.lat), lng: Number(item.lng) }}
                    label={{ text: `${day.day}-${idx + 1}`, color: 'white', fontSize: '11px', fontWeight: '800' }}
                    onClick={() => setSelectedPlace(item)}
                    icon={{
                      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                        <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="17" cy="17" r="14" fill="${getDayColor(dIdx)}" stroke="white" stroke-width="2"/>
                        </svg>
                      `)}`,
                      scaledSize: new window.google.maps.Size(34, 34), anchor: new window.google.maps.Point(17, 17)
                    }}
                  />
              ))}
            </React.Fragment>
          ))}

          {/* Dynamic Search Result Marker */}
          {searchResult && searchResult.name !== selectedPlace?.name && (
             <CustomMapMarker
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
          {!useFloatingPlacePanel && selectedPlace && windowSize.width >= 768 && (
            <InfoWindow position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }} options={{ disableAutoPan: true }} onCloseClick={() => setSelectedPlace(null)}>
              <div className="place-info-window-content" style={{ padding: window.innerWidth < 768 ? '8px 12px' : '20px', minWidth: window.innerWidth < 768 ? '250px' : '300px', maxWidth: '340px', fontFamily: '"Inter", "Roboto", sans-serif' }}>
                {/* TOP SECTION: Place Info & Favorite */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: window.innerWidth < 768 ? '10px' : '16px', marginBottom: window.innerWidth < 768 ? '8px' : '16px' }}>
                  <div style={{ width: window.innerWidth < 768 ? '40px' : '56px', height: window.innerWidth < 768 ? '40px' : '56px', backgroundColor: '#f9fafb', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: window.innerWidth < 768 ? '20px' : '32px', border: '1px solid #f3f4f6', flexShrink: 0 }}>
                    {selectedPlace.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                      <h3 style={{ fontSize: window.innerWidth < 768 ? '15px' : '18px', fontWeight: '900', margin: '0 0 1px 0', color: '#111827', lineHeight: 1.2, flex: 1 }}>{selectedPlace.name}</h3>
                      <button 
                        onClick={() => toggleFavorite(selectedPlace)} 
                        style={{ 
                          padding: '5px', 
                          borderRadius: '8px', 
                          border: 'none',
                          backgroundColor: isFavorite(selectedPlace) ? '#fee2e2' : '#f1f5f9', 
                          color: isFavorite(selectedPlace) ? '#ef4444' : '#9ca3af', 
                          cursor: 'pointer', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      >
                        <Heart size={window.innerWidth < 768 ? 16 : 22} fill={isFavorite(selectedPlace) ? "currentColor" : "none"} />
                      </button>
                    </div>
                    <p style={{ fontSize: '9px', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, display: 'flex', alignItems: 'flex-start', gap: '4px', lineHeight: 1.2 }}>
                      <MapPin size={9} color="#3b82f6" style={{ marginTop: '1px', flexShrink: 0 }} /> 
                      <span style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{selectedPlace.loc}</span>
                    </p>
                  </div>
                </div>

                <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: window.innerWidth < 768 ? '8px 0' : '16px 0' }} />

                {/* BOTTOM SECTION: Add to Itinerary */}
                {activeTripId && (
                  <div style={{ backgroundColor: '#f8fafc', padding: window.innerWidth < 768 ? '10px' : '16px', borderRadius: '14px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '9px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>일차 선택</div>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '2px' }}>
                      <button
                        type="button"
                        onClick={() => setActiveDay('reserve')}
                        style={{ flex: '0 0 auto', minWidth: '74px', padding: '8px 6px', borderRadius: '10px', border: '1px solid', borderColor: activeDay === 'reserve' ? '#f59e0b' : '#e2e8f0', backgroundColor: activeDay === 'reserve' ? '#fffbeb' : 'white', color: activeDay === 'reserve' ? '#d97706' : '#64748b', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}
                      >
                        예비 목록
                      </button>
                      {(itinerary || []).map((dayPlan, dayIndex) => {
                        const day = parseDay(dayPlan?.day) || dayIndex + 1;
                        return (
                        <button
                          key={day}
                          onClick={() => setActiveDay(day)}
                          style={{
                            flex: '0 0 auto',
                            minWidth: '58px',
                            padding: '8px 0',
                            borderRadius: '10px',
                            border: '1px solid',
                            borderColor: activeDay === day ? '#2563eb' : '#e2e8f0',
                            backgroundColor: activeDay === day ? '#eff6ff' : 'white',
                            color: activeDay === day ? '#2563eb' : '#64748b',
                            fontSize: '11px',
                            fontWeight: '900',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          {day}일차
                        </button>
                        );
                      })}
                    </div>

                    <div style={{ marginBottom: "12px" }}>
                      <label style={{ display: "block", fontSize: "9px", fontWeight: "900", color: "#9ca3af", textTransform: "uppercase", marginBottom: "6px", letterSpacing: "0.05em" }}>
                        일정 표시 이름 (선택)
                      </label>
                      <input
                        type="text"
                        value={itineraryDisplayName}
                        onChange={(e) => setItineraryDisplayName(e.target.value)}
                        placeholder={selectedPlace.name || "예: 호텔 체크인"}
                        maxLength={80}
                        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "12px", fontWeight: "700", outline: "none" }}
                      />
                      <p style={{ margin: "5px 0 0", fontSize: "10px", color: "#94a3b8" }}>
                        입력하지 않으면 검색된 장소명이 일정에 표시됩니다.
                      </p>
                    </div>

                    <PremiumTimeInput 
                      label="도착 시간"
                      value={itineraryTime || '09:00'} 
                      onChange={(val) => setItineraryTime(val)} 
                    />
                    
                    <button 
                      className="place-info-window-add-button"
                      onClick={() => {
                        if (!activeDay) {
                          setModalConfig({ 
                            type: 'error', 
                            title: '추가 위치 미선택',
                            message: '일차 또는 예비 목록을 먼저 선택해주세요.'
                          });
                          setShowCustomModal(true);
                          return;
                        }
                        addToItinerary(selectedPlace);
                      }} 
                      style={{ 
                        width: '100%', 
                        padding: window.innerWidth < 768 ? '8px' : '14px', 
                        backgroundColor: activeDay ? '#2563eb' : '#94a3b8', 
                        color: 'white', 
                        borderRadius: '10px', 
                        fontSize: '11px', 
                        fontWeight: '900', 
                        border: 'none', 
                        cursor: activeDay ? 'pointer' : 'not-allowed', 
                        boxShadow: activeDay ? '0 4px 12px rgba(37, 99, 235, 0.2)' : 'none', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '4px',
                        transition: 'all 0.2s',
                        opacity: activeDay ? 1 : 0.7
                      }}
                    >
                      <PlusCircle size={14} /> 
                      {activeDay === 'reserve' ? '예비 목록에 추가' : activeDay ? `${activeDay}일차 일정에 추가` : '일차 또는 예비 목록을 선택해주세요'}
                    </button>
                  </div>
                )}
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>

      {selectedPlace && (
        <div className="mobile-place-add-overlay" role="dialog" aria-modal="true" aria-label="장소를 일정에 추가">
          <div
            className="mobile-place-add-panel"
            onPointerDown={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
          >
            <div className="mobile-place-add-handle" aria-hidden="true" />
            <div className="mobile-place-add-content">
              <div className="mobile-place-add-header">
                <div className="mobile-place-add-header-main">
                  <div className="mobile-place-add-place-icon">
                    {selectedPlace.emoji}
                  </div>
                  <div className="mobile-place-add-place-info">
                    <h3>
                      {selectedPlace.name}
                    </h3>
                    <p>
                    <MapPin size={10} color="#3b82f6" style={{ marginTop: '1px', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{selectedPlace.loc}</span>
                    </p>
                  </div>
                </div>
                <div className="mobile-place-add-header-actions">
                  <button
                    type="button"
                    className="mobile-place-add-favorite"
                    onClick={() => toggleFavorite(selectedPlace)}
                    aria-label="즐겨찾기"
                    style={{ backgroundColor: isFavorite(selectedPlace) ? '#fee2e2' : '#f1f5f9', color: isFavorite(selectedPlace) ? '#ef4444' : '#9ca3af' }}
                  >
                    <Heart size={16} fill={isFavorite(selectedPlace) ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    type="button"
                    className="mobile-place-add-close"
                    onClick={() => setSelectedPlace(null)}
                    aria-label="장소 추가 창 닫기"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {activeTripId && (
                <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '14px', border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '10px', fontWeight: '900', color: '#64748b', marginBottom: '8px' }}>일차 선택</div>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '2px' }}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setActiveDay('reserve');
                      }}
                      style={{ flex: '0 0 auto', minWidth: '74px', padding: '8px 6px', borderRadius: '10px', border: '1px solid', borderColor: activeDay === 'reserve' ? '#f59e0b' : '#e2e8f0', backgroundColor: activeDay === 'reserve' ? '#fffbeb' : 'white', color: activeDay === 'reserve' ? '#d97706' : '#64748b', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}
                    >
                      예비 목록
                    </button>
                    {(itinerary || []).map((dayPlan, dayIndex) => {
                      const day = parseDay(dayPlan?.day) || dayIndex + 1;
                      return (
                        <button
                          type="button"
                          key={day}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setActiveDay(day);
                          }}
                          style={{ flex: '0 0 auto', minWidth: '58px', padding: '8px 0', borderRadius: '10px', border: '1px solid', borderColor: activeDay === day ? '#2563eb' : '#e2e8f0', backgroundColor: activeDay === day ? '#eff6ff' : 'white', color: activeDay === day ? '#2563eb' : '#64748b', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}
                        >
                          {day}일차
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '9px', fontWeight: '900', color: '#64748b', marginBottom: '6px' }}>
                      일정 표시 이름 (선택)
                    </label>
                    <input
                      type="text"
                      value={itineraryDisplayName}
                      onChange={(e) => setItineraryDisplayName(e.target.value)}
                      placeholder={selectedPlace.name || '예: 호텔 체크인'}
                      maxLength={80}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: '700', outline: 'none' }}
                    />
                    <p style={{ margin: '5px 0 0', fontSize: '10px', color: '#94a3b8', lineHeight: 1.35 }}>
                      입력하지 않으면 검색된 장소명이 일정에 표시됩니다.
                    </p>
                  </div>

                  <PremiumTimeInput
                    label="도착 시간"
                    value={itineraryTime || '09:00'}
                    onChange={(val) => setItineraryTime(val)}
                  />

                  <button
                    type="button"
                    className="mobile-place-add-button"
                    onClick={() => {
                      if (!activeDay) {
                        setModalConfig({
                          type: 'error',
                          title: '추가 위치 미선택',
                          message: '일차 또는 예비 목록을 먼저 선택해주세요.'
                        });
                        setShowCustomModal(true);
                        return;
                      }
                      addToItinerary(selectedPlace);
                      setSelectedPlace(null);
                    }}
                    style={{ width: '100%', minHeight: '44px', marginTop: '10px', padding: '10px', backgroundColor: activeDay ? '#2563eb' : '#94a3b8', color: 'white', borderRadius: '10px', fontSize: '12px', fontWeight: '900', border: 'none', cursor: activeDay ? 'pointer' : 'not-allowed', boxShadow: activeDay ? '0 4px 12px rgba(37, 99, 235, 0.2)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', opacity: activeDay ? 1 : 0.7 }}
                  >
                    <PlusCircle size={16} />
                    {activeDay === 'reserve' ? '예비 목록에 추가' : activeDay ? activeDay + '일차 일정에 추가' : '일차 또는 예비 목록을 선택해주세요'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
          <Menu size={16} /> 메뉴 열기
        </button>
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
              type="button"
              aria-label="일정 수정 창 닫기"
              title="일정 수정 창 닫기"
              onClick={() => setEditingTimeItem(null)}
              style={{ position: 'absolute', top: '20px', right: '20px', border: 'none', background: '#f1f5f9', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', fontWeight: '900', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>일정 편집</div>
              <h3 style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editingTimeItem.originalName || '일정 수정'}</h3>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "10px", fontWeight: "900", color: "#64748b", marginBottom: "8px" }}>일정 위치</label>
              <select
                value={editingTimeItem.day}
                onChange={(e) => setEditingTimeItem({ ...editingTimeItem, day: e.target.value === 'reserve' ? 'reserve' : Number(e.target.value) })}
                style={{ width: "100%", boxSizing: "border-box", padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0", backgroundColor: "white", fontSize: "14px", fontWeight: "700", outline: "none" }}
              >
                <option value="reserve">예비 목록</option>
                {itinerary.map(dayPlan => (
                  <option key={dayPlan.day} value={parseDay(dayPlan.day)}>{parseDay(dayPlan.day)}일차</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "10px", fontWeight: "900", color: "#64748b", marginBottom: "8px" }}>일정 표시 이름</label>
              <input
                type="text"
                value={editingTimeItem.displayName}
                onChange={(e) => setEditingTimeItem({ ...editingTimeItem, displayName: e.target.value })}
                placeholder={editingTimeItem.originalName || "장소 이름"}
                maxLength={80}
                style={{ width: "100%", boxSizing: "border-box", padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "14px", fontWeight: "700", outline: "none" }}
              />
            </div>

            <ScrollTimeInput
              value={editingTimeItem.time}
              onChange={(newTime) => setEditingTimeItem({ ...editingTimeItem, time: newTime })}
              label="일정 시간 선택"
            />

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button 
                onClick={() => setEditingTimeItem(null)}
                style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0', backgroundColor: 'white', color: '#64748b', fontSize: '15px', fontWeight: '900', cursor: 'pointer' }}
              >
                취소
              </button>
              <button 
                onClick={() => {
                  updateItineraryItem(editingTimeItem.sourceDay, editingTimeItem.id, {
                    day: editingTimeItem.day,
                    time: editingTimeItem.time,
                    displayName: editingTimeItem.displayName.trim() || editingTimeItem.originalName
                  });
                  if (editingTimeItem.day === 'reserve') setActiveDay('reserve');
                  setEditingTimeItem(null);
                }}
                style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', backgroundColor: '#3b82f6', color: 'white', fontSize: '15px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.3)' }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {editingExpenseId && editingExpense && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px', animation: 'fadeIn 0.2s ease-out' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '32px', width: '100%', maxWidth: '420px', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', position: 'relative', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <button
              type="button"
              onClick={cancelEditingExpense}
              aria-label="지출 수정 창 닫기"
              style={{ position: 'absolute', top: '20px', right: '20px', border: 'none', background: '#f1f5f9', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>

            <div style={{ marginBottom: '22px', paddingRight: '42px' }}>
              <div style={{ fontSize: '12px', fontWeight: '900', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>지출 수정</div>
              <h3 style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editingExpense.desc || '지출 내역 수정'}</h3>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: '900', color: '#64748b', marginBottom: '8px' }}>소비 일자</label>
              <select
                value={expenseInput.day}
                onChange={(e) => setExpenseInput(current => ({ ...current, day: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: 'white', fontSize: '14px', fontWeight: '700', outline: 'none' }}
              >
                <option value={0}>여행 전 준비</option>
                {itinerary.map(dayPlan => {
                  const dayNumber = parseInt(dayPlan.day, 10);
                  const actualDate = activeTrip?.startDate ? getActualDateForDay(activeTrip.startDate, dayNumber) : '';
                  return <option key={`expense-edit-day-${dayNumber}`} value={dayNumber}>{dayNumber}일차{actualDate ? ` · ${actualDate}` : ''}</option>;
                })}
              </select>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: '900', color: '#64748b', marginBottom: '8px' }}>지출 내용</label>
              <input
                type="text"
                value={expenseInput.desc}
                onChange={(e) => setExpenseInput(current => ({ ...current, desc: e.target.value }))}
                placeholder="지출 내용"
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px', fontWeight: '700', outline: 'none' }}
              />
            </div>

            <div className="expense-edit-currency-payment-amount" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr 0.9fr', gap: '10px', marginBottom: '14px' }}>
              <div style={{ minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '900', color: '#64748b', marginBottom: '8px' }}>사용 통화</label>
                <select
                  value={expenseInput.currency || budgetSettings.travelCurrency}
                  onChange={(e) => setExpenseInput(current => ({ ...current, currency: e.target.value }))}
                  aria-label="지출 수정 통화"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: 'white', fontSize: '13px', fontWeight: '700', outline: 'none' }}
                >
                  {expenseCurrencyChoices.map(code => (
                    <option key={`expense-edit-currency-${code}`} value={code}>
                      {code === budgetSettings.travelCurrency ? '기본 · ' : ''}{getCurrencySymbol(code)} {getCurrencyNameKO(code)} ({code})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '900', color: '#64748b', marginBottom: '8px' }}>결제 수단</label>
                <select
                  value={expenseInput.paymentMethod}
                  onChange={(e) => setExpenseInput(current => ({ ...current, paymentMethod: e.target.value }))}
                  aria-label="지출 수정 결제 수단"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: 'white', fontSize: '13px', fontWeight: '700', outline: 'none' }}
                >
                  <option value="">결제 수단 선택</option>
                  {PAYMENT_METHODS.map(method => <option key={`expense-edit-payment-${method.value}`} value={method.value}>{method.label}</option>)}
                </select>
              </div>
              <div className="expense-edit-amount-field" style={{ minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '900', color: '#64748b', marginBottom: '8px' }}>금액 · {expenseCurrencySymbol} {expenseCurrencyCode}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%', boxSizing: 'border-box', padding: '0 12px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: 'white' }}>
                  <span aria-hidden="true" style={{ flexShrink: 0, fontSize: '15px', fontWeight: '900', color: '#64748b' }}>{expenseCurrencySymbol}</span>
                  <input
                    type="number"
                    value={expenseInput.amount}
                    onChange={(e) => setExpenseInput(current => ({ ...current, amount: e.target.value }))}
                    aria-label={`지출 금액(${expenseCurrencyCode})`}
                    style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '12px 0', border: 'none', backgroundColor: 'transparent', fontSize: '14px', fontWeight: '700', outline: 'none' }}
                  />
                </div>
              </div>
            </div>

            <ScrollTimeInput
              value={expenseInput.time}
              onChange={(newTime) => setExpenseInput(current => ({ ...current, time: newTime }))}
              label="소비 시간"
            />

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={cancelEditingExpense}
                style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0', backgroundColor: 'white', color: '#64748b', fontSize: '15px', fontWeight: '900', cursor: 'pointer' }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveExpenseEdit}
                disabled={!expenseFormIsValid}
                style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', backgroundColor: expenseFormIsValid ? '#10b981' : '#cbd5e1', color: 'white', fontSize: '15px', fontWeight: '900', cursor: expenseFormIsValid ? 'pointer' : 'not-allowed', boxShadow: expenseFormIsValid ? '0 10px 15px -3px rgba(16, 185, 129, 0.3)' : 'none' }}
              >
                저장
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
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      {/* Custom Modal (Success/Error) */}
      {showCustomModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 5000, padding: '20px', animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '32px', width: '100%', maxWidth: '360px',
            padding: '32px 24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            textAlign: 'center', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{
              width: '64px', height: '64px', 
              backgroundColor: modalConfig.type === 'success' ? '#f0fdf4' : '#fef2f2', 
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: modalConfig.type === 'success' ? '#22c55e' : '#ef4444', 
              margin: '0 auto 20px'
            }}>
              {modalConfig.type === 'success' ? <Check size={32} /> : <AlertCircle size={32} />}
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a', margin: '0 0 12px 0' }}>{modalConfig.title}</h3>
            <p style={{ fontSize: '15px', color: '#64748b', lineHeight: '1.6', margin: '0 0 32px 0', wordBreak: 'keep-all' }}>
              {modalConfig.message}
            </p>
            <button 
              onClick={() => setShowCustomModal(false)}
              style={{
                width: '100%', backgroundColor: modalConfig.type === 'success' ? '#0f172a' : '#ef4444', 
                color: 'white', border: 'none',
                padding: '16px', borderRadius: '16px', fontWeight: '800', fontSize: '15px',
                cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* JSON Paste Modal */}
      {showPasteModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 3000, padding: '20px', animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '32px', width: '100%', maxWidth: '480px',
            padding: '32px 24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            maxHeight: 'calc(100vh - 40px)',
            overflowY: 'auto'
          }}>
            <h3 style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a', margin: '0 0 8px 0' }}>일정 가져오기</h3>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 16px 0', lineHeight: 1.5 }}>LLM이 만들어 준 JSON 일정이나 직접 작성한 일정 JSON을 아래에 붙여넣어 주세요.</p>

            <div style={{ padding: '16px', marginBottom: '16px', borderRadius: '18px', backgroundColor: '#eff6ff', border: '1px solid #dbeafe' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                <div>
                  <strong style={{ display: 'block', color: '#1e40af', fontSize: '13px', marginBottom: '4px' }}>LLM용 예시 형식</strong>
                  <span style={{ display: 'block', color: '#64748b', fontSize: '11px', lineHeight: 1.5 }}>예시를 복사해 ChatGPT나 Gemini에 전달하면 같은 형식으로 일정을 만들 수 있어요.</span>
                </div>
                <button
                  type="button"
                  onClick={copyImportTemplate}
                  aria-label="LLM 일정 JSON 예시 복사"
                  title="LLM 일정 JSON 예시 복사"
                  style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '9px 10px', border: 'none', borderRadius: '10px', backgroundColor: '#2563eb', color: 'white', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}
                >
                  <Copy size={13} /> 예시 복사
                </button>
              </div>
              <pre style={{ maxHeight: '120px', overflow: 'auto', margin: 0, padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.8)', color: '#334155', fontSize: '10px', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{LLM_IMPORT_TEMPLATE}</pre>
            </div>

            <div style={{ padding: '14px 16px', marginBottom: '18px', borderRadius: '16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <strong style={{ display: 'block', color: '#334155', fontSize: '12px', marginBottom: '8px' }}>사용 방법</strong>
              <ol style={{ margin: 0, paddingLeft: '18px', color: '#64748b', fontSize: '11px', lineHeight: 1.65 }}>
                <li>위의 <b>예시 복사</b>를 눌러 JSON 형식을 복사합니다.</li>
                <li>LLM에 여행지, 날짜, 장소, 방문 시간을 알려주고 JSON 형식으로 작성해 달라고 요청합니다.</li>
                <li>LLM의 답변에서 JSON 코드만 복사해 아래 입력창에 붙여넣습니다.</li>
                <li>설명 문장이 아닌 <b>JSON만</b> 반환해 달라고 요청하면 가장 정확합니다.</li>
              </ol>
              <p style={{ margin: '9px 0 0', color: '#2563eb', fontSize: '11px', lineHeight: 1.5 }}>추천 문장: “아래 JSON 형식을 유지하고, 내 여행 일정에 맞는 값만 바꿔서 JSON 코드만 반환해줘.”</p>
            </div>
            
            <textarea 
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              aria-label="일정 JSON 붙여넣기"
              placeholder='{"name": "여행 제목", "itinerary": [{"day": 1, "items": []}]}'
              style={{
                width: '100%', height: '200px', padding: '16px', border: '1px solid #e2e8f0',
                borderRadius: '16px', fontSize: '13px', fontFamily: 'monospace',
                outline: 'none', resize: 'none', marginBottom: '24px', boxSizing: 'border-box',
                backgroundColor: '#f8fafc'
              }}
            />

            <button
              type="button"
              onClick={() => { setShowPasteModal(false); setPasteText(''); handleUploadJson(); }}
              style={{ width: '100%', marginBottom: '12px', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', backgroundColor: 'white', color: '#64748b', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}
            >
              <Upload size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} /> JSON 파일로 가져오기
            </button>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => { setShowPasteModal(false); setPasteText(''); }}
                style={{
                  flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none',
                  padding: '16px', borderRadius: '16px', fontWeight: '800', fontSize: '15px',
                  cursor: 'pointer'
                }}
              >
                취소
              </button>
              <button 
                onClick={handlePasteImport}
                style={{
                  flex: 2, backgroundColor: '#2563eb', color: 'white', border: 'none',
                  padding: '16px', borderRadius: '16px', fontWeight: '800', fontSize: '15px',
                  cursor: 'pointer'
                }}
              >
                일정 가져오기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
