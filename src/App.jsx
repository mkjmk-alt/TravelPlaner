// Build Version: v1.2.2-build-trigger-fix
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { GoogleMap, useJsApiLoader, OverlayView, InfoWindow, Polyline } from '@react-google-maps/api';
import { Heart, Search, Calendar, MapPin, Navigation, Star, PlusCircle, Trash2, AlertCircle, Wallet, ChevronRight, ChevronUp, ChevronDown, Plane, Menu, X, Compass, Plus, Edit2, Share2, Users, Copy, Check, Clock, Upload, Clipboard, LocateFixed, Download, Bell, FileText, Mail, Lock, Eye, EyeOff, WifiOff, Link2, LockKeyhole } from 'lucide-react';
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

const dataUrlToBlob = (dataUrl) => {
  const [header, encoded] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeMatch?.[1] || 'image/png' });
};

const saveBlobWithNativeBridge = (blob, fileName) => {
  const iosBridge = window.webkit?.messageHandlers?.travelPlanerDownload;
  const androidBridge = window.TravelPlanerAndroid;
  if (!iosBridge && !androidBridge?.saveBase64File) return false;

  const reader = new FileReader();
  reader.onloadend = () => {
    const payload = { fileName, dataUrl: String(reader.result || '') };
    if (iosBridge) iosBridge.postMessage(payload);
    else androidBridge.saveBase64File(payload.fileName, payload.dataUrl);
  };
  reader.readAsDataURL(blob);
  return true;
};

const saveBlobAsFile = (blob, fileName) => {
  if (saveBlobWithNativeBridge(blob, fileName)) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const isNativeShell = () => Boolean(
  window.webkit?.messageHandlers?.travelPlanerAuth || window.TravelPlanerAndroid?.openAuth
);

const openNativeAuthSession = (url) => {
  const iosBridge = window.webkit?.messageHandlers?.travelPlanerAuth;
  if (iosBridge) {
    iosBridge.postMessage(url);
    return true;
  }
  if (window.TravelPlanerAndroid?.openAuth) {
    window.TravelPlanerAndroid.openAuth(url);
    return true;
  }
  return false;
};

const ONBOARDING_STORAGE_KEY = 'travelplaner_onboarding_seen_v1';
const SYNC_CONFLICT_DISMISSED_STORAGE_PREFIX = 'travelplaner_sync_conflict_dismissed_v1';
const ACCOUNT_DELETE_PENDING_STORAGE_KEY = 'travelplaner_account_delete_pending_v1';

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

const getTripStatusMeta = (trip) => {
  const startDate = trip?.startDate || '';
  const endDate = trip?.endDate || startDate;

  if (!startDate || !endDate) {
    return {
      key: 'unknown',
      label: '날짜 미정',
      backgroundColor: '#f8fafc',
      color: '#64748b'
    };
  }

  const today = formatLocalDate(new Date());
  if (today < startDate) {
    return {
      key: 'upcoming',
      label: '다가오는 여행',
      backgroundColor: '#eff6ff',
      color: '#2563eb'
    };
  }
  if (today > endDate) {
    return {
      key: 'past',
      label: '지난 여행',
      backgroundColor: '#f1f5f9',
      color: '#64748b'
    };
  }
  return {
    key: 'ongoing',
    label: '여행 중',
    backgroundColor: '#ecfdf5',
    color: '#059669'
  };
};

const getOpeningHours = (place) => {
  const openingHours = place?.openingHours || place?.opening_hours || place?.regularOpeningHours;
  if (Array.isArray(openingHours)) return openingHours;
  return openingHours?.weekday_text || openingHours?.weekdayDescriptions || [];
};

const getBusinessStatusLabel = (status) => {
  if (status === 'OPERATIONAL') return '영업 중';
  if (status === 'CLOSED_TEMPORARILY') return '임시 휴업';
  if (status === 'CLOSED_PERMANENTLY') return '영구 폐업';
  return '';
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

const getAddressComponentText = (component) => (
  getFormattableText(component?.longText)
  || getFormattableText(component?.long_name)
  || getFormattableText(component?.shortText)
  || getFormattableText(component?.short_name)
  || ''
);

const normalizeRegionLabel = (value) => String(value || '')
  .replace(/^\d{4,6}\s+/u, '')
  .trim();

const getPlaceAddressGrouping = (components) => {
  if (!Array.isArray(components)) return { country: '', region: '' };

  const findComponent = (types) => components.find(component => (
    Array.isArray(component?.types) && types.some(type => component.types.includes(type))
  ));

  const country = getAddressComponentText(findComponent(['country']));
  const region = normalizeRegionLabel(getAddressComponentText(findComponent([
    'locality',
    'postal_town',
    'administrative_area_level_2',
    'administrative_area_level_1'
  ])));

  return { country, region };
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
  const anchorX = Number(icon?.anchor?.x);
  const anchorY = Number(icon?.anchor?.y);
  const offsetX = Number.isFinite(anchorX) ? -anchorX : -width / 2;
  const offsetY = Number.isFinite(anchorY) ? -anchorY : -height / 2;

  return (
    <OverlayView
      position={position}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={() => ({ x: offsetX, y: offsetY })}
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
  "가나": "GHS",
  "가봉": "XAF",
  "가이아나": "GYD",
  "감비아": "GMD",
  "과테말라": "GTQ",
  "그레나다": "XCD",
  "그리스": "EUR",
  "기니": "GNF",
  "기니비사우": "XOF",
  "나미비아": "NAD",
  "나우루": "AUD",
  "나이지리아": "NGN",
  "남아프리카공화국": "ZAR",
  "남수단": "SSP",
  "네덜란드": "EUR",
  "네팔": "NPR",
  "노르웨이": "NOK",
  "뉴질랜드": "NZD",
  "니제르": "XOF",
  "니카라과": "NIO",
  "대한민국": "KRW",
  "덴마크": "DKK",
  "도미니카": "XCD",
  "도미니카공화국": "DOP",
  "독일": "EUR",
  "동티모르": "USD",
  "라오스": "LAK",
  "라트비아": "EUR",
  "러시아": "RUB",
  "레바논": "LBP",
  "레소토": "LSL",
  "루마니아": "RON",
  "룩셈부르크": "EUR",
  "르완다": "RWF",
  "리비아": "LYD",
  "라이베리아": "LRD",
  "리투아니아": "EUR",
  "리히텐슈타인": "CHF",
  "마다가스카르": "MGA",
  "마셜 제도": "USD",
  "마카오": "MOP",
  "말라위": "MWK",
  "말레이시아": "MYR",
  "말리": "XOF",
  "멕시코": "MXN",
  "모나코": "EUR",
  "모로코": "MAD",
  "모리셔스": "MUR",
  "모리타니": "MRU",
  "모잠비크": "MZN",
  "몬테네그로": "EUR",
  "몰도바": "MDL",
  "몰디브": "MVR",
  "몰타": "EUR",
  "몽골": "MNT",
  "미국": "USD",
  "미얀마": "MMK",
  "미크로네시아": "USD",
  "바누아투": "VUV",
  "바레인": "BHD",
  "바베이도스": "BBD",
  "바티칸 시국": "EUR",
  "바하마": "BSD",
  "방글라데시": "BDT",
  "베냉": "XOF",
  "베네수엘라": "VES",
  "베트남": "VND",
  "벨기에": "EUR",
  "벨라루스": "BYN",
  "벨리즈": "BZD",
  "보스니아 헤르체고비나": "BAM",
  "보츠와나": "BWP",
  "볼리비아": "BOB",
  "부룬디": "BIF",
  "부르키나파소": "XOF",
  "부탄": "BTN",
  "북마케도니아": "MKD",
  "북한": "KPW",
  "불가리아": "BGN",
  "브라질": "BRL",
  "브루나이": "BND",
  "사모아": "WST",
  "산마리노": "EUR",
  "사우디아라비아": "SAR",
  "상투메 프린시페": "STN",
  "세네갈": "XOF",
  "세르비아": "RSD",
  "세이셸": "SCR",
  "세인트루시아": "XCD",
  "세인트빈센트 그레나딘": "XCD",
  "세인트키츠 네비스": "XCD",
  "소말리아": "SOS",
  "솔로몬 제도": "SBD",
  "수단": "SDG",
  "수리남": "SRD",
  "스리랑카": "LKR",
  "스웨덴": "SEK",
  "스위스": "CHF",
  "스페인": "EUR",
  "슬로바키아": "EUR",
  "슬로베니아": "EUR",
  "시리아": "SYP",
  "시에라리온": "SLE",
  "싱가포르": "SGD",
  "아랍에미리트": "AED",
  "아르메니아": "AMD",
  "아르헨티나": "ARS",
  "아이슬란드": "ISK",
  "아이티": "HTG",
  "아일랜드": "EUR",
  "아제르바이잔": "AZN",
  "아프가니스탄": "AFN",
  "안도라": "EUR",
  "앤티가 바부다": "XCD",
  "알바니아": "ALL",
  "알제리": "DZD",
  "앙골라": "AOA",
  "에콰도르": "USD",
  "에리트레아": "ERN",
  "에스토니아": "EUR",
  "에스와티니": "SZL",
  "에티오피아": "ETB",
  "엘살바도르": "USD",
  "영국": "GBP",
  "예멘": "YER",
  "오만": "OMR",
  "오스트리아": "EUR",
  "온두라스": "HNL",
  "요르단": "JOD",
  "우간다": "UGX",
  "우루과이": "UYU",
  "우즈베키스탄": "UZS",
  "우크라이나": "UAH",
  "이라크": "IQD",
  "이란": "IRR",
  "이스라엘": "ILS",
  "이집트": "EGP",
  "이탈리아": "EUR",
  "인도": "INR",
  "인도네시아": "IDR",
  "일본": "JPY",
  "자메이카": "JMD",
  "잠비아": "ZMW",
  "적도 기니": "XAF",
  "조지아": "GEL",
  "중국": "CNY",
  "중앙아프리카공화국": "XAF",
  "지부티": "DJF",
  "짐바브웨": "ZWG",
  "차드": "XAF",
  "칠레": "CLP",
  "카메룬": "XAF",
  "카보베르데": "CVE",
  "카자흐스탄": "KZT",
  "카타르": "QAR",
  "캄보디아": "KHR",
  "캐나다": "CAD",
  "케냐": "KES",
  "코모로": "KMF",
  "코트디부아르": "XOF",
  "코스타리카": "CRC",
  "코소보": "EUR",
  "콜롬비아": "COP",
  "콩고 공화국": "XAF",
  "콩고 민주공화국": "CDF",
  "쿠바": "CUP",
  "쿠웨이트": "KWD",
  "크로아티아": "EUR",
  "키르기스스탄": "KGS",
  "키리바시": "AUD",
  "키프로스": "EUR",
  "타지키스탄": "TJS",
  "탄자니아": "TZS",
  "태국": "THB",
  "터키": "TRY",
  "토고": "XOF",
  "통가": "TOP",
  "투르크메니스탄": "TMT",
  "투발루": "AUD",
  "튀니지": "TND",
  "트리니다드 토바고": "TTD",
  "파나마": "PAB",
  "파라과이": "PYG",
  "파키스탄": "PKR",
  "파푸아뉴기니": "PGK",
  "팔라우": "USD",
  "팔레스타인": "ILS",
  "페루": "PEN",
  "포르투갈": "EUR",
  "폴란드": "PLN",
  "프랑스": "EUR",
  "피지": "FJD",
  "핀란드": "EUR",
  "필리핀": "PHP",
  "헝가리": "HUF",
  "호주": "AUD",
  "홍콩": "HKD",
  "괌/사이판": "USD",
  "대만": "TWD"
};

const CURRENCY_FAVORITES_STORAGE_KEY = 'world_pro_currency_favorites_v1';
const SUPPORTED_CURRENCY_CODES = Array.from(new Set(Object.values(countryToCurrency)));
const COUNTRY_OPTIONS = [
  '대한민국',
  ...Object.keys(countryToCurrency)
    .filter((country) => country !== '대한민국')
    .sort((a, b) => a.localeCompare(b, 'ko'))
];

const PAYMENT_METHODS = [
  { value: 'cash', label: '현금' },
  { value: 'card', label: '카드' },
  { value: 'transfer', label: '계좌이체' }
];

const EXPENSE_CATEGORIES = [
  { value: 'food', label: '식비', emoji: '🍽️' },
  { value: 'transport', label: '교통', emoji: '🚕' },
  { value: 'lodging', label: '숙박', emoji: '🛏️' },
  { value: 'flight', label: '항공', emoji: '✈️' },
  { value: 'sightseeing', label: '관광', emoji: '🎟️' },
  { value: 'shopping', label: '쇼핑', emoji: '🛍️' },
  { value: 'communication', label: '통신', emoji: '📶' },
  { value: 'insurance', label: '보험', emoji: '🛡️' },
  { value: 'other', label: '기타', emoji: '🧾' }
];

const DEFAULT_CHECKLIST_ITEMS = [
  { id: 'passport', label: '여권 및 신분증', checked: false },
  { id: 'insurance', label: '여행자 보험', checked: false },
  { id: 'charger', label: '충전기·보조배터리', checked: false },
  { id: 'cash', label: '환전·현금 준비', checked: false },
  { id: 'reservation', label: '예약·티켓 확인', checked: false }
];

const getDefaultChecklist = () => DEFAULT_CHECKLIST_ITEMS.map(item => ({ ...item }));

const getExpenseCategoryLabel = (category) => (
  EXPENSE_CATEGORIES.find(option => option.value === category)?.label || '기타'
);

const getExpenseCategoryEmoji = (category) => (
  EXPENSE_CATEGORIES.find(option => option.value === category)?.emoji || '🧾'
);

const getEffectiveExchangeRate = (currency, rates = {}, budgetSettings = {}) => {
  if (!currency || currency === 'KRW') return 1;
  const manualRate = Number(budgetSettings.exchangeRates?.[currency]?.krwPerUnit ?? budgetSettings.manualRates?.[currency]);
  if (Number.isFinite(manualRate) && manualRate > 0) return manualRate;
  const liveRate = Number(rates[currency]);
  return Number.isFinite(liveRate) && liveRate > 0 ? 1 / liveRate : 0;
};

const getCashWalletsFromSettings = (budgetSettings = {}) => {
  const normalizeActual = value => value === '' || value === null || value === undefined ? '' : Number(value) || 0;
  if (Array.isArray(budgetSettings.cashWallets)) {
    return budgetSettings.cashWallets.map((wallet, index) => ({
      id: wallet.id || `${wallet.currency || 'KRW'}-${index}`,
      name: wallet.name || `${wallet.currency || 'KRW'} 현금`,
      currency: wallet.currency || budgetSettings.travelCurrency || 'USD',
      initial: Number(wallet.initial) || 0,
      additional: Number(wallet.additional) || 0,
      actualRemaining: normalizeActual(wallet.actualRemaining)
    }));
  }

  return Object.entries(budgetSettings.cashLedgers || {}).map(([currency, ledger]) => ({
    id: currency,
    name: ledger?.name || `${currency} 현금`,
    currency,
    initial: Number(ledger?.initial) || 0,
    additional: Number(ledger?.additional) || 0,
    actualRemaining: normalizeActual(ledger?.actualRemaining)
  }));
};

const getSafeExternalUrl = (value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

const getTripUpdatedAt = (trip) => Number(trip?.updatedAt || trip?.createdAt || 0);

const sortSyncValue = (value) => {
  if (Array.isArray(value)) return value.map(sortSyncValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((sorted, key) => {
    sorted[key] = sortSyncValue(value[key]);
    return sorted;
  }, {});
};

const getComparableTrip = (trip) => {
  const comparableTrip = { ...(trip || {}) };
  // This is local bookkeeping and changes during every save. It is not trip content.
  delete comparableTrip.updatedAt;
  comparableTrip.reserveItems = Array.isArray(comparableTrip.reserveItems) ? comparableTrip.reserveItems : [];
  comparableTrip.checklist = Array.isArray(comparableTrip.checklist) ? comparableTrip.checklist : getDefaultChecklist();
  comparableTrip.expenses = Array.isArray(comparableTrip.expenses)
    ? comparableTrip.expenses.map(expense => ({
      ...expense,
      category: expense.category || 'other',
      memo: expense.memo || ''
    }))
    : [];
  return sortSyncValue(comparableTrip);
};

const areTripsEqual = (left, right) => {
  try {
    return JSON.stringify(getComparableTrip(left)) === JSON.stringify(getComparableTrip(right));
  } catch {
    return false;
  }
};

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

const TIME_PERIOD_OPTIONS = ['AM', 'PM'];

const ScrollTimeInput = ({ value, onChange, label, compact = false }) => {
  const timeValue = value && value.includes(':') ? value : '09:00';
  const [rawHour, rawMinute] = timeValue.split(':').map(Number);
  const hour24 = Number.isFinite(rawHour) ? Math.min(Math.max(rawHour, 0), 23) : 9;
  const minute = Number.isFinite(rawMinute) ? Math.min(Math.max(rawMinute, 0), 59) : 0;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef(null);
  const periodRef = useRef(null);
  const hourRef = useRef(null);
  const minuteRef = useRef(null);
  const ITEM_HEIGHT = 40;
  const hours = Array.from({ length: 12 }, (_, index) => index + 1);
  const minutes = Array.from({ length: 60 }, (_, index) => index);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleOutsidePointer = (event) => {
      if (!pickerRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => document.removeEventListener('pointerdown', handleOutsidePointer);
  }, [isOpen]);

  const scrollToValue = (ref, index, behavior = 'auto') => {
    if (!ref.current) return;
    ref.current.scrollTo({ top: index * ITEM_HEIGHT, behavior });
  };

  useEffect(() => {
    if (!isOpen) return;
    scrollToValue(periodRef, TIME_PERIOD_OPTIONS.indexOf(period));
    scrollToValue(hourRef, hour12 - 1);
    scrollToValue(minuteRef, minute);
  }, [isOpen, period, hour12, minute]);

  const emitTime = (nextPeriod, nextHour12, nextMinute) => {
    const normalizedHour = nextHour12 % 12 + (nextPeriod === 'PM' ? 12 : 0);
    const nextValue = `${String(normalizedHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
    if (nextValue !== timeValue) onChange(nextValue);
  };

  const handleScroll = (type, event) => {
    const index = Math.round(event.currentTarget.scrollTop / ITEM_HEIGHT);
    if (type === 'period') {
      emitTime(TIME_PERIOD_OPTIONS[Math.min(Math.max(index, 0), TIME_PERIOD_OPTIONS.length - 1)], hour12, minute);
    } else if (type === 'hour') {
      emitTime(period, Math.min(Math.max(index + 1, 1), 12), minute);
    } else {
      emitTime(period, hour12, Math.min(Math.max(index, 0), 59));
    }
  };

  const setNow = () => {
    const now = new Date();
    onChange(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  };

  const adjustMinutes = (amount) => {
    const totalMinutes = (hour24 * 60 + minute + amount + 1440) % 1440;
    onChange(`${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`);
  };

  const renderScrollColumn = (items, selectedValue, ref, type, formatItem = (item) => String(item).padStart(2, '0')) => (
    <div className="expense-time-picker-column" style={{ flex: type === 'period' ? '1.2 1 0' : '1 1 0', minWidth: 0 }}>
      <div
        className="expense-time-picker-wheel"
        ref={ref}
        onScroll={(event) => handleScroll(type, event)}
        role="listbox"
        aria-label={type === 'period' ? '오전 또는 오후 선택' : type === 'hour' ? '시간 선택' : '분 선택'}
        style={{ height: '132px', overflowY: 'auto', overscrollBehavior: 'contain', scrollSnapType: 'y mandatory', scrollbarWidth: 'none', borderRadius: '14px', backgroundColor: '#f8fafc', WebkitOverflowScrolling: 'touch' }}
      >
        <div style={{ padding: `${ITEM_HEIGHT}px 0` }}>
          {items.map(item => (
            <button
              key={`${type}-${item}`}
              type="button"
              role="option"
              aria-selected={item === selectedValue}
              onClick={() => {
                if (type === 'period') emitTime(item, hour12, minute);
                if (type === 'hour') emitTime(period, item, minute);
                if (type === 'minute') emitTime(period, hour12, item);
              }}
              style={{ display: 'block', width: '100%', height: `${ITEM_HEIGHT}px`, padding: 0, border: 'none', backgroundColor: item === selectedValue ? '#2563eb' : 'transparent', color: item === selectedValue ? 'white' : '#64748b', fontSize: item === selectedValue ? '18px' : '15px', fontWeight: item === selectedValue ? '900' : '700', fontVariantNumeric: 'tabular-nums', scrollSnapAlign: 'center', cursor: 'pointer' }}
            >
              {formatItem(item)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="expense-time-picker" ref={pickerRef} style={{ position: 'relative', width: '100%', minWidth: 0, marginBottom: compact ? 0 : (window.innerWidth < 768 ? '8px' : '20px') }}>
      {label && <div className="expense-form-label" style={{ marginBottom: compact ? '6px' : '8px' }}>{label}</div>}
      <button
        type="button"
        className="expense-time-picker-trigger"
        onClick={() => setIsOpen(open => !open)}
        aria-label={`${label || '시간'} ${period === 'AM' ? '오전' : '오후'} ${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', minHeight: compact ? '42px' : '50px', padding: compact ? '10px 12px' : '12px 14px', border: `1px solid ${isOpen ? '#2563eb' : '#e2e8f0'}`, borderRadius: '12px', backgroundColor: 'white', color: '#1f2937', fontFamily: 'inherit', fontSize: compact ? '12px' : '14px', fontWeight: '800', cursor: 'pointer', textAlign: 'left', boxShadow: isOpen ? '0 0 0 3px rgba(37, 99, 235, 0.12)' : 'none' }}
      >
        <Clock size={compact ? 14 : 17} color="#64748b" aria-hidden="true" />
        <span style={{ flex: 1 }}>{period === 'AM' ? '오전' : '오후'} {String(hour12).padStart(2, '0')}:{String(minute).padStart(2, '0')}</span>
        <ChevronDown size={16} color="#64748b" aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="expense-time-picker-popover" role="dialog" aria-label="소비 시간 선택" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 60, width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: '8px', border: '1px solid #dbe3ef', borderRadius: '18px', backgroundColor: 'white', boxShadow: '0 18px 40px rgba(15, 23, 42, 0.2)' }}>
          <div className="expense-time-picker-wheels" style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, padding: '4px', borderRadius: '15px', backgroundColor: '#eef4ff' }}>
            {renderScrollColumn(TIME_PERIOD_OPTIONS, period, periodRef, 'period', item => item === 'AM' ? '오전' : '오후')}
            <span style={{ color: '#94a3b8', fontSize: '18px', fontWeight: '900' }}>·</span>
            {renderScrollColumn(hours, hour12, hourRef, 'hour')}
            <span style={{ color: '#94a3b8', fontSize: '18px', fontWeight: '900' }}>:</span>
            {renderScrollColumn(minutes, minute, minuteRef, 'minute')}
          </div>
          <div className="expense-time-picker-actions" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) repeat(2, minmax(32px, 0.65fr)) minmax(0, 1fr)', gap: '4px', marginTop: '8px' }}>
            <button type="button" onClick={setNow} style={{ minWidth: 0, padding: '8px 4px', border: 'none', borderRadius: '9px', backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '10px', fontWeight: '900', cursor: 'pointer', whiteSpace: 'nowrap' }}>현재 시간</button>
            <button type="button" onClick={() => adjustMinutes(-30)} style={{ minWidth: 0, padding: '8px 4px', border: 'none', borderRadius: '9px', backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '10px', fontWeight: '900', cursor: 'pointer' }}>-30</button>
            <button type="button" onClick={() => adjustMinutes(30)} style={{ minWidth: 0, padding: '8px 4px', border: 'none', borderRadius: '9px', backgroundColor: '#eff6ff', color: '#2563eb', fontSize: '10px', fontWeight: '900', cursor: 'pointer' }}>+30</button>
            <button type="button" onClick={() => setIsOpen(false)} style={{ minWidth: 0, padding: '8px 4px', border: 'none', borderRadius: '9px', backgroundColor: '#2563eb', color: 'white', fontSize: '10px', fontWeight: '900', cursor: 'pointer' }}>완료</button>
          </div>
        </div>
      )}
    </div>
  );
};

const ExpenseChoiceGroup = ({ options, value, onChange, ariaLabel, className = '', scrollable = false }) => (
  <div
    className={`expense-choice-group${scrollable ? ' is-scrollable' : ''}${className ? ` ${className}` : ''}`}
    role="group"
    aria-label={ariaLabel}
  >
    {options.map((option) => {
      const isSelected = String(value) === String(option.value);
      return (
        <button
          key={String(option.value)}
          type="button"
          className={`expense-choice-button${isSelected ? ' is-selected' : ''}${option.value ? ` is-${option.value}` : ''}`}
          aria-pressed={isSelected}
          title={option.title || option.label}
          onClick={() => onChange(option.value)}
        >
          {option.emoji && <span aria-hidden="true">{option.emoji}</span>}
          <span>{option.label}</span>
        </button>
      );
    })}
  </div>
);

const ExpenseCurrencyPicker = ({ value, options, onChange, placeholder = '추가 선택', ariaLabel, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const selectedCode = options.includes(value) ? value : '';

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const openAbove = spaceBelow < 180 && rect.top > 220;
    setMenuPosition({
      left: rect.left,
      width: rect.width,
      top: openAbove ? undefined : rect.bottom + 8,
      bottom: openAbove ? window.innerHeight - rect.top + 8 : undefined,
      maxHeight: Math.max(160, openAbove ? rect.top - 16 : spaceBelow)
    });
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    updateMenuPosition();
    const handleOutsidePointer = (event) => {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setIsOpen(false);
    };
    const handleViewportChange = () => updateMenuPosition();
    document.addEventListener('pointerdown', handleOutsidePointer);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen]);

  const selectedLabel = selectedCode ? `${getCurrencySymbol(selectedCode)} ${selectedCode}` : placeholder;

  return (
    <>
      <div className={`expense-currency-picker${className ? ` ${className}` : ''}${isOpen ? ' is-open' : ''}`}>
        <button
          ref={triggerRef}
          type="button"
          className="expense-currency-picker-trigger"
          onClick={() => setIsOpen(open => !open)}
          aria-label={ariaLabel}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span>{selectedLabel}</span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      </div>
      {isOpen && menuPosition && createPortal(
        <div
          ref={menuRef}
          className="expense-currency-picker-popover"
          role="listbox"
          aria-label={ariaLabel}
          style={{ left: menuPosition.left, width: menuPosition.width, top: menuPosition.top, bottom: menuPosition.bottom, maxHeight: menuPosition.maxHeight }}
        >
          {options.map(code => (
            <button
              key={`expense-currency-picker-${code}`}
              type="button"
              className={`expense-currency-picker-option${code === selectedCode ? ' is-selected' : ''}`}
              role="option"
              aria-selected={code === selectedCode}
              onClick={() => {
                onChange(code);
                setIsOpen(false);
              }}
            >
              {getCurrencySymbol(code)} {code}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
};

const ITINERARY_EMOJI_OPTIONS = ['📍', '✈️', '🏨', '🍽️', '☕', '🏖️', '🛍️', '🚗', '🎫', '📸', '🌅', '🏛️', '🎉', '🧳'];

const ItineraryEmojiPicker = ({ value, onChange }) => (
  <div style={{ marginBottom: '12px' }}>
    <div style={{ fontSize: '9px', fontWeight: '900', color: '#64748b', marginBottom: '6px' }}>
      일정 아이콘
    </div>
    <div role="radiogroup" aria-label="일정 아이콘 선택" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {ITINERARY_EMOJI_OPTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="radio"
          aria-label={`${emoji} 아이콘`}
          aria-checked={value === emoji}
          onClick={() => onChange(emoji)}
          style={{ width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: `1px solid ${value === emoji ? '#2563eb' : '#e2e8f0'}`, borderRadius: '10px', backgroundColor: value === emoji ? '#eff6ff' : 'white', boxShadow: value === emoji ? '0 0 0 2px rgba(37, 99, 235, 0.12)' : 'none', fontSize: '18px', cursor: 'pointer', transition: 'all 0.15s' }}
        >
          {emoji}
        </button>
      ))}
    </div>
  </div>
);


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
  const [authResolved, setAuthResolved] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showAccountDeleteModal, setShowAccountDeleteModal] = useState(false);
  const [accountDeleteConfirmation, setAccountDeleteConfirmation] = useState('');
  const [accountDeleteError, setAccountDeleteError] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  
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
  // Keep the expanded mobile sheet below the fixed search field.
  const mobileSheetTop = Math.min(112, Math.max(0, windowSize.height - 60));

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
        full: mobileSheetTop,
        half: H * 0.45,
        collapsed: H - 60
      };
      
      let baseTranslatePx = snapPoints[sheetMode];
      let finalTranslatePx = baseTranslatePx + dragOffset;
      finalTranslatePx = Math.max(mobileSheetTop, Math.min(H - 60, finalTranslatePx));
      
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
  const [itineraryEmoji, setItineraryEmoji] = useState('📍');
  const [expandedCountries, setExpandedCountries] = useState({});
  const [expandedRegions, setExpandedRegions] = useState({});
  const [editingTripId, setEditingTripId] = useState(null);
  const [editTripData, setEditTripData] = useState({ name: "", startDate: "", endDate: "", country: "" });
  const [showEditTripModal, setShowEditTripModal] = useState(false);
  const [editTripError, setEditTripError] = useState('');
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
  const [editingTimeItem, setEditingTimeItem] = useState(null); // { day, id, time, displayName, originalName, reservationNumber, reservationUrl, memo }
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [modalConfig, setModalConfig] = useState({ type: 'success', title: '', message: '' });
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showFullRoute, setShowFullRoute] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !readStoredJson(ONBOARDING_STORAGE_KEY, false));
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [mergeNotice, setMergeNotice] = useState(null);
  const [syncConflictNotice, setSyncConflictNotice] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(() => (
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  ));
  const [budgetPanel, setBudgetPanel] = useState(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [checklistDraft, setChecklistDraft] = useState('');
  const [cashWalletId, setCashWalletId] = useState(null);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [isBulkMoveMode, setIsBulkMoveMode] = useState(false);
  const [selectedItineraryItems, setSelectedItineraryItems] = useState([]);
  const [bulkMoveTargetDay, setBulkMoveTargetDay] = useState(1);
  const [undoStack, setUndoStack] = useState([]);
  const [readOnlySharedTrip, setReadOnlySharedTrip] = useState(null);
  const [sharedViewError, setSharedViewError] = useState('');
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);

  const dismissSyncConflictNotice = () => {
    const signature = syncConflictNotice?.signature;
    if (signature && session?.user?.id) {
      writeStoredJson(`${SYNC_CONFLICT_DISMISSED_STORAGE_PREFIX}_${session.user.id}`, signature);
    }
    setSyncConflictNotice(null);
  };

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
        updatedAt: getTripUpdatedAt(trip),
        reserveItems: Array.isArray(trip.reserveItems) ? trip.reserveItems : [],
        checklist: Array.isArray(trip.checklist) ? trip.checklist : getDefaultChecklist(),
        expenses: Array.isArray(trip.expenses) ? trip.expenses.map(expense => ({
          ...expense,
          category: expense.category || 'other',
          memo: expense.memo || ''
        })) : []
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
        checklist: getDefaultChecklist(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      writeStoredJson("world_pro_trips_v1", [migratedTrip]);
      return [migratedTrip];
    }
    return [];
  });

  const [activeTripId, setActiveTripId] = useState(null);

  const [exchangeRates, setExchangeRates] = useState({});
  const [exchangeRateInfo, setExchangeRateInfo] = useState({ date: '', source: '자동 환율' });
  const [expenseInput, setExpenseInput] = useState(() => ({ desc: '', amount: '', currency: '', paymentMethod: '', category: 'other', memo: '', day: 1, time: getCurrentTimeInputValue() }));
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [placeSuggestions, setPlaceSuggestions] = useState([]);

  const sharedTripCount = (trips || []).filter(t => t.sharedId).length;
  const suggestionRequestRef = useRef(0);
  const autocompleteSessionTokenRef = useRef(null);
  const makeEntityId = () => crypto.randomUUID();

  const getAuthRedirectUrl = () => (
    typeof window !== 'undefined'
      ? (isNativeShell() ? 'travelplaner://auth/callback' : `${window.location.origin}${window.location.pathname}`)
      : undefined
  );

  const clearAccountDeletionIntent = () => {
    localStorage.removeItem(ACCOUNT_DELETE_PENDING_STORAGE_KEY);
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('account');
    window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  };

  const resetAuthForm = () => {
    setAuthEmail('');
    setAuthPassword('');
    setAuthPasswordConfirm('');
    setAuthError('');
    setAuthMessage('');
    setShowAuthPassword(false);
  };

  const openAuthModal = (mode = 'login') => {
    resetAuthForm();
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  const closeAuthModal = () => {
    if (authSubmitting) return;
    if (readStoredJson(ACCOUNT_DELETE_PENDING_STORAGE_KEY, false)) clearAccountDeletionIntent();
    setShowAuthModal(false);
    resetAuthForm();
  };

  const requestAccountDeletion = () => {
    writeStoredJson(ACCOUNT_DELETE_PENDING_STORAGE_KEY, true);
    setAccountDeleteConfirmation('');
    setAccountDeleteError('');
    if (session) {
      setShowAccountDeleteModal(true);
    } else {
      openAuthModal('login');
    }
  };

  const closeAccountDeleteModal = () => {
    if (isDeletingAccount) return;
    clearAccountDeletionIntent();
    setShowAccountDeleteModal(false);
    setAccountDeleteConfirmation('');
    setAccountDeleteError('');
  };

  const handleDeleteAccount = async (event) => {
    event.preventDefault();
    if (accountDeleteConfirmation !== '삭제' || isDeletingAccount) return;

    setIsDeletingAccount(true);
    setAccountDeleteError('');
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.');

      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${currentSession.access_token}`,
          'content-type': 'application/json'
        },
        credentials: 'same-origin'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.deleted) {
        throw new Error(payload?.error?.message || '계정을 삭제하지 못했습니다.');
      }

      clearAccountDeletionIntent();
      setShowAccountDeleteModal(false);
      setAccountDeleteConfirmation('');
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      setSession(null);
      setModalConfig({
        type: 'success',
        title: '계정 삭제 완료',
        message: '계정과 클라우드 동기화 데이터를 삭제했습니다. 이 기기의 로그인 없는 로컬 일정은 그대로 유지됩니다.'
      });
      setShowCustomModal(true);
    } catch (error) {
      setAccountDeleteError(error.message || '계정을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError('');
    const nativeShell = isNativeShell();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthRedirectUrl(),
        skipBrowserRedirect: nativeShell
      }
    });
    if (error) {
      setAuthError(error.message || 'Google 로그인에 실패했습니다.');
      return;
    }
    if (nativeShell && data?.url && !openNativeAuthSession(data.url)) {
      setAuthError('네이티브 로그인 창을 열지 못했습니다.');
    }
  };

  const handleEmailAuthSubmit = async (event) => {
    event.preventDefault();
    const email = authEmail.trim();
    setAuthError('');
    setAuthMessage('');

    if (authMode !== 'new-password' && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      setAuthError('올바른 이메일 주소를 입력해주세요.');
      return;
    }

    if (authMode === 'reset') {
      setAuthSubmitting(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: getAuthRedirectUrl() });
      setAuthSubmitting(false);
      if (error) {
        setAuthError(error.message || '비밀번호 재설정 메일을 보내지 못했습니다.');
        return;
      }
      setAuthMessage('비밀번호 재설정 링크를 이메일로 보냈습니다. 메일의 링크를 눌러 새 비밀번호를 설정해주세요.');
      return;
    }

    if (authPassword.length < 6) {
      setAuthError('비밀번호는 6자 이상 입력해주세요.');
      return;
    }

    if (authMode === 'signup' || authMode === 'new-password') {
      if (authPassword !== authPasswordConfirm) {
        setAuthError('비밀번호가 서로 일치하지 않습니다.');
        return;
      }
    }

    setAuthSubmitting(true);
    if (authMode === 'new-password') {
      const { error } = await supabase.auth.updateUser({ password: authPassword });
      setAuthSubmitting(false);
      if (error) {
        setAuthError(error.message || '비밀번호를 변경하지 못했습니다.');
        return;
      }
      setAuthMessage('비밀번호가 변경되었습니다.');
      window.setTimeout(() => closeAuthModal(), 900);
      return;
    }

    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: authPassword,
        options: { emailRedirectTo: getAuthRedirectUrl() }
      });
      setAuthSubmitting(false);
      if (error) {
        setAuthError(error.message || '회원가입에 실패했습니다.');
        return;
      }
      if (data.session) {
        setShowAuthModal(false);
        resetAuthForm();
      } else {
        setAuthMessage('회원가입이 완료되었습니다. 이메일 인증 링크를 확인한 뒤 로그인해주세요.');
      }
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password: authPassword });
    setAuthSubmitting(false);
    if (error) {
      setAuthError('이메일 또는 비밀번호를 확인해주세요.');
      return;
    }
    setShowAuthModal(false);
    resetAuthForm();
  };

  // --- EFFECTS ---

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
    };
  }, []);

  const installPwa = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    setDeferredInstallPrompt(null);
  };

  // A shared URL opens a non-editable itinerary without requiring the viewer
  // to import it into their own account first.
  useEffect(() => {
    const sharedCode = new URLSearchParams(window.location.search).get('share');
    if (!sharedCode) return undefined;

    let cancelled = false;
    supabase
      .from('shared_trips')
      .select('*')
      .eq('id', sharedCode)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.trip_data) {
          setSharedViewError('공유 일정을 불러오지 못했습니다. 링크가 만료되었거나 삭제되었을 수 있습니다.');
          setSyncStatus('error');
          return;
        }
        setReadOnlySharedTrip({ ...data.trip_data, sharedId: data.id });
        setActiveTripId(`readonly-${data.id}`);
        setViewMode('itinerary');
        setShowOnboarding(false);
        setSyncStatus('saved');
      })
      .catch(() => {
        if (!cancelled) {
          setSharedViewError('공유 일정을 불러오지 못했습니다. 네트워크 상태를 확인해주세요.');
          setSyncStatus('error');
        }
      });

    return () => { cancelled = true; };
  }, []);

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
    supabase.auth.getSession()
      .then(({ data: { session } }) => setSession(session))
      .finally(() => setAuthResolved(true));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthResolved(true);
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('new-password');
        setAuthError('');
        setAuthMessage('새 비밀번호를 입력해주세요.');
        setShowAuthModal(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('account') === 'delete') {
      writeStoredJson(ACCOUNT_DELETE_PENDING_STORAGE_KEY, true);
    }
  }, []);

  useEffect(() => {
    if (!authResolved || !readStoredJson(ACCOUNT_DELETE_PENDING_STORAGE_KEY, false)) return;
    if (session) {
      // Open the destructive confirmation only after the requested account is authenticated.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowAuthModal(false);
      setShowAccountDeleteModal(true);
    } else if (!showAuthModal) {
      openAuthModal('login');
    }
  // Re-run only when the resolved authentication or modal state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authResolved, session, showAuthModal]);

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
    setItineraryEmoji(selectedPlace?.emoji || '📍');
  }, [selectedPlace]);

  // Cloud Sync Initialization
  useEffect(() => {
    async function initCloudDB() {
      if (!session) {
        setIsLoadingDB(false);
        setSyncStatus("saved");
        return;
      }
      setSyncConflictNotice(null);
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
          const cloudById = new Map(cloudTripList.map(trip => [String(trip.id), trip]));
          const localById = new Map(localRegularTrips.map(trip => [String(trip.id), trip]));
          const mergedTrips = [];
          let localWins = 0;
          let remoteWins = 0;
          let conflictCount = 0;
          const conflictEntries = [];

          cloudTripList.forEach(cloudTrip => {
            const localTrip = localById.get(String(cloudTrip.id));
            if (!localTrip) {
              mergedTrips.push(cloudTrip);
              return;
            }
            if (areTripsEqual(localTrip, cloudTrip)) {
              mergedTrips.push(localTrip);
              return;
            }

            conflictCount += 1;
            conflictEntries.push({
              id: String(localTrip.id),
              local: getComparableTrip(localTrip),
              remote: getComparableTrip(cloudTrip)
            });
            if (getTripUpdatedAt(localTrip) > getTripUpdatedAt(cloudTrip)) {
              mergedTrips.push(localTrip);
              localWins += 1;
            } else {
              mergedTrips.push(cloudTrip);
              remoteWins += 1;
            }
          });

          const localOnlyTrips = localRegularTrips.filter(localTrip => !cloudById.has(String(localTrip.id)));
          mergedTrips.push(...localOnlyTrips);
          mergedTrips.push(...localTestTrips);
          setTrips(mergedTrips);
          writeStoredJson("world_pro_trips_v1", mergedTrips);
          mergedTripCount = localOnlyTrips.length;
          if (conflictEntries.length > 0) {
            const conflictSignature = conflictEntries
              .sort((left, right) => left.id.localeCompare(right.id))
              .map(entry => JSON.stringify(entry))
              .join('|');
            const dismissedSignature = readStoredJson(
              `${SYNC_CONFLICT_DISMISSED_STORAGE_PREFIX}_${session.user.id}`,
              ''
            );
            if (dismissedSignature !== conflictSignature) {
              setSyncConflictNotice({ conflicts: conflictCount, localWins, remoteWins, signature: conflictSignature });
            }
          }
          if (localOnlyTrips.length > 0 || localWins > 0) {
            const { error: mergeTripError } = await supabase.from("user_state").upsert({ user_id: session.user.id, key: "world_pro_trips_v1", value: mergedTrips.filter(trip => !trip.localOnly) }, { onConflict: "user_id,key" });
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
          const updatedAt = data.time_last_update_unix
            ? new Date(data.time_last_update_unix * 1000)
            : new Date();
          setExchangeRateInfo({ date: formatLocalDate(updatedAt), source: '자동 환율' });
        }
      })
      .catch(err => console.error("Exchange rate fetch failed", err));
  }, []);

  // --- DERIVED STATE ---
  const isReadOnlyTrip = Boolean(readOnlySharedTrip);
  const activeTrip = isReadOnlyTrip
    ? readOnlySharedTrip
    : (trips || []).find(t => String(t.id) === String(activeTripId));
  const itinerary = useMemo(() => activeTrip?.itinerary || [], [activeTrip]);
  const reserveItems = useMemo(() => activeTrip?.reserveItems || [], [activeTrip]);
  const budgetSettings = activeTrip?.budgetSettings || { limitKRW: 1000000, travelCurrency: 'USD', exchangeRates: {}, categoryBudgets: {} };
  const expenses = useMemo(() => activeTrip?.expenses || [], [activeTrip]);
  const createTripDayCount = useMemo(() => {
    if (!createTripData.startDate || !createTripData.endDate) return 0;
    const start = new Date(`${createTripData.startDate}T00:00:00`);
    const end = new Date(`${createTripData.endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  }, [createTripData.startDate, createTripData.endDate]);
  const editTripDayCount = useMemo(() => {
    if (!editTripData.startDate || !editTripData.endDate) return 0;
    const start = new Date(`${editTripData.startDate}T00:00:00`);
    const end = new Date(`${editTripData.endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  }, [editTripData.startDate, editTripData.endDate]);

  const getExpenseAmountKRW = (amount, currency, settings = budgetSettings) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) return 0;
    if (currency !== 'KRW') {
      const effectiveRate = getEffectiveExchangeRate(currency, exchangeRates, settings);
      if (effectiveRate) return Math.round(numericAmount * effectiveRate);
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

  const getRegionFromAddress = (address, country = '') => {
    if (!address) return '지역 미분류';

    const parts = String(address)
      .split(',')
      .map(part => normalizeRegionLabel(part.replace(/[0-9]{5,}/g, '').trim()))
      .filter(Boolean);
    if (parts.length === 0) return '지역 미분류';

    const countryIndex = parts.findIndex(part => part === country);
    const partsBeforeCountry = countryIndex > 0 ? parts.slice(0, countryIndex) : parts;
    const candidate = partsBeforeCountry[partsBeforeCountry.length - 1];

    if (!candidate || candidate === country || /^[A-Z0-9]{4,}\+[A-Z0-9]{2,}$/i.test(candidate)) {
      return '지역 미분류';
    }
    return candidate;
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
      const addressGrouping = getPlaceAddressGrouping(
        fav.addressComponents || fav.address_components
      );
      const country = fav.country || addressGrouping.country || getCountryFromAddress(fav.loc) || '기타';
      const region = normalizeRegionLabel(fav.region) || addressGrouping.region || getRegionFromAddress(fav.loc, country) || '지역 미분류';
      if (!groups[country]) groups[country] = {};
      if (!groups[country][region]) groups[country][region] = [];
      groups[country][region].push(fav);
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

  const toggleRegion = (country, region) => {
    const key = `${country}::${region}`;
    setExpandedRegions(prev => ({
      ...prev,
      [key]: !prev[key]
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

    if (!isOnline) {
      setSyncStatus('offline');
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

    if (!isOnline) {
      setSyncStatus('offline');
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

  const getSharedTripLink = (sharedId) => (
    typeof window === 'undefined'
      ? String(sharedId || '')
      : `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(sharedId)}`
  );

  const copySharedTripLink = (sharedId, tripId) => {
    if (!sharedId) return;
    copyToClipboard(getSharedTripLink(sharedId), tripId, '공유 링크');
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
      copySharedTripLink(trip.sharedId, tripId);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('shared_trips')
        .insert({ trip_data: trip, owner_id: session?.user?.id || null })
        .select()
        .single();

      if (error) {
        console.error("Supabase insert error:", error);
        throw new Error(error.message || "Database insert failed");
      }

      const newTrips = trips.map(t => t.id === tripId ? { ...t, sharedId: data.id } : t);
      await syncTripsToCloud(newTrips);
      copySharedTripLink(data.id, tripId);
      
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
    const input = joinTripCode.trim();
    let code = input;
    try {
      code = new URL(input, window.location.origin).searchParams.get('share') || input;
    } catch {
      code = input;
    }
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

  const copyToClipboard = (text, id, copyLabel = '초대 코드') => {
    if (!text) return;
    
    const performCopy = async () => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          setModalConfig({ type: 'success', title: '복사 완료', message: `${copyLabel}가 클립보드에 복사되었습니다.` });
          setShowCustomModal(true);
        } else {
          // Fallback for non-secure contexts
          const textArea = document.createElement("textarea");
          textArea.value = text;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
          setModalConfig({ type: 'success', title: '복사 완료', message: `${copyLabel}가 복사되었습니다.` });
          setShowCustomModal(true);
        }
        
        setCopiedId(id);
      } catch (err) {
        console.error("Copy failed:", err);
        setModalConfig({ type: 'error', title: '복사 실패', message: `${copyLabel} 복사에 실패했습니다. 수동으로 복사해주세요: ${text}` });
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
      setModalConfig({ type: 'success', title: '예시 형식 복사 완료', message: '복사한 JSON 예시를 원하는 AI 도구에 전달해 여행 일정으로 바꿔 달라고 요청해 보세요.' });
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
  const rememberTripForUndo = (trip) => {
    if (!trip || isReadOnlyTrip) return;
    setUndoStack(previous => [
      ...previous.slice(-9),
      { tripId: trip.id, trip: JSON.parse(JSON.stringify(trip)), createdAt: Date.now() }
    ]);
  };

  const updateActiveTrip = async (updates) => {
    if (!activeTripId || isReadOnlyTrip) return;

    const currentTrip = (trips || []).find(trip => trip.id === activeTripId);
    rememberTripForUndo(currentTrip);
    // Calculate new state array based on existing state
    const nextTrips = (trips || []).map(t => t.id === activeTripId ? { ...t, ...updates, updatedAt: Date.now() } : t);
    
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

    const nextExpenses = expenses.map(expense => {
      const expenseDay = parseDay(expense.day);
      if (expenseDay === targetDay) return { ...expense, day: Math.max(0, targetDay - 1) };
      if (expenseDay > targetDay) return { ...expense, day: expenseDay - 1 };
      return expense;
    });
    await updateActiveTrip({ itinerary: newItinerary, endDate: newEndDate, expenses: nextExpenses });
    setActiveDay(Math.min(targetDay, newItinerary.length));
  };

  const saveItinerary = (newItinerary) => updateActiveTrip({ itinerary: newItinerary });
  const saveBudgetSettings = (newSettings) => updateActiveTrip({ budgetSettings: newSettings });
  const saveExpenses = (newExpenses) => updateActiveTrip({ expenses: newExpenses });

  const undoLastChange = async () => {
    const lastChange = undoStack[undoStack.length - 1];
    if (!lastChange || isReadOnlyTrip) return;
    const restoredTrips = (trips || []).map(trip => (
      trip.id === lastChange.tripId ? lastChange.trip : trip
    ));
    setUndoStack(previous => previous.slice(0, -1));
    await syncTripsToCloud(restoredTrips);
    setModalConfig({ type: 'success', title: '변경을 실행 취소했습니다', message: '이전 상태로 복원했습니다.' });
    setShowCustomModal(true);
  };

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
      checklist: getDefaultChecklist(),
      reminders: { enabled: false, minutesBefore: 30 },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const newTrips = [newTrip, ...(trips || [])];
    await syncTripsToCloud(newTrips);
    setShowCreateTripModal(false);
    setCreateTripError('');
    setOpenItineraryAfterCreate(false);

    if (shouldOpenItinerary) {
      setActiveTripId(newId);
      openItinerary();
      setOnboardingStep(1);
      setShowOnboarding(true);
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
      window.setTimeout(() => document.querySelector('.search-input')?.focus(), 120);
      return;
    }
    dismissOnboarding();
  };

  const exportTripBackupAsJson = (trip = activeTrip) => {
    if (!trip) return;

    const exportData = { ...trip };
    delete exportData.sharedId;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const safeName = (trip.name || "travel-plan").replace(/[^\w가-힣-]+/g, "_");
    saveBlobAsFile(blob, safeName + "-backup.json");
    setModalConfig({ type: "success", title: "여행 데이터 백업 완료", message: "일정·지출·예산이 포함된 여행 데이터 백업 파일을 저장했습니다." });
    setShowCustomModal(true);
  };

  const downloadTextFile = (fileName, content, type) => {
    const blob = new Blob([content], { type });
    saveBlobAsFile(blob, fileName);
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
        `DESCRIPTION:${escapeIcsText([item.desc, item.reservationNumber ? `예약번호: ${item.reservationNumber}` : '', item.memo ? `메모: ${item.memo}` : '', item.reservationUrl ? `예약 링크: ${item.reservationUrl}` : ''].filter(Boolean).join('\n'))}`,
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
    const header = ['일차', '날짜', '지출 내용', '카테고리', '메모', '금액', '통화', '결제 수단', '원화 환산', '소비 시간'].join(',');
    const rows = (trip.expenses || []).map(expense => [
      expense.day === 0 ? '여행 전 준비' : `${expense.day}일차`,
      expense.day === 0 ? '' : getActualDateForDay(trip.startDate, expense.day),
      expense.desc,
      getExpenseCategoryLabel(expense.category),
      expense.memo || '',
      expense.amount,
      expense.currency || 'KRW',
      getPaymentMethodLabel(expense.paymentMethod),
      getExpenseAmountKRW(expense.amount, expense.currency, trip.budgetSettings),
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
      updatedAt: Date.now(),
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
              createdAt: exp.createdAt || Date.now(),
              category: exp.category || 'other',
              memo: exp.memo || ''
            })),
            checklist: Array.isArray(data.checklist) ? data.checklist : getDefaultChecklist(),
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
    setEditTripError('');
    setEditTripData({ 
      name: trip.name, 
      startDate: trip.startDate || "", 
      endDate: trip.endDate || "",
      country: trip.country || ""
    });
    setShowEditTripModal(true);
  };

  const cancelEditTrip = () => {
    setShowEditTripModal(false);
    setEditingTripId(null);
    setEditTripError('');
  };

  const saveRenameTrip = (id) => {
    const trimmedName = editTripData.name.trim();
    if (!trimmedName) {
      setEditTripError('여행 이름을 입력해주세요.');
      return;
    }

    {
      const { startDate, endDate, country } = editTripData;
      let newItinerary = null;
      let travelCurrency = null;
      
      if (country && countryToCurrency[country]) {
        travelCurrency = countryToCurrency[country];
      }
      
      if (startDate && endDate) {
        const start = new Date(startDate + "T00:00:00");
        const end = new Date(endDate + "T00:00:00");
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
          setEditTripError('시작일은 종료일보다 늦을 수 없습니다.');
          return;
        }
        if (start <= end) {
          const diffTime = Math.abs(end - start);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          if (diffDays > 100) {
            setEditTripError('여행 기간은 최대 100일까지 설정할 수 있습니다.');
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
        setEditTripError('마지막 일차에 일정이 남아 있습니다. 해당 일정을 예비 목록으로 이동하거나 삭제한 뒤 여행 기간을 줄여주세요.');
        return;
      }

      const nextTrips = (trips || []).map(t => {
        if (t.id === id) {
          const tripToUpdate = { ...t, name: trimmedName, startDate, endDate, country };
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
    cancelEditTrip();
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
        emoji: itineraryEmoji || place.emoji || '📍',
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
        { ...place, id: makeEntityId(), emoji: itineraryEmoji || place.emoji || '📍', displayName, time: finalTime }
      ].sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
    } else {
      newItinerary.push({ 
        day: targetDay, 
        items: [{ ...place, id: makeEntityId(), emoji: itineraryEmoji || place.emoji || '📍', displayName, time: itineraryTime || '09:00' }]
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
      category: expenseInput.category || 'other',
      memo: expenseInput.memo?.trim() || '',
      amountKRW: getExpenseAmountKRW(expenseInput.amount, currentCurrency),
      day: parseInt(expenseInput.day, 10) || 0,
      time: expenseInput.time || ''
    };

    saveExpenses([...expenses, newExpense]);
    setExpenseInput({ ...expenseInput, desc: '', amount: '', memo: '', time: getCurrentTimeInputValue() });
  };

  const startEditingExpense = (expense) => {
    setEditingExpenseId(expense.id);
    setExpenseInput({
      desc: expense.desc || '',
      amount: String(expense.amount ?? ''),
      currency: expense.currency || budgetSettings.travelCurrency || 'USD',
      paymentMethod: expense.paymentMethod || '',
      category: expense.category || 'other',
      memo: expense.memo || '',
      day: expense.day ?? 1,
      time: expense.time || ''
    });
  };

  const cancelEditingExpense = () => {
    setEditingExpenseId(null);
    setExpenseInput(current => ({ ...current, desc: '', amount: '', memo: '', time: getCurrentTimeInputValue() }));
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
      category: expenseInput.category || 'other',
      memo: expenseInput.memo?.trim() || '',
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
    const addressGrouping = getPlaceAddressGrouping(place.addressComponents || place.address_components);
    const favoritePlace = {
      ...place,
      country: place.country || addressGrouping.country || getCountryFromAddress(place.loc),
      region: normalizeRegionLabel(place.region) || addressGrouping.region || getRegionFromAddress(place.loc, place.country || addressGrouping.country)
    };
    const nextFavs = isFav 
      ? safeFavs.filter(f => f.name !== place.name)
      : [...safeFavs, { ...favoritePlace, id: makeEntityId() }];
    
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
      reservationNumber: item.reservationNumber || '',
      reservationUrl: item.reservationUrl || '',
      memo: item.memo || '',
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
    rememberTripForUndo((trips || []).find(trip => trip.id === activeTripId));
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
    rememberTripForUndo((trips || []).find(trip => trip.id === activeTripId));
    syncTripsToCloud(nextTrips);
  };

  const toggleItineraryItemSelection = (itemId) => {
    setSelectedItineraryItems(previous => previous.includes(itemId)
      ? previous.filter(id => id !== itemId)
      : [...previous, itemId]);
  };

  const moveSelectedItineraryItems = () => {
    const moveToReserve = bulkMoveTargetDay === 'reserve';
    const targetDay = moveToReserve ? null : parseDay(bulkMoveTargetDay);
    if ((!moveToReserve && !targetDay) || selectedItineraryItems.length === 0) return;
    const currentTrip = (trips || []).find(trip => trip.id === activeTripId);
    if (!currentTrip) return;
    const selected = new Set(selectedItineraryItems);
    const movingItems = [];
    const itineraryWithoutSelected = (currentTrip.itinerary || []).map(dayPlan => {
      const remaining = [];
      (dayPlan.items || []).forEach(item => {
        if (selected.has(item.id)) movingItems.push(item);
        else remaining.push(item);
      });
      return { ...dayPlan, items: remaining };
    });
    const nextItinerary = moveToReserve
      ? itineraryWithoutSelected
      : itineraryWithoutSelected.map(dayPlan => parseDay(dayPlan.day) === targetDay
      ? {
        ...dayPlan,
        items: [...dayPlan.items, ...movingItems].sort((a, b) => (a.time || '23:59').localeCompare(b.time || '23:59'))
      }
      : dayPlan);
    if (movingItems.length === 0) return;
    rememberTripForUndo(currentTrip);
    syncTripsToCloud((trips || []).map(trip => trip.id === activeTripId
      ? {
        ...trip,
        itinerary: nextItinerary,
        ...(moveToReserve ? { reserveItems: [...(trip.reserveItems || []), ...movingItems] } : {})
      }
      : trip));
    setSelectedItineraryItems([]);
    setIsBulkMoveMode(false);
    setActiveDay(moveToReserve ? 'reserve' : targetDay);
  };

  const updateChecklist = (nextChecklist) => {
    updateActiveTrip({ checklist: nextChecklist });
  };

  const toggleChecklistItem = (itemId) => {
    const checklist = Array.isArray(activeTrip?.checklist) ? activeTrip.checklist : getDefaultChecklist();
    updateChecklist(checklist.map(item => item.id === itemId ? { ...item, checked: !item.checked } : item));
  };

  const addChecklistItem = () => {
    const label = checklistDraft.trim();
    if (!label) return;
    const checklist = Array.isArray(activeTrip?.checklist) ? activeTrip.checklist : getDefaultChecklist();
    updateChecklist([...checklist, { id: makeEntityId(), label, checked: false }]);
    setChecklistDraft('');
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
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'viewport', 'addressComponents', 'regularOpeningHours', 'currentOpeningHours', 'businessStatus'] });
      const location = place.location;
      if (!location) return;

      const name = getFormattableText(place.displayName) || getFormattableText(prediction.mainText) || getFormattableText(prediction.text) || '선택한 장소';
      const address = getFormattableText(place.formattedAddress) || getFormattableText(prediction.secondaryText) || '';
      const addressGrouping = getPlaceAddressGrouping(place.addressComponents);
      const newPlace = {
        name,
        lat: location.lat(),
        lng: location.lng(),
        loc: address,
        desc: address,
        country: addressGrouping.country,
        region: addressGrouping.region,
        openingHours: getOpeningHours(place),
        businessStatus: place.businessStatus || '',
        emoji: '📍',
        type: 'search'
      };

      setSearchResult(newPlace);
      setSelectedPlace(newPlace);
      if (onboardingStep === 2) setShowOnboarding(true);
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
      const addressGrouping = getPlaceAddressGrouping(result.address_components);
      const newPlace = {
        name: result.formatted_address || query,
        lat: location.lat(),
        lng: location.lng(),
        loc: result.formatted_address || query,
        desc: result.formatted_address || query,
        country: addressGrouping.country,
        region: addressGrouping.region,
        emoji: '📍',
        type: 'geocoded-search'
      };
      setSearchResult(newPlace);
      setSelectedPlace(newPlace);
      if (onboardingStep === 2) setShowOnboarding(true);
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
      { placeId, fields: ['name', 'geometry', 'formatted_address', 'address_components', 'opening_hours', 'current_opening_hours', 'business_status'] },
      (place, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place.geometry && place.geometry.location) {
          const addressGrouping = getPlaceAddressGrouping(place.address_components);
          const newPlace = {
            name: place.name,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            loc: place.formatted_address || 'Selected from Map',
            desc: place.formatted_address || 'Selected from Map',
            country: addressGrouping.country,
            region: addressGrouping.region,
            openingHours: getOpeningHours(place),
            businessStatus: place.business_status || '',
            emoji: '📍',
            type: 'poi'
          };
          setSearchResult(newPlace);
          setSelectedPlace(newPlace);
          if (onboardingStep === 2) setShowOnboarding(true);
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
  const totalSpentKRW = (expenses || []).reduce((acc, curr) => acc + getExpenseAmountKRW(curr.amount, curr.currency), 0);
  const expenseTotalsByCurrency = useMemo(() => (expenses || []).reduce((totals, expense) => {
    const currency = expense.currency || 'KRW';
    const amount = Number(expense.amount) || 0;
    totals[currency] = (totals[currency] || 0) + amount;
    return totals;
  }, {}), [expenses]);
  // getExpenseAmountKRW is intentionally scoped to the active trip's settings.
  /* eslint-disable react-hooks/exhaustive-deps */
  const expenseKRWTotalsByCurrency = useMemo(() => (expenses || []).reduce((totals, expense) => {
    const currency = expense.currency || 'KRW';
    const numericAmount = Number(expense.amount) || 0;
    const amountKRW = getExpenseAmountKRW(numericAmount, currency);
    totals[currency] = (totals[currency] || 0) + amountKRW;
    return totals;
  }, {}), [expenses, exchangeRates, budgetSettings]);
  /* eslint-enable react-hooks/exhaustive-deps */
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
  const defaultCashCurrency = SUPPORTED_CURRENCY_CODES.includes(budgetSettings.travelCurrency)
    ? budgetSettings.travelCurrency
    : 'KRW';
  const cashCurrencyChoices = Array.from(new Set([
    defaultCashCurrency,
    ...(favoriteCurrencies || [])
  ].filter(currency => SUPPORTED_CURRENCY_CODES.includes(currency))));
  const cashLedgerCurrency = cashCurrencyChoices.includes(budgetSettings.cashLedgerCurrency)
    ? budgetSettings.cashLedgerCurrency
    : defaultCashCurrency;
  const cashLedgers = budgetSettings.cashLedgers || {};
  const allCashWallets = getCashWalletsFromSettings(budgetSettings);
  const cashWallets = allCashWallets
    .filter(wallet => cashCurrencyChoices.includes(wallet.currency));
  const preferredCashWallet = cashWallets.find(wallet => wallet.id === cashWalletId)
    || cashWallets.find(wallet => wallet.currency === cashLedgerCurrency)
    || cashWallets[0];
  const cashLedger = preferredCashWallet || cashLedgers[cashLedgerCurrency] || {};
  const activeCashWalletId = preferredCashWallet?.id || null;
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
    if (activeCashWalletId) {
      const nextWallets = allCashWallets.map(wallet => wallet.id === activeCashWalletId
        ? { ...wallet, ...updates }
        : wallet);
      saveBudgetSettings({ ...budgetSettings, cashWallets: nextWallets, cashLedgerCurrency: cashLedger.currency });
      return;
    }
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
  const addCashWallet = () => {
    const currency = cashCurrencyChoices.find(code => code !== defaultCashCurrency) || defaultCashCurrency;
    const newWallet = {
      id: makeEntityId(),
      name: `${currency} 현금 지갑`,
      currency,
      initial: 0,
      additional: 0,
      actualRemaining: ''
    };
    saveBudgetSettings({
      ...budgetSettings,
      cashWallets: [...allCashWallets, newWallet],
      cashLedgerCurrency: currency
    });
    setCashWalletId(newWallet.id);
  };
  const editingExpense = (expenses || []).find(expense => expense.id === editingExpenseId);
  const budgetProgress = budgetSettings.limitKRW > 0 ? Math.min((totalSpentKRW / budgetSettings.limitKRW) * 100, 100) : 0;
  // getExpenseAmountKRW is intentionally scoped to the active trip's settings.
  /* eslint-disable react-hooks/exhaustive-deps */
  const categoryTotalsKRW = useMemo(() => (expenses || []).reduce((totals, expense) => {
    const category = expense.category || 'other';
    totals[category] = (totals[category] || 0) + getExpenseAmountKRW(expense.amount, expense.currency);
    return totals;
  }, {}), [expenses, exchangeRates, budgetSettings]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const categoryBudgetEntries = EXPENSE_CATEGORIES.map(category => ({
    ...category,
    spent: categoryTotalsKRW[category.value] || 0,
    budget: Number(budgetSettings.categoryBudgets?.[category.value]) || 0
  }));
  /* eslint-disable react-hooks/exhaustive-deps */
  const paymentTotalsKRW = useMemo(() => (expenses || []).reduce((totals, expense) => {
    const paymentMethod = expense.paymentMethod || 'unassigned';
    totals[paymentMethod] = (totals[paymentMethod] || 0) + getExpenseAmountKRW(expense.amount, expense.currency);
    return totals;
  }, {}), [expenses, exchangeRates, budgetSettings]);
  const dailyExpenseTotalsKRW = useMemo(() => (expenses || []).reduce((totals, expense) => {
    const day = parseDay(expense.day);
    totals[day] = (totals[day] || 0) + getExpenseAmountKRW(expense.amount, expense.currency);
    return totals;
  }, {}), [expenses, exchangeRates, budgetSettings]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const averageDailySpendKRW = itinerary.length > 0 ? Math.round(totalSpentKRW / itinerary.length) : 0;
  const budgetPanelItems = [
    { key: 'exchange', label: '통화 설정', activeColor: '#1d4ed8', activeBackground: '#dbeafe' },
    { key: 'category', label: '카테고리별 예산', activeColor: '#92400e', activeBackground: '#fef3c7' },
    { key: 'cash', label: '현금 정산', activeColor: '#92400e', activeBackground: '#fef3c7' },
    { key: 'stats', label: '통계', activeColor: '#7c3aed', activeBackground: '#ede9fe' }
  ];
  const todayItinerarySummary = useMemo(() => {
    if (!activeTrip || !activeTrip.startDate) return null;
    const start = new Date(`${activeTrip.startDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tripDay = Math.round((today - start) / 86400000) + 1;
    const dayPlan = itinerary.find(day => parseDay(day.day) === tripDay);
    if (!dayPlan) return { status: tripDay < 1 ? 'upcoming' : 'past', day: tripDay };
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const items = [...(dayPlan.items || [])].sort((a, b) => (a.time || '23:59').localeCompare(b.time || '23:59'));
    const nextItem = items.find(item => {
      const [hour, minute] = String(item.time || '23:59').split(':').map(Number);
      return hour * 60 + minute >= nowMinutes;
    });
    const currentItem = [...items].reverse().find(item => {
      const [hour, minute] = String(item.time || '00:00').split(':').map(Number);
      return hour * 60 + minute <= nowMinutes;
    });
    return { status: 'ongoing', day: tripDay, dayPlan, nextItem, currentItem };
  }, [activeTrip, itinerary]);
  const getDayConflictWarnings = (dayPlan) => {
    const items = [...(dayPlan?.items || [])].filter(item => item.time);
    const warnings = [];
    for (let index = 1; index < items.length; index += 1) {
      const previous = items[index - 1];
      const current = items[index];
      const [prevHour, prevMinute] = previous.time.split(':').map(Number);
      const [currentHour, currentMinute] = current.time.split(':').map(Number);
      const gap = (currentHour * 60 + currentMinute) - (prevHour * 60 + prevMinute);
      if (gap < 0) {
        warnings.push(`${previous.displayName || previous.name} 이후 시간이 거꾸로 설정되어 있어요.`);
      }
    }
    return warnings;
  };
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
  const expenseDayChoices = [
    { value: 0, label: '여행 전 준비' },
    ...itinerary.map(dayPlan => {
      const dayNumber = parseInt(dayPlan.day, 10);
      const actualDate = activeTrip?.startDate ? getActualDateForDay(activeTrip.startDate, dayNumber) : '';
      return { value: dayNumber, label: `${dayNumber}일차${actualDate ? ` · ${actualDate}` : ''}` };
    })
  ];
  const useExpenseDayChoices = expenseDayChoices.length <= 8;
  const expenseQuickCurrencyCodes = Array.from(new Set([
    budgetSettings.travelCurrency,
    'KRW'
  ].filter(code => code && expenseCurrencyChoices.includes(code))));
  const expenseCurrencyQuickOptions = expenseQuickCurrencyCodes.map(code => ({
    value: code,
    label: `${getCurrencySymbol(code)} ${code}`,
    title: `${getCurrencyNameKO(code)} (${code})`
  }));
  const expenseCurrencyAdditionalChoices = expenseCurrencyChoices.filter(code => !expenseQuickCurrencyCodes.includes(code));
  const selectedExpenseCurrency = expenseInput.currency || budgetSettings.travelCurrency || expenseCurrencyChoices[0] || 'KRW';
  const expenseCurrencyQuickValue = expenseQuickCurrencyCodes.includes(selectedExpenseCurrency) ? selectedExpenseCurrency : '';
  const expenseCurrencyAdditionalValue = expenseCurrencyAdditionalChoices.includes(selectedExpenseCurrency) ? selectedExpenseCurrency : '';
  const useFloatingPlacePanel = true;
  const selectedPlaceOpeningHours = getOpeningHours(selectedPlace);
  const selectedPlaceBusinessStatus = getBusinessStatusLabel(selectedPlace?.businessStatus);

  const renderCashReconciliationPanel = () => (
    <div className="cash-reconciliation-card" style={{ padding: '16px', backgroundColor: '#fffaf0', border: '1px solid #fde68a', borderRadius: '16px', marginBottom: '18px' }}>
      <div className="cash-reconciliation-panel-heading">
        <span><strong className="cash-reconciliation-toggle-title">현금 정산</strong><span className="cash-reconciliation-toggle-description">환전·인출한 금액과 현금 지출을 비교해 잔액을 확인하세요.</span></span>
        <span className={`cash-reconciliation-status-chip${cashDifference === null ? ' is-pending' : cashDifference === 0 ? ' is-matched' : ' is-mismatch'}`}>{cashDifference === null ? '입력 필요' : cashDifference === 0 ? '정산 일치' : '확인 필요'}</span>
      </div>
      <div className="cash-reconciliation-panel">
        <div className="cash-reconciliation-panel-heading">
        <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}><strong>정산 통화</strong><small style={{ color: '#a16207', fontSize: '9px', fontWeight: '700' }}>기본 여행 통화와 즐겨찾기 통화만 표시</small></span>
          <select value={cashLedgerCurrency} onChange={(e) => { const wallet = cashWallets.find(candidate => candidate.currency === e.target.value); setCashWalletId(wallet?.id || null); saveBudgetSettings({ ...budgetSettings, cashLedgerCurrency: e.target.value }); }} aria-label="현금 정산 통화">
            {cashCurrencyChoices.map(code => <option key={`cash-ledger-currency-${code}`} value={code}>{getCurrencySymbol(code)} {getCurrencyNameKO(code)} ({code})</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
          <span style={{ color: '#92400e', fontSize: '10px', fontWeight: '900' }}>통화별 현금 지갑</span>
          {cashWallets.map(wallet => <button key={`cash-wallet-${wallet.id}`} type="button" onClick={() => { setCashWalletId(wallet.id); saveBudgetSettings({ ...budgetSettings, cashLedgerCurrency: wallet.currency }); }} style={{ padding: '6px 8px', border: `1px solid ${activeCashWalletId === wallet.id ? '#f59e0b' : '#fde68a'}`, borderRadius: '8px', background: activeCashWalletId === wallet.id ? '#fef3c7' : 'white', color: '#92400e', fontSize: '10px', fontWeight: '800', cursor: 'pointer' }}>{wallet.name} · {wallet.currency}</button>)}
          {!isReadOnlyTrip && <button type="button" onClick={addCashWallet} style={{ padding: '6px 8px', border: '1px dashed #f59e0b', borderRadius: '8px', background: 'transparent', color: '#b45309', fontSize: '10px', fontWeight: '900', cursor: 'pointer' }}>+ 지갑 추가</button>}
        </div>
        {activeCashWalletId && <label style={{ display: 'block', marginBottom: '12px', color: '#92400e', fontSize: '10px', fontWeight: '900' }}>지갑 이름<input type="text" value={cashLedger.name || ''} onChange={(event) => updateCashLedger({ name: event.target.value })} placeholder="예: 지갑 1" style={{ width: '100%', boxSizing: 'border-box', marginTop: '6px', padding: '9px 10px', border: '1px solid #fde68a', borderRadius: '9px', background: 'white' }} /></label>}
        <div className="cash-reconciliation-fields">
          <div className="expense-form-field"><label className="expense-form-label" htmlFor="cash-initial-input">여행 전 환전·인출</label><div className="expense-form-amount-control cash-reconciliation-input"><span aria-hidden="true">{getCurrencySymbol(cashLedgerCurrency)}</span><input id="cash-initial-input" type="number" min="0" step="any" inputMode="decimal" value={cashLedger.initial ?? ''} onChange={(e) => updateCashLedger({ initial: e.target.value })} placeholder="0" aria-label={`여행 전 환전·인출 금액(${cashLedgerCurrency})`} /></div></div>
          <div className="expense-form-field"><label className="expense-form-label" htmlFor="cash-additional-input">추가 환전·인출</label><div className="expense-form-amount-control cash-reconciliation-input"><span aria-hidden="true">{getCurrencySymbol(cashLedgerCurrency)}</span><input id="cash-additional-input" type="number" min="0" step="any" inputMode="decimal" value={cashLedger.additional ?? ''} onChange={(e) => updateCashLedger({ additional: e.target.value })} placeholder="0" aria-label={`추가 환전·인출 금액(${cashLedgerCurrency})`} /></div></div>
          <div className="expense-form-field"><label className="expense-form-label" htmlFor="cash-actual-input">실제 남은 현금</label><div className="expense-form-amount-control cash-reconciliation-input"><span aria-hidden="true">{getCurrencySymbol(cashLedgerCurrency)}</span><input id="cash-actual-input" type="number" min="0" step="any" inputMode="decimal" value={cashLedger.actualRemaining ?? ''} onChange={(e) => updateCashLedger({ actualRemaining: e.target.value })} placeholder="확인 후 입력" aria-label={`실제 남은 현금(${cashLedgerCurrency})`} /></div></div>
        </div>
        <div className="cash-reconciliation-summary"><div><span>현금 사용</span><strong>{getCurrencySymbol(cashLedgerCurrency)}{cashUsedAmount.toLocaleString()}</strong></div><div><span>예상 잔액</span><strong>{getCurrencySymbol(cashLedgerCurrency)}{expectedCashBalance.toLocaleString()}</strong></div><div className={cashDifference === null ? '' : cashDifference === 0 ? 'is-matched' : 'is-mismatch'}><span>차이</span><strong>{cashDifference === null ? '실제 잔액 입력 필요' : `${cashDifference >= 0 ? '+' : ''}${getCurrencySymbol(cashLedgerCurrency)}${cashDifference.toLocaleString()}`}</strong></div></div>
        <p className={`cash-reconciliation-status${cashDifference === 0 ? ' is-matched' : cashDifference !== null ? ' is-mismatch' : ''}`} role="status" aria-live="polite">{cashDifference === null ? '실제 남은 현금을 입력하면 예상 잔액과 비교할 수 있어요.' : cashDifference === 0 ? '정산 일치 · 입력한 현금과 예상 잔액이 같습니다.' : `확인 필요 · 실제 잔액이 예상보다 ${getCurrencySymbol(cashLedgerCurrency)}${Math.abs(cashDifference).toLocaleString()} ${cashDifference > 0 ? '많습니다.' : '적습니다.'}`}</p>
        {unassignedPaymentCount > 0 && <p className="cash-reconciliation-note">결제 수단이 지정된 현금 지출만 현금 사용액에 반영됩니다. 아직 결제 수단이 없는 지출 {unassignedPaymentCount}건이 있습니다.</p>}
      </div>
    </div>
  );

  const renderCurrencyManagerPanel = () => (
    <div className="currency-manager-card" style={{ padding: '14px 16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', marginBottom: '18px' }}>
      <div className="currency-manager-panel-heading"><span><strong className="currency-manager-toggle-title">즐겨찾기 통화</strong><span className="currency-manager-toggle-description">지출 입력에서 빠르게 선택할 통화를 관리하세요.</span></span><span className="currency-manager-count">{(favoriteCurrencies || []).length}개</span></div>
      <div className="currency-manager-panel">
        <select value="" onChange={(e) => addFavoriteCurrency(e.target.value)} aria-label="즐겨찾기 통화 추가"><option value="">＋ 통화 추가</option>{SUPPORTED_CURRENCY_CODES.filter(code => !(favoriteCurrencies || []).includes(code)).map(code => <option key={`favorite-currency-option-${code}`} value={code}>{getCurrencySymbol(code)} {getCurrencyNameKO(code)} ({code})</option>)}</select>
        <div className="currency-manager-chips">{(favoriteCurrencies || []).length === 0 ? <span>즐겨찾기 통화가 없습니다.</span> : (favoriteCurrencies || []).map(code => <div key={`favorite-currency-${code}`} className={`currency-manager-chip${expenseCurrencyCode === code ? ' is-selected' : ''}`}><button type="button" onClick={() => setExpenseInput(current => ({ ...current, currency: code }))} title={`${getCurrencyNameKO(code)}를 지출 입력 통화로 선택`}>{getCurrencySymbol(code)} {code}</button><button type="button" onClick={() => removeFavoriteCurrency(code)} aria-label={`${getCurrencyNameKO(code)} 즐겨찾기에서 제거`} title="즐겨찾기에서 제거">×</button></div>)}</div>
      </div>
    </div>
  );

  const exportBudgetStatisticsAsImage = () => {
    if (!activeTrip) return;
    const paymentLabels = { cash: '현금', card: '카드', transfer: '계좌이체', unassigned: '미지정' };
    const paymentColors = { cash: '#10b981', card: '#2563eb', transfer: '#8b5cf6', unassigned: '#f59e0b' };
    const categoryColors = ['#8b5cf6', '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#64748b'];
    const categoryStats = categoryBudgetEntries.filter(category => category.spent > 0);
    const categoryTotalKRW = categoryStats.reduce((sum, category) => sum + category.spent, 0);
    const paymentStats = Object.entries(paymentLabels).map(([key, label]) => ({ key, label, amount: paymentTotalsKRW[key] || 0 }));
    const dailyStats = Object.entries(dailyExpenseTotalsKRW).sort(([first], [second]) => Number(first) - Number(second));
    const exportTextScale = 1.28;
    const categoryRowHeight = 44;
    const analysisPanelHeight = Math.max(500, 150 + Math.max(categoryStats.length, 1) * categoryRowHeight);
    const dailyRowHeight = 46;
    const dailyPanelY = 520 + analysisPanelHeight + 30;
    const dailyPanelHeight = Math.max(210, 105 + Math.max(dailyStats.length, 1) * dailyRowHeight);
    const footerY = dailyPanelY + dailyPanelHeight + 45;
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = footerY + 40;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ctx = context;
    const roundedRect = (x, y, width, height, radius) => {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + width, y, x + width, y + height, radius);
      ctx.arcTo(x + width, y + height, x, y + height, radius);
      ctx.arcTo(x, y + height, x, y, radius);
      ctx.arcTo(x, y, x + width, y, radius);
      ctx.closePath();
    };
    const drawText = (value, x, y, size, color, weight = 600, align = 'left') => {
      ctx.font = `${weight} ${Math.round(size * exportTextScale)}px Arial, "Apple SD Gothic Neo", sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(value), x, y);
    };
    const formatKRW = (value) => `₩${Math.round(Number(value) || 0).toLocaleString('ko-KR')}`;
    const truncate = (value, maxLength = 24) => {
      const text = String(value || '');
      return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
    };
    const drawCard = (x, y, width, height, fill = '#ffffff', stroke = '#e2e8f0') => {
      roundedRect(x, y, width, height, 22);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawCard(40, 36, 1120, 105, '#ffffff', '#e9d5ff');
    drawText('TRAVELPLANER', 72, 78, 17, '#7c3aed', 900);
    drawText(truncate(activeTrip.name || '여행 지출 통계', 34), 72, 116, 28, '#0f172a', 900);
    drawText(`${expenses.length}건 · ${itinerary.length}일`, 1128, 91, 13, '#64748b', 800, 'right');
    drawText('지출 통계 리포트', 1128, 116, 12, '#8b5cf6', 800, 'right');

    const heroGradient = ctx.createLinearGradient(40, 170, 1160, 390);
    heroGradient.addColorStop(0, '#6d28d9');
    heroGradient.addColorStop(1, '#4f46e5');
    roundedRect(40, 170, 1120, 220, 24);
    ctx.fillStyle = heroGradient;
    ctx.fill();
    drawText('총 지출 · 한화 환산', 74, 215, 14, '#ddd6fe', 800);
    drawText(formatKRW(totalSpentKRW), 74, 270, 42, '#ffffff', 900);
    drawText(`일평균 ${formatKRW(averageDailySpendKRW)}`, 76, 310, 14, '#ede9fe', 800);
    drawText('예산 사용률', 1124, 215, 13, '#ddd6fe', 800, 'right');
    drawText(`${budgetProgress.toFixed(1)}%`, 1124, 264, 30, '#ffffff', 900, 'right');
    drawText(`예산 한도 ${formatKRW(budgetSettings.limitKRW)}`, 1124, 300, 13, '#ede9fe', 700, 'right');
    roundedRect(74, 344, 1052, 10, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();
    roundedRect(74, 344, Math.max(10, 1052 * Math.min(budgetProgress, 100) / 100), 10, 5);
    ctx.fillStyle = '#fef08a';
    ctx.fill();
    drawText(budgetSettings.limitKRW - totalSpentKRW >= 0 ? `남은 예산 ${formatKRW(budgetSettings.limitKRW - totalSpentKRW)}` : `예산 초과 ${formatKRW(Math.abs(budgetSettings.limitKRW - totalSpentKRW))}`, 1124, 378, 12, '#fef9c3', 800, 'right');

    const kpiItems = [
      ['기록된 지출', `${expenses.length}건`],
      ['평균 지출', formatKRW(expenses.length ? totalSpentKRW / expenses.length : 0)],
      ['가장 큰 카테고리', categoryStats.length ? `${categoryStats.slice().sort((a, b) => b.spent - a.spent)[0].emoji} ${truncate(categoryStats.slice().sort((a, b) => b.spent - a.spent)[0].label, 13)}` : '기록 없음']
    ];
    kpiItems.forEach(([label, value], index) => {
      const x = 40 + index * 373;
      drawCard(x, 410, 354, 82, '#ffffff', '#e9d5ff');
      drawText(label, x + 18, 441, 11, '#8b7bb5', 800);
      drawText(value, x + 18, 472, 19, '#4c1d95', 900);
    });

    drawCard(40, 520, 680, analysisPanelHeight, '#ffffff', '#e9d5ff');
    drawText('카테고리별 지출 비중', 68, 562, 16, '#5b21b6', 900);
    drawText('원화 환산 기준', 692, 562, 11, '#a78bfa', 800, 'right');
    const donutX = 220;
    const donutY = 730;
    const donutRadius = 132;
    ctx.beginPath();
    ctx.arc(donutX, donutY, donutRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#ede9fe';
    ctx.fill();
    let startAngle = -Math.PI / 2;
    categoryStats.forEach((category, index) => {
      const slice = categoryTotalKRW > 0 ? (category.spent / categoryTotalKRW) * Math.PI * 2 : 0;
      ctx.beginPath();
      ctx.moveTo(donutX, donutY);
      ctx.arc(donutX, donutY, donutRadius, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fillStyle = categoryColors[index % categoryColors.length];
      ctx.fill();
      startAngle += slice;
    });
    ctx.beginPath();
    ctx.arc(donutX, donutY, 82, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    drawText(`${categoryStats.length}개`, donutX, donutY + 2, 22, '#5b21b6', 900, 'center');
    drawText('카테고리', donutX, donutY + 24, 11, '#8b7bb5', 800, 'center');
    if (categoryStats.length === 0) drawText('기록 없음', 220, 875, 12, '#94a3b8', 800, 'center');
    categoryStats.forEach((category, index) => {
      const y = 602 + index * categoryRowHeight;
      const percentage = categoryTotalKRW ? (category.spent / categoryTotalKRW) * 100 : 0;
      ctx.fillStyle = categoryColors[index % categoryColors.length];
      ctx.beginPath();
      ctx.arc(390, y - 4, 6, 0, Math.PI * 2);
      ctx.fill();
      drawText(`${category.emoji} ${truncate(category.label, 18)}`, 407, y, 12, '#475569', 800);
      drawText(`${percentage.toFixed(1)}%`, 682, y, 12, '#6d28d9', 900, 'right');
      drawText(formatKRW(category.spent), 682, y + 17, 10, '#94a3b8', 700, 'right');
    });

    drawCard(740, 520, 420, analysisPanelHeight, '#ffffff', '#e9d5ff');
    drawText('결제 수단별 지출', 768, 562, 16, '#5b21b6', 900);
    drawText('총액 비교', 1132, 562, 11, '#a78bfa', 800, 'right');
    const paymentTotal = paymentStats.reduce((sum, payment) => sum + payment.amount, 0) || 1;
    paymentStats.forEach((payment, index) => {
      const y = 612 + index * 78;
      const percentage = payment.amount / paymentTotal * 100;
      drawText(payment.label, 768, y, 12, '#475569', 800);
      drawText(formatKRW(payment.amount), 1132, y, 12, '#475569', 900, 'right');
      roundedRect(768, y + 14, 364, 9, 5);
      ctx.fillStyle = '#f1f5f9';
      ctx.fill();
      roundedRect(768, y + 14, Math.max(3, 364 * percentage / 100), 9, 5);
      ctx.fillStyle = paymentColors[payment.key];
      ctx.fill();
      drawText(`${percentage.toFixed(1)}%`, 768, y + 45, 10, paymentColors[payment.key], 800);
    });

    drawCard(40, dailyPanelY, 1120, dailyPanelHeight, '#ffffff', '#e9d5ff');
    drawText('일차별 지출', 68, dailyPanelY + 42, 16, '#5b21b6', 900);
    drawText('여행 흐름을 한눈에 확인', 1132, dailyPanelY + 42, 11, '#a78bfa', 800, 'right');
    const maxDailyAmount = Math.max(...dailyStats.map(([, amount]) => amount), 1);
    dailyStats.forEach(([day, amount], index) => {
      const y = dailyPanelY + 82 + index * dailyRowHeight;
      const label = Number(day) === 0 ? '여행 전 준비' : `${day}일차`;
      drawText(label, 68, y, 11, '#64748b', 800);
      roundedRect(180, y - 10, 730, 10, 5);
      ctx.fillStyle = '#f1f5f9';
      ctx.fill();
      roundedRect(180, y - 10, Math.max(8, 730 * amount / maxDailyAmount), 10, 5);
      ctx.fillStyle = '#8b5cf6';
      ctx.fill();
      drawText(formatKRW(amount), 1132, y, 11, '#6d28d9', 900, 'right');
    });
    if (dailyStats.length === 0) drawText('아직 기록된 지출이 없습니다.', 600, dailyPanelY + 85, 12, '#94a3b8', 800, 'center');
    drawText('TravelPlaner · 모든 금액은 저장된 환율 기준으로 원화 환산되었습니다.', 600, footerY, 11, '#94a3b8', 700, 'center');

    const saveImage = (blob) => {
      if (!blob) return;
      const fileName = `${(activeTrip.name || 'travel-plan').replace(/[^\w가-힣-]+/g, '_')}-expense-statistics.png`;
      saveBlobAsFile(blob, fileName);
      setModalConfig({ type: 'success', title: '통계 이미지 저장 완료', message: '현재 지출 통계를 PNG 이미지로 저장했습니다.' });
      setShowCustomModal(true);
    };
    if (canvas.toBlob) canvas.toBlob(saveImage, 'image/png');
    else saveImage(dataUrlToBlob(canvas.toDataURL('image/png')));
  };

  const renderBudgetStatisticsPanel = () => {
    const paymentLabels = { cash: '현금', card: '카드', transfer: '계좌이체', unassigned: '미지정' };
    const paymentColors = { cash: '#10b981', card: '#2563eb', transfer: '#8b5cf6', unassigned: '#f59e0b' };
    const categoryColors = ['#8b5cf6', '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#64748b'];
    const categoryStats = categoryBudgetEntries.filter(category => category.spent > 0);
    const categoryTotalKRW = categoryStats.reduce((sum, category) => sum + category.spent, 0);
    const paymentStats = Object.entries(paymentLabels).map(([key, label]) => ({ key, label, amount: paymentTotalsKRW[key] || 0 }));
    const paymentTotalKRW = paymentStats.reduce((sum, payment) => sum + payment.amount, 0) || 1;
    const dailyStats = Object.entries(dailyExpenseTotalsKRW).sort(([first], [second]) => Number(first) - Number(second));
    let categoryCursor = 0;
    const categoryGradient = categoryTotalKRW > 0
      ? `conic-gradient(${categoryStats.map((category, index) => {
        const start = categoryCursor;
        categoryCursor += (category.spent / categoryTotalKRW) * 100;
        return `${categoryColors[index % categoryColors.length]} ${start}% ${categoryCursor}%`;
      }).join(', ')})`
      : '#ede9fe';
    const topCategory = categoryStats.slice().sort((first, second) => second.spent - first.spent)[0];
    const maxDailyAmount = Math.max(...dailyStats.map(([, amount]) => amount), 1);
    return <div className="budget-statistics-panel" aria-labelledby="budget-statistics-title">
      <div className="budget-stats-header">
        <div><span className="budget-stats-eyebrow">Analytics</span><strong id="budget-statistics-title" className="budget-stats-title">지출 통계</strong><span className="budget-stats-description">여행 지출 흐름과 사용 비중을 한눈에 확인하세요.</span></div>
        <button type="button" className="budget-stats-download" onClick={exportBudgetStatisticsAsImage} disabled={!expenses.length} aria-label="지출 통계를 이미지로 저장"><Download size={14} /> 이미지 저장</button>
      </div>
      <div className="budget-stats-hero">
        <div><span className="budget-stats-hero-label">총 지출 · 한화 환산</span><strong className="budget-stats-hero-total">₩{totalSpentKRW.toLocaleString()}</strong><span className="budget-stats-hero-label">일평균 ₩{averageDailySpendKRW.toLocaleString()}</span></div>
        <div className="budget-stats-hero-budget"><span className="budget-stats-hero-label">예산 사용률</span><strong>{budgetProgress.toFixed(1)}%</strong><span className="budget-stats-hero-label">한도 ₩{Number(budgetSettings.limitKRW || 0).toLocaleString()}</span></div>
        <div className="budget-stats-progress"><span style={{ width: `${budgetProgress}%` }} /></div>
      </div>
      <div className="budget-stats-kpi-grid">
        <div className="budget-stats-kpi"><span>기록된 지출</span><strong>{expenses.length}건</strong></div>
        <div className="budget-stats-kpi"><span>평균 지출</span><strong>₩{Math.round(expenses.length ? totalSpentKRW / expenses.length : 0).toLocaleString()}</strong></div>
        <div className="budget-stats-kpi"><span>가장 큰 카테고리</span><strong>{topCategory ? `${topCategory.emoji} ${topCategory.label}` : '기록 없음'}</strong></div>
      </div>
      <div className="budget-stats-chart-grid">
        <div className="budget-stats-chart-card">
          <div className="budget-stats-section-heading"><strong>카테고리별 지출 비중</strong><span>원화 환산 기준</span></div>
          <div className="budget-stats-category-layout">
            <div className="budget-stats-donut" data-center={`${categoryStats.length}개`} role="img" aria-label={categoryTotalKRW > 0 ? `카테고리별 지출 비중, 총 ${categoryTotalKRW.toLocaleString()}원` : '기록된 카테고리별 지출 없음'} style={{ background: categoryGradient }} />
            <div className="budget-stats-legend">
              {categoryStats.length === 0 ? <div className="budget-stats-empty">아직 기록된 지출이 없습니다.</div> : categoryStats.map((category, index) => <div className="budget-stats-legend-row" key={`category-stat-${category.value}`}><span className="budget-stats-legend-dot" style={{ background: categoryColors[index % categoryColors.length] }} /><span>{category.emoji} {category.label}</span><strong>{((category.spent / categoryTotalKRW) * 100).toFixed(1)}%</strong></div>)}
            </div>
          </div>
        </div>
        <div className="budget-stats-chart-card">
          <div className="budget-stats-section-heading"><strong>결제 수단별 지출</strong><span>총액 비교</span></div>
          <div className="budget-stats-payment-list">
            {paymentStats.map(payment => { const percentage = payment.amount / paymentTotalKRW * 100; return <div key={`payment-stat-${payment.key}`}><div className="budget-stats-payment-row"><span className="budget-stats-payment-name"><span className="budget-stats-legend-dot" style={{ background: paymentColors[payment.key] }} />{payment.label}</span><strong>₩{payment.amount.toLocaleString()}</strong></div><div className="budget-stats-bar"><span style={{ width: `${Math.max(payment.amount ? 2 : 0, percentage)}%`, background: paymentColors[payment.key] }} /></div></div>; })}
          </div>
        </div>
      </div>
      <div className="budget-stats-daily-card">
        <div className="budget-stats-section-heading"><strong>일차별 지출</strong><span>여행 흐름</span></div>
        <div className="budget-stats-daily-list">
          {dailyStats.length === 0 ? <div className="budget-stats-empty">아직 기록된 지출이 없습니다.</div> : dailyStats.map(([day, amount]) => <div className="budget-stats-daily-row" key={`day-stat-${day}`}><span>{Number(day) === 0 ? '여행 전 준비' : `${day}일차`}</span><div className="budget-stats-bar"><span style={{ width: `${Math.max(2, (amount / maxDailyAmount) * 100)}%`, background: '#8b5cf6' }} /></div><strong>₩{amount.toLocaleString()}</strong></div>)}
        </div>
      </div>
      <p style={{ margin: '12px 2px 0', color: '#8b7bb5', fontSize: '9px', fontWeight: '700' }}>모든 금액은 저장된 환율 기준으로 원화 환산되어 표시됩니다.</p>
    </div>;
  };

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
    <div className={`app-container ${!sidebarOpen ? 'sidebar-closed' : ''} ${isReadOnlyTrip ? 'read-only-view' : ''}`}>
      
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
          height: windowSize.width < 768
            ? `${windowSize.height - (sheetMode === 'full' ? mobileSheetTop : 0)}px`
            : undefined,
          transform: windowSize.width < 768
            ? `translateY(${Math.max(mobileSheetTop, Math.min(windowSize.height - 60, (sheetMode === 'full' ? mobileSheetTop : sheetMode === 'half' ? windowSize.height * 0.45 : windowSize.height - 60) + dragOffset))}px)`
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <button onClick={() => supabase.auth.signOut()} style={{ background: '#f3f4f6', border: 'none', color: '#6b7280', fontWeight: '800', fontSize: '10px', cursor: 'pointer', padding: '8px 10px', borderRadius: '10px' }}>로그아웃</button>
                    <button type="button" onClick={requestAccountDeletion} style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', fontWeight: '900', fontSize: '9px', cursor: 'pointer', padding: '7px 9px', borderRadius: '10px' }}>계정 삭제</button>
                  </div>
                ) : (
                  <button onClick={() => openAuthModal('login')} style={{ background: 'white', border: '1px solid #e5e7eb', color: '#4b5563', padding: '8px 12px', borderRadius: '10px', fontWeight: '800', fontSize: '10px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Lock size={12} />
                    로그인 / 회원가입
                  </button>
                )}
              </div>
            </div>

            {!isOnline && (
              <div className="offline-banner" role="status">
                <WifiOff size={14} aria-hidden="true" />
                <span>오프라인 모드 · 변경사항은 이 기기에 먼저 저장됩니다.</span>
              </div>
            )}
            {isReadOnlyTrip && (
              <div className="shared-read-only-banner" role="status">
                <LockKeyhole size={14} aria-hidden="true" />
                <span>공유 일정 읽기 전용</span>
                <button type="button" onClick={() => { setReadOnlySharedTrip(null); setActiveTripId(null); setViewMode('trips'); window.history.replaceState({}, '', window.location.pathname); }}>내 여행으로</button>
              </div>
            )}
            {sharedViewError && !isReadOnlyTrip && (
              <div className="shared-read-only-error" role="alert">
                <Link2 size={14} aria-hidden="true" />
                <span>{sharedViewError}</span>
              </div>
            )}

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
                    style={{ width: '40px', height: '40px', padding: 0, borderRadius: '12px', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s', backgroundColor: viewMode === 'budget' ? '#10b981' : '#f3f4f6', color: viewMode === 'budget' ? 'white' : '#64748b' }}
                    aria-label="예산·지출" title="예산·지출"
                  >
                    <Wallet size={18} />
                  </button>
                  
                  {/* Unified Invite Action */}
                  <div style={{ marginLeft: 'auto' }}>
                    <button 
                      onClick={() => activeTrip?.sharedId ? copySharedTripLink(activeTrip.sharedId, activeTrip.id) : shareTrip(activeTrip.id)}
                      style={{ height: '40px', padding: '0 12px', backgroundColor: activeTrip?.sharedId ? '#f3f4f6' : '#f5f3ff', borderRadius: '12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: activeTrip?.sharedId ? '#6b7280' : '#8b5cf6', fontWeight: '900' }}
                      title={activeTrip?.sharedId ? "공유 링크 복사" : "친구 초대하기"}
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
                      {/* Primary action: start a new trip first. */}
                      <div className="trip-action-grid">
                        <button onClick={createNewTrip} className="trip-action-button" style={{ gridColumn: '1 / -1', minHeight: '64px', fontSize: '15px', color: 'white', backgroundColor: '#8b5cf6', borderColor: '#8b5cf6', boxShadow: '0 10px 15px -3px rgba(139, 92, 246, 0.3)' }}>
                          <PlusCircle size={18} /> 새 여행 계획하기
                        </button>
                      </div>

                      {/* Secondary actions: one clear import entry point and joining a shared trip. */}
                      <div className="trip-action-grid">
                        <button onClick={() => setShowPasteModal(true)} className="trip-action-button" style={{ color: '#4f46e5', backgroundColor: '#f5f7ff', borderColor: '#e0e7ff' }}>
                          <Clipboard size={18} /> AI로 일정 만들기
                        </button>
                        <button onClick={openJoinTripModal} className="trip-action-button" style={{ color: '#059669', backgroundColor: '#f0fdf4', borderColor: '#dcfce7' }}>
                          <Users size={18} /> 참여하기
                        </button>
                        {deferredInstallPrompt && <button onClick={installPwa} className="trip-action-button" style={{ color: '#2563eb', backgroundColor: '#eff6ff', borderColor: '#dbeafe' }}>
                          <Download size={18} /> 앱으로 설치
                        </button>}
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
                    {(trips || []).map(trip => {
                      const tripStatus = getTripStatusMeta(trip);
                      return (
                      <div 
                        key={trip.id} 
                        onClick={() => { setActiveTripId(trip.id); openItinerary(); }}
                        style={{ padding: '24px', backgroundColor: activeTripId === trip.id ? '#f5f3ff' : 'white', border: activeTripId === trip.id ? '2px solid #ddd6fe' : '1px solid #f3f4f6', borderRadius: '20px', cursor: 'pointer', transition: '0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                          {editingTripId === trip.id && !showEditTripModal ? (
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
                                      {COUNTRY_OPTIONS
                                        .filter(c => c !== "대한민국")
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
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', flex: 1, minWidth: 0 }}>
                                <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#111827', margin: 0, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {trip.name}
                                </h3>
                                <span
                                  role="status"
                                  aria-label={`${trip.name} 상태: ${tripStatus.label}`}
                                  title={`여행 상태: ${tripStatus.label}`}
                                  style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: '999px', backgroundColor: tripStatus.backgroundColor, color: tripStatus.color, fontSize: '10px', fontWeight: '900', whiteSpace: 'nowrap' }}
                                >
                                  {tripStatus.label}
                                </span>
                              </div>
                              
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
                                    aria-label={trip.sharedId ? `${trip.name} 공유 링크 복사` : `${trip.name} 친구 초대`}
                                    onClick={(e) => { e.stopPropagation(); trip.sharedId ? copySharedTripLink(trip.sharedId, trip.id) : shareTrip(trip.id); }}
                                    style={{ width: '36px', height: '36px', borderRadius: '10px', border: 'none', backgroundColor: trip.sharedId ? '#f3f4f6' : '#f5f3ff', color: trip.sharedId ? '#6b7280' : '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                                    title={trip.sharedId ? "공유 링크 복사" : "친구 초대하기"}
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
                              <span style={{ color: '#111827' }}>총 지출 ₩ {(trip.expenses || []).reduce((sum, e) => sum + getExpenseAmountKRW(e.amount, e.currency, trip.budgetSettings), 0).toLocaleString()}</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '18px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                            <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: '800' }}>{(trip.itinerary || []).reduce((sum, day) => sum + (day.items || []).length, 0)}개 일정</span>
                            <button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); setActiveTripId(trip.id); openItinerary(); }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 12px', border: 'none', borderRadius: '10px', backgroundColor: '#eff6ff', color: '#2563eb', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}
                            >
                              <Calendar size={14} /> 일정 보기
                            </button>
                        </div>
                      </div>
                      );
                    })}
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
                  Object.entries(groupedFavorites).map(([country, regionGroups]) => {
                    const countryPlaces = Object.values(regionGroups).flat();
                    return (
                      <div key={`country-${country}`} style={{ marginBottom: '20px' }}>
                        <button
                          type="button"
                          aria-expanded={Boolean(expandedCountries[country])}
                          onClick={() => toggleCountry(country)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', backgroundColor: '#fef2f2', border: 'none', borderRadius: '16px', cursor: 'pointer', marginBottom: '12px', textAlign: 'left', font: 'inherit' }}
                        >
                          <span style={{ fontSize: '16px', fontWeight: '900', color: '#ef4444', margin: 0 }}>{country}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '800', color: '#f87171' }}>{countryPlaces.length} 장소</span>
                            <ChevronRight size={18} color="#f87171" style={{ transform: expandedCountries[country] ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.2s' }} />
                          </span>
                        </button>

                        {expandedCountries[country] && (
                          <div style={{ paddingLeft: '12px', borderLeft: '2px solid #fecaca', marginLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {Object.entries(regionGroups).map(([region, places]) => {
                              const regionKey = `${country}::${region}`;
                              return (
                                <div key={`region-${regionKey}`}>
                                  <button
                                    type="button"
                                    aria-expanded={Boolean(expandedRegions[regionKey])}
                                    onClick={() => toggleRegion(country, region)}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', backgroundColor: '#fff7f7', border: '1px solid #fee2e2', borderRadius: '12px', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
                                  >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                      <MapPin size={14} color="#f87171" style={{ flexShrink: 0 }} />
                                      <span style={{ fontSize: '13px', fontWeight: '900', color: '#b91c1c', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{region}</span>
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                      <span style={{ fontSize: '11px', fontWeight: '800', color: '#f87171' }}>{places.length} 장소</span>
                                      <ChevronRight size={16} color="#f87171" style={{ transform: expandedRegions[regionKey] ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.2s' }} />
                                    </span>
                                  </button>

                                  {expandedRegions[regionKey] && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0 0 8px' }}>
                                      {places.map((loc) => (
                                        <div
                                          key={`fav-list-${loc.id || loc.name}`}
                                          onClick={() => {
                                            setSelectedPlace(loc);
                                            map?.panTo({ lat: loc.lat, lng: loc.lng });
                                            map?.setZoom(18);
                                          }}
                                          style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', backgroundColor: selectedPlace?.name === loc.name ? '#fef2f2' : 'transparent', borderRadius: '12px', cursor: 'pointer', border: '1px solid transparent' }}
                                        >
                                          <div style={{ width: '42px', height: '42px', backgroundColor: 'white', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '21px', border: '1px solid #f3f4f6', flexShrink: 0 }}>{loc.emoji}</div>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <h3 style={{ fontSize: '13px', fontWeight: '800', color: '#111827', margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</h3>
                                            <p style={{ fontSize: '10px', fontWeight: '700', color: '#9ca3af', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.loc}</p>
                                          </div>
                                          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                            {activeTripId && !isReadOnlyTrip && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  addToItinerary(loc);
                                                }}
                                                style={{ padding: '8px', backgroundColor: '#eff6ff', border: 'none', color: '#3b82f6', borderRadius: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                title={`${activeDay}일차 일정에 추가`}
                                              >
                                                <Plus size={16} />
                                              </button>
                                            )}
                                            <button
                                              onClick={(e) => { e.stopPropagation(); toggleFavorite(loc); }}
                                              style={{ padding: '8px', backgroundColor: '#fef2f2', border: 'none', color: '#ef4444', borderRadius: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                              title="즐겨찾기에서 제거"
                                            >
                                              <Heart size={16} fill="currentColor" />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
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
                        className="read-only-hide"
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
                      className="read-only-hide"
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
                    <button
                      className="read-only-hide"
                      onClick={handleUploadJson}
                      type="button"
                      aria-label="여행 데이터 백업 복원"
                      title="백업 JSON 파일에서 여행 데이터 복원"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '800', color: '#64748b', backgroundColor: '#f8fafc', padding: '8px 12px', borderRadius: '14px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      <Upload size={14} /> 백업 복원
                    </button>
                </div>
                </div>

                <p className="itinerary-read-only-note"><LockKeyhole size={13} style={{ verticalAlign: '-2px', marginRight: '4px' }} />읽기 전용 공유 일정입니다. 일정과 지출은 확인만 할 수 있습니다.</p>

                {todayItinerarySummary && (
                  <div className="today-next-card" style={{ marginBottom: '18px', padding: '16px 18px', borderRadius: '18px', background: 'linear-gradient(135deg, #eff6ff, #f8fafc)', border: '1px solid #dbeafe' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <strong style={{ color: '#1d4ed8', fontSize: '13px' }}>오늘의 일정</strong>
                      {todayItinerarySummary.status === 'ongoing' && <span style={{ color: '#2563eb', fontSize: '11px', fontWeight: '900' }}>{todayItinerarySummary.day}일차</span>}
                    </div>
                    {todayItinerarySummary.status !== 'ongoing' ? (
                      <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '12px', fontWeight: '700' }}>오늘 날짜에 해당하는 여행 일정이 없습니다.</p>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                        {todayItinerarySummary.currentItem && <span style={{ padding: '7px 9px', background: 'white', borderRadius: '10px', color: '#475569', fontSize: '11px', fontWeight: '800' }}>진행/지난 · {todayItinerarySummary.currentItem.displayName || todayItinerarySummary.currentItem.name}</span>}
                        {todayItinerarySummary.nextItem ? <span style={{ padding: '7px 9px', background: '#2563eb', borderRadius: '10px', color: 'white', fontSize: '11px', fontWeight: '800' }}>다음 · {todayItinerarySummary.nextItem.time} {todayItinerarySummary.nextItem.displayName || todayItinerarySummary.nextItem.name}</span> : <span style={{ padding: '7px 9px', background: 'white', borderRadius: '10px', color: '#64748b', fontSize: '11px', fontWeight: '800' }}>오늘 일정이 끝났어요.</span>}
                      </div>
                    )}
                  </div>
                )}

                <div className="itinerary-tools" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '18px' }}>
                  <button type="button" className="read-only-hide" onClick={() => { setIsBulkMoveMode(mode => !mode); setSelectedItineraryItems([]); }} style={{ padding: '8px 11px', border: 'none', borderRadius: '12px', background: isBulkMoveMode ? '#dbeafe' : '#f8fafc', color: '#2563eb', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>{isBulkMoveMode ? '일괄 이동 닫기' : '일정 일괄 이동'}</button>
                  <button type="button" className="read-only-hide" onClick={() => setShowChecklist(show => !show)} style={{ padding: '8px 11px', border: 'none', borderRadius: '12px', background: showChecklist ? '#dcfce7' : '#f8fafc', color: '#15803d', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>여행 준비 체크리스트</button>
                  {undoStack.length > 0 && <button type="button" className="read-only-hide" onClick={undoLastChange} style={{ padding: '8px 11px', border: 'none', borderRadius: '12px', background: '#fff7ed', color: '#c2410c', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>실행 취소</button>}
                </div>

                {isBulkMoveMode && (
                  <div className="bulk-move-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '12px', marginBottom: '18px', background: '#f8fbff', border: '1px solid #bfdbfe', borderRadius: '14px' }}>
                    <span style={{ color: '#1d4ed8', fontSize: '11px', fontWeight: '900' }}>{selectedItineraryItems.length}개 선택</span>
                    <select value={bulkMoveTargetDay === 'reserve' ? 'reserve' : String(bulkMoveTargetDay)} onChange={(event) => setBulkMoveTargetDay(event.target.value === 'reserve' ? 'reserve' : Number(event.target.value))} aria-label="선택 일정 이동 대상" style={{ padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: '9px', background: 'white', color: '#1d4ed8', fontSize: '11px', fontWeight: '800' }}>
                      <option value="reserve">예비 목록으로 이동</option>
                      {itinerary.map(dayPlan => <option key={`bulk-day-${dayPlan.day}`} value={String(parseDay(dayPlan.day))}>{parseDay(dayPlan.day)}일차로 이동</option>)}
                    </select>
                    <button type="button" onClick={moveSelectedItineraryItems} disabled={selectedItineraryItems.length === 0} style={{ padding: '8px 11px', border: 'none', borderRadius: '9px', background: selectedItineraryItems.length ? '#2563eb' : '#cbd5e1', color: 'white', fontSize: '11px', fontWeight: '900', cursor: selectedItineraryItems.length ? 'pointer' : 'default' }}>이동</button>
                  </div>
                )}

                {showChecklist && (
                  <div className="travel-checklist-card" style={{ padding: '16px', marginBottom: '22px', border: '1px solid #bbf7d0', borderRadius: '16px', background: '#f0fdf4' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '10px' }}><strong style={{ color: '#166534', fontSize: '13px' }}>여행 준비 체크리스트</strong><span style={{ color: '#16a34a', fontSize: '11px', fontWeight: '800' }}>{(activeTrip?.checklist || []).filter(item => item.checked).length}/{(activeTrip?.checklist || []).length}</span></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                      {(activeTrip?.checklist || getDefaultChecklist()).map(item => <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontSize: '12px', fontWeight: '700' }}><input type="checkbox" checked={Boolean(item.checked)} onChange={() => toggleChecklistItem(item.id)} disabled={isReadOnlyTrip} /> <span style={{ textDecoration: item.checked ? 'line-through' : 'none' }}>{item.label}</span></label>)}
                    </div>
                    {!isReadOnlyTrip && <div style={{ display: 'flex', gap: '7px', marginTop: '11px' }}><input value={checklistDraft} onChange={(event) => setChecklistDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addChecklistItem(); }} placeholder="준비물 추가" style={{ flex: 1, minWidth: 0, padding: '8px 10px', border: '1px solid #bbf7d0', borderRadius: '9px', background: 'white' }} /><button type="button" onClick={addChecklistItem} style={{ padding: '8px 11px', border: 'none', borderRadius: '9px', background: '#16a34a', color: 'white', fontWeight: '900', cursor: 'pointer' }}>추가</button></div>}
                  </div>
                )}

                {/* Reserve list: places saved before assigning them to a day. */}
                <div
                  className="itinerary-reserve-card"
                  onClick={() => setActiveDay('reserve')}
                  style={{
                    backgroundColor: activeDay === 'reserve' ? '#eff6ff' : 'white',
                    borderRadius: '24px',
                    border: `1px solid ${activeDay === 'reserve' ? '#93c5fd' : '#dbeafe'}`,
                    boxShadow: '0 4px 20px rgba(37, 99, 235, 0.08)',
                    overflow: 'hidden',
                    marginBottom: '32px',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ padding: '20px 24px', backgroundColor: activeDay === 'reserve' ? '#dbeafe' : '#eff6ff', borderBottom: '1px solid #dbeafe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '14px', backgroundColor: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Star size={21} fill="currentColor" />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: 0, color: '#1e3a8a', fontSize: '17px', fontWeight: '900' }}>예비 목록</h3>
                        <p style={{ margin: '4px 0 0', color: '#2563eb', fontSize: '11px', fontWeight: '700' }}>일차를 정하기 전 잠시 보관하는 장소</p>
                      </div>
                    </div>
                    <span style={{ flexShrink: 0, padding: '7px 10px', borderRadius: '10px', backgroundColor: 'white', color: '#2563eb', fontSize: '11px', fontWeight: '900' }}>{reserveItems.length} 장소</span>
                  </div>

                  <div onClick={(event) => event.stopPropagation()} style={{ padding: '20px 24px' }}>
                    {reserveItems.length === 0 ? (
                      <div style={{ padding: '24px 16px', textAlign: 'center', border: '2px dashed #bfdbfe', borderRadius: '16px' }}>
                        <p style={{ margin: 0, color: '#2563eb', fontSize: '12px', fontWeight: '800' }}>장소 추가 창에서 예비 목록을 선택해 보관할 수 있습니다.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {reserveItems.map((item, reserveIndex) => {
                          const reserveDeleteId = `reserve-${item.id}`;
                          return (
                            <div key={item.id} className="reserve-item-card" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '14px', backgroundColor: 'white', border: '1px solid #dbeafe', borderRadius: '18px', boxShadow: '0 2px 8px rgba(37, 99, 235, 0.05)' }}>
                              <div aria-label={`${reserveIndex + 1}번째 예비 장소`} style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: '900', flexShrink: 0 }}>{reserveIndex + 1}</div>
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
                              <div className="read-only-hide" style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 230px', justifyContent: 'flex-end' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '10px', overflow: 'hidden' }}>
                                  <button type="button" aria-label="예비 장소 위로 이동" onClick={() => moveReserveItem(item.id, 'up')} disabled={reserveIndex === 0} style={{ width: '28px', height: '20px', padding: 0, border: 'none', background: 'transparent', color: reserveIndex === 0 ? '#bfdbfe' : '#2563eb', cursor: reserveIndex === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronUp size={14} /></button>
                                  <button type="button" aria-label="예비 장소 아래로 이동" onClick={() => moveReserveItem(item.id, 'down')} disabled={reserveIndex === reserveItems.length - 1} style={{ width: '28px', height: '20px', padding: 0, border: 'none', borderTop: '1px solid #dbeafe', background: 'transparent', color: reserveIndex === reserveItems.length - 1 ? '#bfdbfe' : '#2563eb', cursor: reserveIndex === reserveItems.length - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronDown size={14} /></button>
                                </div>
                                <select value="" aria-label={`${item.displayName || item.name || '예비 장소'} 일차로 이동`} onChange={(event) => moveReserveItemToDay(item.id, event.target.value)} onClick={(event) => event.stopPropagation()} style={{ minWidth: '116px', maxWidth: '140px', padding: '8px 8px', border: '1px solid #bfdbfe', borderRadius: '10px', backgroundColor: '#f8fbff', color: '#1d4ed8', fontSize: '11px', fontWeight: '800', outline: 'none' }}>
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
                            className="read-only-hide"
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

                    {getDayConflictWarnings(dayPlan).length > 0 && <div className="itinerary-conflict-warning" role="status" style={{ margin: '12px 24px 0', padding: '10px 12px', borderRadius: '12px', background: '#fff7ed', color: '#c2410c', fontSize: '11px', fontWeight: '800' }}>시간·이동 확인: {getDayConflictWarnings(dayPlan)[0]}{getDayConflictWarnings(dayPlan).length > 1 ? ` 외 ${getDayConflictWarnings(dayPlan).length - 1}건` : ''}</div>}

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
                                  {isBulkMoveMode && <input className="itinerary-bulk-checkbox" type="checkbox" checked={selectedItineraryItems.includes(item.id)} onChange={() => toggleItineraryItemSelection(item.id)} onClick={(event) => event.stopPropagation()} aria-label={`${item.displayName || item.name || '일정'} 선택`} style={{ width: '16px', height: '16px', flexShrink: 0 }} />}
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
                                      {(item.reservationNumber || item.memo || item.reservationUrl) && <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '5px' }}>
                                        {item.reservationNumber && <span style={{ padding: '3px 6px', borderRadius: '6px', background: '#fef3c7', color: '#92400e', fontSize: '9px', fontWeight: '800' }}>예약 {item.reservationNumber}</span>}
                                        {item.memo && <span style={{ padding: '3px 6px', borderRadius: '6px', background: '#f1f5f9', color: '#64748b', fontSize: '9px', fontWeight: '800', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>메모 {item.memo}</span>}
                                        {getSafeExternalUrl(item.reservationUrl) && <a href={getSafeExternalUrl(item.reservationUrl)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} style={{ padding: '3px 6px', borderRadius: '6px', background: '#eff6ff', color: '#2563eb', fontSize: '9px', fontWeight: '800' }}>예약 링크</a>}
                                      </div>}
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
                                    <div className="itinerary-order-control" style={{
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
                                      className="itinerary-edit-control"
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
                                      className="itinerary-navigation-control"
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
                                    <div className="itinerary-delete-control" style={{ position: 'relative', width: '44px', height: '44px' }}>
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

                <div role="tablist" aria-label="예산 및 지출 설정 메뉴" style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '18px' }}>
                  {budgetPanelItems.map(panel => {
                    const isActive = budgetPanel === panel.key;
                    return <button key={`budget-panel-${panel.key}`} type="button" role="tab" aria-selected={isActive} onClick={() => setBudgetPanel(isActive ? null : panel.key)} style={{ padding: '8px 11px', border: isActive ? `1px solid ${panel.activeColor}` : '1px solid transparent', borderRadius: '12px', background: isActive ? panel.activeBackground : '#f8fafc', color: isActive ? panel.activeColor : '#64748b', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>{panel.label}</button>;
                  })}
                  {undoStack.length > 0 && <button type="button" className="read-only-hide" onClick={undoLastChange} style={{ padding: '8px 11px', border: '1px solid transparent', borderRadius: '12px', background: '#fff7ed', color: '#c2410c', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>실행 취소</button>}
                </div>

                {budgetPanel === 'exchange' && (
                  <div className="budget-settings-panel" style={{ padding: '14px 16px', marginBottom: '18px', border: '1px solid #bfdbfe', borderRadius: '16px', background: '#f8fbff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '10px' }}><strong style={{ color: '#1d4ed8', fontSize: '13px' }}>환율 기준일·수동 환율</strong><span style={{ color: '#64748b', fontSize: '10px', fontWeight: '700' }}>{budgetSettings.exchangeRateSource || exchangeRateInfo.source} · {budgetSettings.exchangeRateReferenceDate || exchangeRateInfo.date || '오늘'}</span></div>
                    <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: '10px', lineHeight: 1.5 }}>1 외화가 몇 원인지 입력하면 자동 환율보다 우선해 정산합니다. 실제 환전 영수증 기준으로 조정할 때 사용하세요.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {expenseCurrencyChoices.filter(code => code !== 'KRW').map(code => {
                        const manualValue = budgetSettings.exchangeRates?.[code]?.krwPerUnit ?? '';
                        return <label key={`manual-rate-${code}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontSize: '11px', fontWeight: '800' }}><span style={{ minWidth: '70px' }}>{getCurrencySymbol(code)} {code}</span><input type="number" min="0" step="any" value={manualValue} onChange={(event) => saveBudgetSettings({ ...budgetSettings, exchangeRates: { ...(budgetSettings.exchangeRates || {}), [code]: { krwPerUnit: event.target.value === '' ? '' : Number(event.target.value) } }, exchangeRateSource: '수동 환율', exchangeRateReferenceDate: formatLocalDate(new Date()) })} placeholder={getEffectiveExchangeRate(code, exchangeRates, {}) ? `자동 ${getEffectiveExchangeRate(code, exchangeRates, {}).toLocaleString()}원` : '예: 18.5'} style={{ flex: 1, minWidth: 0, padding: '8px 9px', border: '1px solid #dbeafe', borderRadius: '9px', background: 'white' }} /><span style={{ color: '#64748b', fontSize: '10px' }}>원/1단위</span></label>;
                      })}
                    </div>
                  </div>
                )}

                {budgetPanel === 'category' && (
                  <div className="budget-settings-panel" style={{ padding: '14px 16px', marginBottom: '18px', border: '1px solid #fde68a', borderRadius: '16px', background: '#fffbeb' }}>
                    <strong style={{ color: '#92400e', fontSize: '13px' }}>카테고리별 예산</strong>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                      {categoryBudgetEntries.map(category => <label key={`category-budget-${category.value}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontSize: '11px', fontWeight: '800' }}><span style={{ flex: 1 }}>{category.emoji} {category.label} <small style={{ color: '#94a3b8' }}>사용 ₩{category.spent.toLocaleString()}</small></span><span>₩</span><input type="number" min="0" step="1000" value={category.budget || ''} onChange={(event) => saveBudgetSettings({ ...budgetSettings, categoryBudgets: { ...(budgetSettings.categoryBudgets || {}), [category.value]: event.target.value === '' ? 0 : Number(event.target.value) } })} placeholder="한도 없음" style={{ width: '104px', padding: '8px 9px', border: '1px solid #fde68a', borderRadius: '9px', background: 'white' }} /></label>)}
                    </div>
                  </div>
                )}

                {budgetPanel === 'cash' && renderCashReconciliationPanel()}
                {budgetPanel === 'exchange' && renderCurrencyManagerPanel()}
                {budgetPanel === 'stats' && renderBudgetStatisticsPanel()}

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
                      <label className="expense-form-label">사용 일차</label>
                      {useExpenseDayChoices ? (
                        <ExpenseChoiceGroup
                          options={expenseDayChoices}
                          value={expenseInput.day}
                          onChange={(day) => setExpenseInput(current => ({ ...current, day }))}
                          ariaLabel="지출 사용 일차"
                          className="expense-day-choice-group"
                          scrollable
                        />
                      ) : (
                        <select
                          id="expense-day-select"
                          className="expense-form-control"
                          value={expenseInput.day}
                          onChange={e => setExpenseInput({ ...expenseInput, day: e.target.value })}
                          aria-label="지출 사용 일차"
                        >
                          {expenseDayChoices.map(day => <option key={`opt-day-${day.value}`} value={day.value}>{day.label}</option>)}
                        </select>
                      )}
                    </div>
                  </div>

                  <div className="expense-form-row expense-form-description-time">
                    <div className="expense-form-field expense-form-description-field" style={{ flex: '1 1 0' }}>
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
                    <div className="expense-form-field expense-form-time-field" style={{ flex: '1 1 0' }}>
                      <ScrollTimeInput
                        value={expenseInput.time}
                        onChange={(newTime) => setExpenseInput(current => ({ ...current, time: newTime }))}
                        label="소비 시간"
                        compact
                      />
                    </div>
                  </div>

                  <div className="expense-form-row">
                    <div className="expense-form-field" style={{ flex: '1 1 100%' }}>
                      <label className="expense-form-label">지출 카테고리</label>
                      <ExpenseChoiceGroup
                        options={EXPENSE_CATEGORIES}
                        value={expenseInput.category || 'other'}
                        onChange={(category) => setExpenseInput(current => ({ ...current, category }))}
                        ariaLabel="지출 카테고리"
                        className="expense-category-choice-group"
                      />
                    </div>
                  </div>

                  <div className="expense-form-row expense-form-currency-payment-amount">
                    <div className="expense-form-field expense-form-currency-field">
                      <label className="expense-form-label">사용 통화</label>
                      <div className={`expense-currency-choice-row${expenseCurrencyAdditionalChoices.length > 0 ? ' has-additional' : ''}`}>
                        <ExpenseChoiceGroup
                          options={expenseCurrencyQuickOptions}
                          value={expenseCurrencyQuickValue}
                          onChange={(currency) => setExpenseInput(current => ({ ...current, currency }))}
                          ariaLabel="빠른 지출 입력 통화"
                          className="expense-currency-choice-group"
                        />
                        {expenseCurrencyAdditionalChoices.length > 0 && (
                          <ExpenseCurrencyPicker
                            value={expenseCurrencyAdditionalValue}
                            options={expenseCurrencyAdditionalChoices}
                            onChange={currency => setExpenseInput(current => ({ ...current, currency }))}
                            placeholder="추가 선택"
                            ariaLabel="추가 통화에서 지출 입력 통화 선택"
                            className="expense-currency-more-picker"
                          />
                        )}
                      </div>
                    </div>
                    <div className="expense-form-field">
                      <label className="expense-form-label">결제 수단</label>
                      <ExpenseChoiceGroup
                        options={PAYMENT_METHODS}
                        value={expenseInput.paymentMethod}
                        onChange={(paymentMethod) => setExpenseInput(current => ({ ...current, paymentMethod }))}
                        ariaLabel="지출 결제 수단"
                        className="expense-payment-choice-group"
                      />
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
                      const daySubtotalKRW = dayExpenses.reduce((sum, expense) => sum + getExpenseAmountKRW(expense.amount, expense.currency), 0);
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
                              const amountKRW = getExpenseAmountKRW(exp.amount, exp.currency);
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
                                    <span style={{ fontSize: '10px', fontWeight: '800', color: '#475569', whiteSpace: 'nowrap' }}>{getExpenseCategoryEmoji(exp.category)} {getExpenseCategoryLabel(exp.category)}</span>
                                    <span className={`expense-payment-badge${exp.paymentMethod ? ` is-${exp.paymentMethod}` : ' is-unassigned'}`}>
                                      {getPaymentMethodLabel(exp.paymentMethod)}
                                    </span>
                                    {expenseCurrency !== 'KRW' && (
                                      <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', whiteSpace: 'nowrap' }}>
                                        현지 {getCurrencySymbol(expenseCurrency)}{localAmount.toLocaleString()} ({expenseCurrency})
                                      </span>
                                    )}
                                    {exp.memo && <span style={{ fontSize: '10px', color: '#94a3b8', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>메모: {exp.memo}</span>}
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

                {budgetPanel === '__legacy_bottom_panels_disabled__' && (<>
                {/* Legacy bottom panels kept out of the layout; the same controls are now in the top menu. */}
                {/* Cash Reconciliation */}
                <div className="cash-reconciliation-card" style={{ padding: '16px', backgroundColor: '#fffaf0', border: '1px solid #fde68a', borderRadius: '16px', marginTop: '24px', marginBottom: '16px' }}>
                  <button
                    type="button"
                    className="cash-reconciliation-toggle"
                    onClick={() => setBudgetPanel(panel => panel === 'cash' ? null : 'cash')}
                    aria-expanded={budgetPanel === 'cash'}
                    aria-controls="cash-reconciliation-panel"
                  >
                    <span>
                      <strong className="cash-reconciliation-toggle-title">현금 정산</strong>
                      <span className="cash-reconciliation-toggle-description">환전·인출한 금액과 현금 지출을 비교해 잔액을 확인하세요.</span>
                    </span>
                    <span className={`cash-reconciliation-status-chip${cashDifference === null ? ' is-pending' : cashDifference === 0 ? ' is-matched' : ' is-mismatch'}`}>
                      {cashDifference === null ? '입력 필요' : cashDifference === 0 ? '정산 일치' : '확인 필요'}
                      <ChevronDown size={15} className={budgetPanel === 'cash' ? 'is-open' : ''} aria-hidden="true" />
                    </span>
                  </button>

                  {budgetPanel === 'cash' && (
                    <div id="cash-reconciliation-panel" className="cash-reconciliation-panel">
                      <div className="cash-reconciliation-panel-heading">
                        <span>정산 통화</span>
                        <select
                          value={cashLedgerCurrency}
                          onChange={(e) => { const wallet = cashWallets.find(candidate => candidate.currency === e.target.value); setCashWalletId(wallet?.id || null); saveBudgetSettings({ ...budgetSettings, cashLedgerCurrency: e.target.value }); }}
                          aria-label="현금 정산 통화"
                        >
                          {cashCurrencyChoices.map(code => (
                            <option key={`cash-ledger-currency-${code}`} value={code}>
                              {getCurrencySymbol(code)} {getCurrencyNameKO(code)} ({code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                        <span style={{ color: '#92400e', fontSize: '10px', fontWeight: '900' }}>통화별 현금 지갑</span>
                        {cashWallets.map(wallet => <button key={`cash-wallet-${wallet.id}`} type="button" onClick={() => { setCashWalletId(wallet.id); saveBudgetSettings({ ...budgetSettings, cashLedgerCurrency: wallet.currency }); }} style={{ padding: '6px 8px', border: `1px solid ${activeCashWalletId === wallet.id ? '#f59e0b' : '#fde68a'}`, borderRadius: '8px', background: activeCashWalletId === wallet.id ? '#fef3c7' : 'white', color: '#92400e', fontSize: '10px', fontWeight: '800', cursor: 'pointer' }}>{wallet.name} · {wallet.currency}</button>)}
                        {!isReadOnlyTrip && <button type="button" onClick={addCashWallet} style={{ padding: '6px 8px', border: '1px dashed #f59e0b', borderRadius: '8px', background: 'transparent', color: '#b45309', fontSize: '10px', fontWeight: '900', cursor: 'pointer' }}>+ 지갑 추가</button>}
                      </div>

                      {activeCashWalletId && <label style={{ display: 'block', marginBottom: '12px', color: '#92400e', fontSize: '10px', fontWeight: '900' }}>지갑 이름
                        <input type="text" value={cashLedger.name || ''} onChange={(event) => updateCashLedger({ name: event.target.value })} placeholder="예: 지갑 1" style={{ width: '100%', boxSizing: 'border-box', marginTop: '6px', padding: '9px 10px', border: '1px solid #fde68a', borderRadius: '9px', background: 'white' }} />
                      </label>}

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
                    onClick={() => setBudgetPanel(panel => panel === 'currency' ? null : 'currency')}
                    aria-expanded={budgetPanel === 'currency'}
                    aria-controls="currency-manager-panel"
                  >
                    <span>
                      <strong className="currency-manager-toggle-title">즐겨찾기 통화</strong>
                      <span className="currency-manager-toggle-description">지출 입력에서 빠르게 선택할 통화를 관리하세요.</span>
                    </span>
                    <span className="currency-manager-count">{(favoriteCurrencies || []).length}개 <ChevronDown size={15} className={budgetPanel === 'currency' ? 'is-open' : ''} aria-hidden="true" /></span>
                  </button>

                  {budgetPanel === 'currency' && (
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
                </>)}
              </>
            )}

          </div>

          {/* Footer */}
        <div style={{ padding: '18px 32px', borderTop: '1px solid #f3f4f6', backgroundColor: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
              <span style={{ fontSize: "11px", fontWeight: "900", color: "#111827", letterSpacing: "0.05em" }}>{(favorites || []).length} 저장 • {totalSpots} 일정</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '9px', fontWeight: '800' }}>
                <a href="/privacy.html" style={{ color: '#64748b', textDecoration: 'none' }}>개인정보처리방침</a>
                <span aria-hidden="true" style={{ color: '#cbd5e1' }}>·</span>
                <a href="/support.html" style={{ color: '#64748b', textDecoration: 'none' }}>지원</a>
              </span>
            </div>
            <span style={{ fontSize: "10px", fontWeight: "800", color: !isOnline || syncStatus === "offline" ? "#d97706" : syncStatus === "error" ? "#ef4444" : syncStatus === "saving" ? "#f59e0b" : "#10b981" }}>{!isOnline || syncStatus === "offline" ? "오프라인 저장" : isLoadingDB ? "동기화 중…" : syncStatus === "saving" ? "저장 중…" : syncStatus === "error" ? "로컬 저장됨" : "저장됨"}</span>
            <button onClick={() => setSidebarOpen(false)} style={{ fontSize: '11px', fontWeight: '900', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.05em' }}>닫기</button>
          </div>
        </aside>

        {syncConflictNotice && (
          <div className="sync-conflict-banner" role="status" aria-live="polite">
            <span className="sync-conflict-banner-icon" aria-hidden="true"><AlertCircle size={16} /></span>
            <span className="sync-conflict-banner-content">
              <strong>기기 간 변경사항 동기화</strong>
              <span>여행 데이터 {syncConflictNotice.conflicts}건을 최신 변경 기준으로 정리했습니다.</span>
            </span>
            <button type="button" onClick={dismissSyncConflictNotice}>확인</button>
          </div>
        )}

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
              <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '900', color: '#a78bfa' }}>공유 링크 복사됨</h4>
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

      {showAccountDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-delete-modal-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeAccountDeleteModal();
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 14500, backgroundColor: 'rgba(15, 23, 42, 0.58)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <form
            onSubmit={handleDeleteAccount}
            style={{ width: '100%', maxWidth: '430px', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', position: 'relative', padding: '28px 24px', borderRadius: '26px', backgroundColor: 'white', boxShadow: '0 25px 60px rgba(15, 23, 42, 0.3)' }}
          >
            <button
              type="button"
              aria-label="계정 삭제 창 닫기"
              onClick={closeAccountDeleteModal}
              disabled={isDeletingAccount}
              style={{ position: 'absolute', top: '18px', right: '18px', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '50%', backgroundColor: '#f1f5f9', color: '#64748b', cursor: isDeletingAccount ? 'not-allowed' : 'pointer' }}
            >
              <X size={18} />
            </button>
            <div style={{ width: '46px', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px', borderRadius: '15px', backgroundColor: '#fff1f2', color: '#e11d48' }}>
              <Trash2 size={22} />
            </div>
            <h2 id="account-delete-modal-title" style={{ margin: 0, color: '#0f172a', fontSize: '22px', fontWeight: '900', letterSpacing: '-0.04em' }}>계정을 영구 삭제할까요?</h2>
            <p style={{ margin: '10px 0 0', color: '#475569', fontSize: '12px', fontWeight: '700', lineHeight: 1.65 }}>
              <strong>{session?.user?.email || '현재 로그인 계정'}</strong>의 인증 계정, 클라우드에 동기화된 여행 데이터와 이 계정에서 만든 공유 일정이 삭제됩니다.
            </p>
            <div style={{ margin: '16px 0', padding: '13px 14px', borderRadius: '14px', backgroundColor: '#fff7ed', color: '#9a3412', fontSize: '11px', fontWeight: '800', lineHeight: 1.55 }}>
              삭제한 클라우드 데이터는 복구할 수 없습니다. 이 기기의 로그인 없는 로컬 일정은 유지됩니다.
            </div>
            <label htmlFor="account-delete-confirmation" style={{ display: 'flex', flexDirection: 'column', gap: '7px', color: '#475569', fontSize: '11px', fontWeight: '900' }}>
              계속하려면 아래에 <strong style={{ color: '#be123c' }}>삭제</strong>를 입력하세요.
              <input
                id="account-delete-confirmation"
                autoFocus
                type="text"
                autoComplete="off"
                value={accountDeleteConfirmation}
                onChange={(event) => { setAccountDeleteConfirmation(event.target.value); setAccountDeleteError(''); }}
                disabled={isDeletingAccount}
                placeholder="삭제"
                style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', border: `1px solid ${accountDeleteError ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '13px', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '14px', fontWeight: '800', outline: 'none' }}
              />
            </label>
            {accountDeleteError && <p role="alert" style={{ margin: '10px 0 0', padding: '10px 12px', borderRadius: '11px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '12px', fontWeight: '800', lineHeight: 1.45 }}>{accountDeleteError}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: '9px', marginTop: '20px' }}>
              <button type="button" onClick={closeAccountDeleteModal} disabled={isDeletingAccount} style={{ padding: '13px', border: '1px solid #e2e8f0', borderRadius: '13px', backgroundColor: 'white', color: '#475569', fontSize: '12px', fontWeight: '900', cursor: isDeletingAccount ? 'not-allowed' : 'pointer' }}>취소</button>
              <button type="submit" disabled={accountDeleteConfirmation !== '삭제' || isDeletingAccount} style={{ padding: '13px', border: 'none', borderRadius: '13px', backgroundColor: '#e11d48', color: 'white', fontSize: '12px', fontWeight: '900', cursor: accountDeleteConfirmation !== '삭제' || isDeletingAccount ? 'not-allowed' : 'pointer', opacity: accountDeleteConfirmation !== '삭제' || isDeletingAccount ? 0.5 : 1 }}>
                {isDeletingAccount ? '삭제 중…' : '계정 영구 삭제'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showAuthModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeAuthModal();
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 14000, backgroundColor: 'rgba(15, 23, 42, 0.48)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', animation: 'fadeIn 0.2s ease-out' }}
        >
          <form
            onSubmit={handleEmailAuthSubmit}
            style={{ width: '100%', maxWidth: '420px', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', position: 'relative', padding: '28px 24px', borderRadius: '28px', backgroundColor: 'white', boxShadow: '0 25px 60px rgba(15, 23, 42, 0.25)', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <button
              type="button"
              aria-label="로그인 창 닫기"
              title="닫기"
              onClick={closeAuthModal}
              disabled={authSubmitting}
              style={{ position: 'absolute', top: '20px', right: '20px', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '50%', backgroundColor: '#f1f5f9', color: '#64748b', cursor: authSubmitting ? 'not-allowed' : 'pointer', opacity: authSubmitting ? 0.5 : 1 }}
            >
              <X size={18} />
            </button>

            <div style={{ paddingRight: '44px', marginBottom: '22px' }}>
              <div style={{ width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', borderRadius: '14px', backgroundColor: '#eff6ff', color: '#2563eb' }}>
                {authMode === 'reset' ? <Mail size={21} /> : <Lock size={21} />}
              </div>
              <h2 id="auth-modal-title" style={{ margin: 0, color: '#0f172a', fontSize: '22px', fontWeight: '900', letterSpacing: '-0.04em' }}>
                {authMode === 'signup' ? '회원가입' : authMode === 'reset' ? '비밀번호 찾기' : authMode === 'new-password' ? '새 비밀번호 설정' : '로그인'}
              </h2>
              <p style={{ margin: '7px 0 0', color: '#64748b', fontSize: '12px', lineHeight: 1.5 }}>
                {authMode === 'signup' ? '이메일로 계정을 만들고 여행 데이터를 안전하게 동기화하세요.' : authMode === 'reset' ? '가입한 이메일을 입력하면 비밀번호 재설정 링크를 보내드립니다.' : authMode === 'new-password' ? '새 비밀번호를 입력하면 계정 복구가 완료됩니다.' : 'Google 또는 이메일로 TravelPlaner를 이용하세요.'}
              </p>
            </div>

            {authMode !== 'new-password' && (
              <>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={authSubmitting}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px', border: '1px solid #e2e8f0', borderRadius: '13px', backgroundColor: 'white', color: '#334155', fontSize: '13px', fontWeight: '900', cursor: authSubmitting ? 'not-allowed' : 'pointer', opacity: authSubmitting ? 0.6 : 1 }}
                >
                  <img src="https://www.google.com/favicon.ico" width="16" height="16" alt="Google" /> Google로 계속하기
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '18px 0', color: '#94a3b8', fontSize: '10px', fontWeight: '800' }}>
                  <span style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} /> 또는 이메일 사용 <span style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
                </div>
              </>
            )}

            {authMode !== 'new-password' && (
              <label htmlFor="auth-email" style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '14px' }}>
                <span style={{ color: '#475569', fontSize: '11px', fontWeight: '900' }}>이메일</span>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} color="#94a3b8" style={{ position: 'absolute', left: '13px', top: '14px' }} />
                  <input id="auth-email" autoFocus type="email" value={authEmail} onChange={(event) => { setAuthEmail(event.target.value); setAuthError(''); }} placeholder="you@example.com" autoComplete="email" disabled={authSubmitting} style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px 13px 38px', border: '1px solid #e2e8f0', borderRadius: '13px', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '14px', fontWeight: '700', outline: 'none' }} />
                </div>
              </label>
            )}

            {authMode !== 'reset' && (
              <label htmlFor="auth-password" style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '14px' }}>
                <span style={{ color: '#475569', fontSize: '11px', fontWeight: '900' }}>비밀번호</span>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} color="#94a3b8" style={{ position: 'absolute', left: '13px', top: '14px' }} />
                  <input id="auth-password" type={showAuthPassword ? 'text' : 'password'} value={authPassword} onChange={(event) => { setAuthPassword(event.target.value); setAuthError(''); }} placeholder="6자 이상" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} disabled={authSubmitting} style={{ width: '100%', boxSizing: 'border-box', padding: '13px 42px 13px 38px', border: '1px solid #e2e8f0', borderRadius: '13px', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '14px', fontWeight: '700', outline: 'none' }} />
                  <button type="button" aria-label={showAuthPassword ? '비밀번호 숨기기' : '비밀번호 보기'} onClick={() => setShowAuthPassword((visible) => !visible)} style={{ position: 'absolute', right: '8px', top: '7px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '8px', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>{showAuthPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </label>
            )}

            {(authMode === 'signup' || authMode === 'new-password') && (
              <label htmlFor="auth-password-confirm" style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '14px' }}>
                <span style={{ color: '#475569', fontSize: '11px', fontWeight: '900' }}>비밀번호 확인</span>
                <input id="auth-password-confirm" type={showAuthPassword ? 'text' : 'password'} value={authPasswordConfirm} onChange={(event) => { setAuthPasswordConfirm(event.target.value); setAuthError(''); }} placeholder="비밀번호를 한 번 더 입력해주세요" autoComplete="new-password" disabled={authSubmitting} style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', border: '1px solid #e2e8f0', borderRadius: '13px', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '14px', fontWeight: '700', outline: 'none' }} />
              </label>
            )}

            {authError && <p role="alert" style={{ margin: '2px 0 12px', padding: '10px 12px', borderRadius: '11px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '12px', fontWeight: '800', lineHeight: 1.45 }}>{authError}</p>}
            {authMessage && <p role="status" style={{ margin: '2px 0 12px', padding: '10px 12px', borderRadius: '11px', backgroundColor: '#eff6ff', color: '#1d4ed8', fontSize: '12px', fontWeight: '800', lineHeight: 1.45 }}>{authMessage}</p>}

            <button type="submit" disabled={authSubmitting} style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '14px', backgroundColor: '#2563eb', color: 'white', fontSize: '14px', fontWeight: '900', cursor: authSubmitting ? 'wait' : 'pointer', opacity: authSubmitting ? 0.7 : 1, boxShadow: '0 10px 20px rgba(37, 99, 235, 0.2)' }}>
              {authSubmitting ? '처리 중...' : authMode === 'signup' ? '이메일로 회원가입' : authMode === 'reset' ? '재설정 메일 보내기' : authMode === 'new-password' ? '비밀번호 저장' : '이메일로 로그인'}
            </button>

            {authMode === 'login' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '16px' }}>
                <button type="button" onClick={() => openAuthModal('signup')} style={{ padding: 0, border: 'none', background: 'none', color: '#2563eb', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>회원가입</button>
                <button type="button" onClick={() => openAuthModal('reset')} style={{ padding: 0, border: 'none', background: 'none', color: '#64748b', fontSize: '11px', fontWeight: '800', cursor: 'pointer' }}>비밀번호 찾기</button>
              </div>
            )}
            {authMode === 'signup' && <button type="button" onClick={() => openAuthModal('login')} style={{ width: '100%', marginTop: '16px', padding: 0, border: 'none', background: 'none', color: '#2563eb', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>이미 계정이 있나요? 로그인</button>}
            {authMode === 'reset' && <button type="button" onClick={() => openAuthModal('login')} style={{ width: '100%', marginTop: '16px', padding: 0, border: 'none', background: 'none', color: '#2563eb', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>로그인으로 돌아가기</button>}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '20px', color: '#94a3b8', fontSize: '10px', fontWeight: '800' }}>
              <a href="/privacy.html" style={{ color: 'inherit', textDecoration: 'none' }}>개인정보처리방침</a>
              <span aria-hidden="true">·</span>
              <a href="/support.html" style={{ color: 'inherit', textDecoration: 'none' }}>지원</a>
            </div>
          </form>
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
                  {COUNTRY_OPTIONS.map((countryName) => (
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

      {showEditTripModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-trip-modal-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancelEditTrip();
          }}
          style={{
            position: 'fixed', inset: 0, zIndex: 13000,
            backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px', animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <form
            onSubmit={(event) => { event.preventDefault(); saveRenameTrip(editingTripId); }}
            style={{
              backgroundColor: 'white', borderRadius: '28px', width: '100%', maxWidth: '440px',
              maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', padding: '28px 24px',
              boxShadow: '0 25px 60px rgba(15, 23, 42, 0.25)', position: 'relative',
              animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            <button
              type="button"
              aria-label="여행 정보 수정 창 닫기"
              title="닫기"
              onClick={cancelEditTrip}
              style={{ position: 'absolute', top: '20px', right: '20px', border: 'none', background: '#f1f5f9', width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>

            <div style={{ paddingRight: '44px', marginBottom: '24px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 9px', borderRadius: '999px', backgroundColor: '#eff6ff', color: '#2563eb', fontSize: '11px', fontWeight: '900', marginBottom: '10px' }}>
                <Edit2 size={14} /> 여행 정보 수정
              </div>
              <h2 id="edit-trip-modal-title" style={{ margin: 0, color: '#0f172a', fontSize: '22px', fontWeight: '900', letterSpacing: '-0.04em' }}>여행 기본 정보</h2>
              <p style={{ margin: '7px 0 0', color: '#64748b', fontSize: '12px', lineHeight: 1.5 }}>여행 이름, 국가와 기간을 한 곳에서 수정할 수 있습니다.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <span style={{ color: '#475569', fontSize: '11px', fontWeight: '900' }}>여행 이름 <span style={{ color: '#ef4444' }}>*</span></span>
                <input
                  autoFocus
                  type="text"
                  value={editTripData.name}
                  onChange={(event) => { setEditTripData({ ...editTripData, name: event.target.value }); setEditTripError(''); }}
                  placeholder="예: 나트랑 4박 5일 여행"
                  maxLength={80}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', border: '1px solid #e2e8f0', borderRadius: '13px', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '14px', fontWeight: '700', outline: 'none' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <span style={{ color: '#475569', fontSize: '11px', fontWeight: '900' }}>여행 국가 <span style={{ color: '#94a3b8', fontWeight: '700' }}>(선택)</span></span>
                <select
                  value={editTripData.country}
                  onChange={(event) => { setEditTripData({ ...editTripData, country: event.target.value }); setEditTripError(''); }}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', border: '1px solid #e2e8f0', borderRadius: '13px', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '14px', fontWeight: '700', outline: 'none' }}
                >
                  <option value="">나라를 선택해주세요</option>
                  {COUNTRY_OPTIONS.map((countryName) => (
                    <option key={`edit-trip-country-${countryName}`} value={countryName}>{countryName}</option>
                  ))}
                </select>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  <span style={{ color: '#475569', fontSize: '11px', fontWeight: '900' }}>시작일 <span style={{ color: '#ef4444' }}>*</span></span>
                  <input
                    type="date"
                    value={editTripData.startDate}
                    onChange={(event) => { setEditTripData({ ...editTripData, startDate: event.target.value }); setEditTripError(''); }}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '13px 10px', border: '1px solid #e2e8f0', borderRadius: '13px', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '13px', fontWeight: '700', outline: 'none' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  <span style={{ color: '#475569', fontSize: '11px', fontWeight: '900' }}>종료일 <span style={{ color: '#ef4444' }}>*</span></span>
                  <input
                    type="date"
                    value={editTripData.endDate}
                    onChange={(event) => { setEditTripData({ ...editTripData, endDate: event.target.value }); setEditTripError(''); }}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '13px 10px', border: '1px solid #e2e8f0', borderRadius: '13px', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '13px', fontWeight: '700', outline: 'none' }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', borderRadius: '13px', backgroundColor: editTripDayCount > 0 ? '#eff6ff' : '#f8fafc', color: editTripDayCount > 0 ? '#2563eb' : '#94a3b8', fontSize: '12px', fontWeight: '800' }}>
                <span>변경될 일정</span>
                <strong>{editTripDayCount > 0 ? `${editTripDayCount}일차` : '날짜를 확인해주세요'}</strong>
              </div>
            </div>

            {editTripError && (
              <p role="alert" style={{ margin: '14px 0 0', padding: '10px 12px', borderRadius: '11px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '12px', fontWeight: '800', lineHeight: 1.45 }}>{editTripError}</p>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button
                type="button"
                onClick={cancelEditTrip}
                style={{ flex: 1, padding: '14px', border: '1px solid #e2e8f0', borderRadius: '14px', backgroundColor: 'white', color: '#64748b', fontSize: '14px', fontWeight: '900', cursor: 'pointer' }}
              >
                취소
              </button>
              <button
                type="submit"
                style={{ flex: 1.6, padding: '14px', border: 'none', borderRadius: '14px', backgroundColor: '#2563eb', color: 'white', fontSize: '14px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 10px 20px rgba(37, 99, 235, 0.22)' }}
              >
                저장
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
              <button type="button" onClick={handleOnboardingAction} style={{ flex: 1.5, padding: '13px', border: 'none', borderRadius: '14px', backgroundColor: '#2563eb', color: 'white', fontSize: '13px', fontWeight: '900', cursor: 'pointer' }}>{onboardingStep === 0 ? '여행 만들기' : onboardingStep === 1 ? '장소 검색하기' : '일정 추가하기'}</button>
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
          {searchResult && ['search', 'geocoded-search'].includes(searchResult.type) && (
             <CustomMapMarker
                position={{ lat: searchResult.lat, lng: searchResult.lng }}
                onClick={() => setSelectedPlace(searchResult)}
                ariaLabel={`검색한 장소 ${searchResult.name}`}
                icon={{
                  url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                    <svg width="40" height="48" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 46C20 46 5 31.2 5 20C5 11.7 11.7 5 20 5C28.3 5 35 11.7 35 20C35 31.2 20 46 20 46Z" fill="%23006ADC" stroke="white" stroke-width="3" stroke-linejoin="round"/>
                      <circle cx="20" cy="20" r="8" fill="white"/>
                      <circle cx="20" cy="20" r="4" fill="%23006ADC"/>
                    </svg>
                  `)}`,
                  scaledSize: new window.google.maps.Size(40, 48),
                  anchor: new window.google.maps.Point(20, 48)
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
                    {(selectedPlaceBusinessStatus || selectedPlaceOpeningHours.length > 0) && (
                      <details className="place-hours-summary">
                        <summary><Clock size={11} aria-hidden="true" />영업시간{selectedPlaceBusinessStatus ? ` · ${selectedPlaceBusinessStatus}` : ''}</summary>
                        {selectedPlaceOpeningHours.length > 0 && (
                          <div className="place-hours-list">
                            {selectedPlaceOpeningHours.map((hours, index) => <span key={`${hours}-${index}`}>{hours}</span>)}
                          </div>
                        )}
                      </details>
                    )}
                  </div>
                </div>

                <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: window.innerWidth < 768 ? '8px 0' : '16px 0' }} />

                {/* BOTTOM SECTION: Add to Itinerary */}
                {activeTripId && !isReadOnlyTrip && (
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

                    <ItineraryEmojiPicker value={itineraryEmoji} onChange={setItineraryEmoji} />

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
                    {(selectedPlaceBusinessStatus || selectedPlaceOpeningHours.length > 0) && (
                      <details className="place-hours-summary">
                        <summary><Clock size={11} aria-hidden="true" />영업시간{selectedPlaceBusinessStatus ? ` · ${selectedPlaceBusinessStatus}` : ''}</summary>
                        {selectedPlaceOpeningHours.length > 0 && (
                          <div className="place-hours-list">
                            {selectedPlaceOpeningHours.map((hours, index) => <span key={`${hours}-${index}`}>{hours}</span>)}
                          </div>
                        )}
                      </details>
                    )}
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

              {activeTripId && !isReadOnlyTrip && (
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

                  <ItineraryEmojiPicker value={itineraryEmoji} onChange={setItineraryEmoji} />

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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: '900', color: '#64748b' }}>예약번호
                <input type="text" value={editingTimeItem.reservationNumber || ''} onChange={(e) => setEditingTimeItem({ ...editingTimeItem, reservationNumber: e.target.value })} placeholder="선택" style={{ width: '100%', boxSizing: 'border-box', marginTop: '7px', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              </label>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: '900', color: '#64748b' }}>예약 링크
                <input type="url" value={editingTimeItem.reservationUrl || ''} onChange={(e) => setEditingTimeItem({ ...editingTimeItem, reservationUrl: e.target.value })} placeholder="https://" style={{ width: '100%', boxSizing: 'border-box', marginTop: '7px', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              </label>
            </div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: '900', color: '#64748b', marginBottom: '14px' }}>메모
              <textarea value={editingTimeItem.memo || ''} onChange={(e) => setEditingTimeItem({ ...editingTimeItem, memo: e.target.value })} placeholder="체크인 방법, 준비물 등을 적어두세요." rows={3} style={{ width: '100%', boxSizing: 'border-box', marginTop: '7px', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', resize: 'vertical' }} />
            </label>

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
                    displayName: editingTimeItem.displayName.trim() || editingTimeItem.originalName,
                    reservationNumber: editingTimeItem.reservationNumber?.trim() || '',
                    reservationUrl: editingTimeItem.reservationUrl?.trim() || '',
                    memo: editingTimeItem.memo?.trim() || ''
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
              {useExpenseDayChoices ? (
                <ExpenseChoiceGroup
                  options={expenseDayChoices}
                  value={expenseInput.day}
                  onChange={(day) => setExpenseInput(current => ({ ...current, day }))}
                  ariaLabel="지출 수정 소비 일자"
                  className="expense-day-choice-group"
                  scrollable
                />
              ) : (
                <select
                  value={expenseInput.day}
                  onChange={(e) => setExpenseInput(current => ({ ...current, day: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: 'white', fontSize: '14px', fontWeight: '700', outline: 'none' }}
                >
                  {expenseDayChoices.map(day => <option key={`expense-edit-day-${day.value}`} value={day.value}>{day.label}</option>)}
                </select>
              )}
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

            <div style={{ marginBottom: '14px' }}>
              <div style={{ minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '900', color: '#64748b', marginBottom: '8px' }}>카테고리</label>
                <ExpenseChoiceGroup
                  options={EXPENSE_CATEGORIES}
                  value={expenseInput.category || 'other'}
                  onChange={(category) => setExpenseInput(current => ({ ...current, category }))}
                  ariaLabel="지출 수정 카테고리"
                  className="expense-category-choice-group"
                />
              </div>
            </div>

            <div className="expense-edit-currency-payment-amount" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr 0.9fr', gap: '10px', marginBottom: '14px' }}>
              <div style={{ minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '900', color: '#64748b', marginBottom: '8px' }}>사용 통화</label>
                <ExpenseChoiceGroup
                  options={expenseCurrencyQuickOptions}
                  value={expenseCurrencyQuickValue}
                  onChange={(currency) => setExpenseInput(current => ({ ...current, currency }))}
                  ariaLabel="빠른 지출 수정 통화"
                  className="expense-currency-choice-group"
                />
                {expenseCurrencyAdditionalChoices.length > 0 && (
                  <ExpenseCurrencyPicker
                    value={expenseCurrencyAdditionalValue}
                    options={expenseCurrencyAdditionalChoices}
                    onChange={currency => setExpenseInput(current => ({ ...current, currency }))}
                    placeholder="전체 통화"
                    ariaLabel="전체 통화에서 지출 수정 통화 선택"
                    className="expense-currency-more-picker"
                  />
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '900', color: '#64748b', marginBottom: '8px' }}>결제 수단</label>
                <ExpenseChoiceGroup
                  options={PAYMENT_METHODS}
                  value={expenseInput.paymentMethod}
                  onChange={(paymentMethod) => setExpenseInput(current => ({ ...current, paymentMethod }))}
                  aria-label="지출 수정 결제 수단"
                  className="expense-payment-choice-group"
                />
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
            <h3 style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a', margin: '0 0 8px 0' }}>AI로 일정 만들기</h3>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 16px 0', lineHeight: 1.5 }}>AI가 작성한 일정 JSON을 붙여넣거나, 직접 작성한 JSON을 불러와 여행 일정으로 저장하세요.</p>

            <div style={{ padding: '16px', marginBottom: '16px', borderRadius: '18px', backgroundColor: '#eff6ff', border: '1px solid #dbeafe' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                <div>
                  <strong style={{ display: 'block', color: '#1e40af', fontSize: '13px', marginBottom: '4px' }}>LLM용 예시 형식</strong>
                  <span style={{ display: 'block', color: '#64748b', fontSize: '11px', lineHeight: 1.5 }}>예시를 복사해 AI 도구에 전달하면 같은 형식으로 일정을 만들 수 있어요.</span>
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
