import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { getGooglePlaceID, placeClosure, placeMapsURL, safePlaceLink, visitAvailability } from './placeBusinessDetails.js';

const fields = [
  'regularOpeningHours', 'currentOpeningHours', 'businessStatus',
  'internationalPhoneNumber', 'websiteURI', 'priceLevel', 'timeZone', 'utcOffsetMinutes',
];
const prices = {
  FREE: '무료', INEXPENSIVE: '저렴', MODERATE: '보통', EXPENSIVE: '높음', VERY_EXPENSIVE: '매우 높음'
};

const descriptions = value => Array.isArray(value) ? value.filter(line => typeof line === 'string') : [];

export default function PlaceBusinessDetails({ place, visitDate }) {
  const id = getGooglePlaceID(place);
  return <PlaceDetailsDisclosure key={id ?? placeMapsURL(place)} place={place} id={id} visitDate={visitDate} />;
}

function PlaceDetailsDisclosure({ place, id, visitDate }) {
  const [result, setResult] = useState(null);
  const pending = useRef(false);
  const generation = useRef(0);
  const mapsURL = placeMapsURL(place);
  const menu = safePlaceLink(place.menuURL);

  useEffect(() => () => { generation.current += 1; pending.current = false; }, []);

  if (!mapsURL && !menu) return null;

  async function load() {
    if (!id || pending.current) return;
    pending.current = true;
    const ticket = ++generation.current;
    setResult({ status: 'loading' });
    try {
      const googleMaps = window.google?.maps;
      const { Place } = googleMaps?.places?.Place ? googleMaps.places : await googleMaps?.importLibrary('places') ?? {};
      if (!Place) throw new Error('Google Places unavailable');
      const details = new Place({ id });
      await details.fetchFields({ fields });
      if (ticket === generation.current) setResult({ status: 'ready', details });
    } catch {
      if (ticket === generation.current) setResult({ status: 'failed' });
    } finally {
      if (ticket === generation.current) pending.current = false;
    }
  }

  const details = result?.details;
  const oldHours = place.openingHours || place.opening_hours || place.regularOpeningHours;
  const regular = descriptions(details?.regularOpeningHours?.weekdayDescriptions
    ?? (Array.isArray(oldHours) ? oldHours : oldHours?.weekday_text || oldHours?.weekdayDescriptions));
  const current = descriptions(details?.currentOpeningHours?.weekdayDescriptions);
  const closure = placeClosure(details?.businessStatus ?? place.businessStatus);
  const price = prices[details?.priceLevel];
  const availability = details && !closure
    ? visitAvailability({ date: visitDate, time: place.time, details }) : null;
  const website = safePlaceLink(details?.websiteURI);
  const phone = typeof details?.internationalPhoneNumber === 'string' ? details.internationalPhoneNumber : '';
  const phoneDigits = phone.replace(/[^+\d]/g, '');

  return (
    <details className="business-place-details" onClick={event => event.stopPropagation()}
      onToggle={event => { if (event.currentTarget.open && !result) void load(); }}>
      <summary><Clock size={14} aria-hidden="true" />장소 상세</summary>
      <div className="business-place-details-body">
        {result?.status === 'loading' && <span role="status">장소 정보를 불러오는 중이에요.</span>}
        {result?.status === 'failed' && <span role="status">장소 정보를 불러오지 못했어요. <button type="button" onClick={load}>다시 조회</button></span>}
        {!id && !regular.length && <span>Google 장소가 연결되어 있으면 영업시간을 조회할 수 있어요.</span>}
        {closure && <strong>{closure}</strong>}
        {visitDate && place.time && <span>방문 예정 · {visitDate} {place.time}
          {availability && <> · <strong>{availability.open ? '영업시간 내' : '영업시간 밖'}</strong>
            {!availability.current && ' (정규 시간 기준)'}</>}
        </span>}
        {regular.length > 0 && <><strong>요일별 정규 영업시간</strong><ul>{regular.map((line, index) => <li key={index}>{line}</li>)}</ul></>}
        {current.length > 0 && (details?.currentOpeningHours?.specialDays?.length || JSON.stringify(current) !== JSON.stringify(regular))
          ? <><strong>향후 7일 영업시간 · 임시 변경 포함</strong><ul>{current.map((line, index) => <li key={index}>{line}</li>)}</ul></> : null}
        {details && !regular.length && !current.length && <span>등록된 영업시간이 없어요.</span>}
        {price && <span>가격대 · {price}</span>}
        <div className="business-place-links">
          {phoneDigits && <a href={`tel:${phoneDigits}`}>{phone}</a>}
          {website && <a href={website} target="_blank" rel="noreferrer">공식 웹사이트</a>}
          {menu && <a href={menu} target="_blank" rel="noreferrer">저장한 메뉴 링크</a>}
          {mapsURL && <a href={mapsURL} target="_blank" rel="noreferrer">Google 지도에서 보기</a>}
        </div>
        {details?.attributions?.map(({ provider, providerURI }, index) => safePlaceLink(providerURI)
          ? <a key={index} href={safePlaceLink(providerURI)} target="_blank" rel="noreferrer">{provider}</a>
          : <span key={index}>{provider}</span>)}
        {(details || regular.length > 0 || closure) ? <span className="business-place-attribution" translate="no">Google Maps</span> : null}
      </div>
    </details>
  );
}
