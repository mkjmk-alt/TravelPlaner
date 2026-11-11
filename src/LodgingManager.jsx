import React, { useState } from 'react';
import { BedDouble, PlusCircle, Edit2, Trash2 } from 'lucide-react';
import { addLodgingEvents, getLodgings, validateLodging } from './lodging';

const emptyDraft = trip => ({ name: '', address: '', checkIn: trip.startDate || '', checkOut: trip.endDate || '', checkInTime: '', checkOutTime: '', memo: '' });

export default function LodgingManager({ trip, readOnly, savedPlaces = [], legacyDetails = {}, onUpdateTrip }) {
  const malformed = trip?.lodgings != null && (!Array.isArray(trip.lodgings) || trip.lodgings.some(row => !row || typeof row.id !== 'string' || !row.id) || new Set(trip.lodgings.map(row => row.id)).size !== trip.lodgings.length);
  const lodgings = malformed ? [] : getLodgings(trip);
  const availablePlaces = Array.isArray(savedPlaces) ? savedPlaces.filter(place => place && place.id != null && (place.name || place.displayName)) : [];
  const [draft, setDraft] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [notice, setNotice] = useState('');
  const [selectedPlace, setSelectedPlace] = useState('');
  const open = item => {
    setDraft(item ? { ...item } : emptyDraft(trip));
    setSelectedPlace('');
    setEditingId(item?.id || null);
    setBaseline(JSON.stringify(lodgings));
    setError('');
  };
  const save = async event => {
    event.preventDefault();
    if (saving || readOnly || malformed) return;
    const message = validateLodging(draft);
    if (message) { setError(message); return; }
    if (baseline !== JSON.stringify(lodgings)) { setError('숙소 목록이 변경되었습니다. 다시 열어 확인해주세요.'); return; }
    const item = { ...draft, id: editingId || globalThis.crypto.randomUUID(), name: draft.name.trim(), address: (draft.address || '').trim() };
    setSaving(true);
    try {
      await onUpdateTrip({ lodgings: editingId ? lodgings.map(row => row.id === editingId ? item : row) : [...lodgings, item] });
      setDraft(null); setError('');
    } catch { setError('숙소를 저장하지 못했습니다. 다시 시도해주세요.'); }
    finally { setSaving(false); }
  };
  const remove = async item => {
    if (saving || readOnly || malformed) return;
    if (!deleting || deleting.id !== item.id || deleting.snapshot !== JSON.stringify(item)) {
      setDeleting(null); setError('숙소가 변경되었습니다. 다시 확인해주세요.'); return;
    }
    setSaving(true);
    try { await onUpdateTrip({ lodgings: lodgings.filter(row => row.id !== item.id) }); setDeleting(null); }
    catch { setError('숙소를 삭제하지 못했습니다. 다시 시도해주세요.'); }
    finally { setSaving(false); }
  };
  const addEvents = async item => {
    if (saving || readOnly || malformed) return;
    try {
      setNotice('');
      const result = addLodgingEvents(trip, item, () => globalThis.crypto.randomUUID());
      setSaving(true); setError('');
      await onUpdateTrip({ itinerary: result.itinerary });
      setNotice(`여행 기간 안에 있는 체크인·체크아웃 일정 ${result.added}개를 추가했습니다. 숙소를 수정해도 추가한 일정은 자동으로 바뀌지 않습니다.`);
    } catch (issue) { setError(issue.message || '일정을 추가하지 못했습니다.'); }
    finally { setSaving(false); }
  };
  const overlap = draft && draft.checkIn && draft.checkOut && lodgings.some(item => item.id !== editingId && item.checkIn < draft.checkOut && draft.checkIn < item.checkOut);
  return <section className="travel-memory-card lodging-manager" aria-label="숙소 관리">
    <div className="travel-memory-card-heading"><div><span className="travel-memory-card-kicker">STAYS</span><h3>숙소</h3></div><BedDouble size={18} aria-hidden="true" /></div>
    <p className="lodging-hint">체크인과 체크아웃 날짜를 등록하면 각 일차에서 숙소를 볼 수 있어요.</p>
    {malformed && <p className="travel-memory-form-error" role="alert">숙소 목록을 읽을 수 없어 원본을 보존합니다. 백업을 확인해주세요.</p>}
    {notice && <p className="lodging-hint" role="status">{notice}</p>}
    {lodgings.length === 0 && <p className="lodging-hint">등록된 숙소가 없습니다.</p>}
    <div className="lodging-list">{lodgings.map(item => <article className="lodging-card" key={item.id}>
      <div><strong>{item.name}</strong><p>{item.checkIn} 체크인 · {item.checkOut} 체크아웃</p>{item.address && <p>{item.address}</p>}{item.memo && <p>{item.memo}</p>}</div>
      {!readOnly && !malformed && <div className="lodging-actions"><button type="button" onClick={() => addEvents(item)} disabled={saving}>일정에 추가</button><button type="button" aria-label={`${item.name} 수정`} onClick={() => open(item)}><Edit2 size={16} /> 수정</button>{deleting?.id === item.id ? <><button type="button" onClick={() => remove(item)} disabled={saving}>삭제 확인</button><button type="button" onClick={() => setDeleting(null)}>취소</button></> : <button type="button" onClick={() => setDeleting({ id: item.id, snapshot: JSON.stringify(item) })}><Trash2 size={16} /> 삭제</button>}</div>}
    </article>)}</div>
    {!readOnly && !malformed && !draft && <div className="lodging-actions"><button type="button" className="travel-memory-secondary-button" onClick={() => open(null)}><PlusCircle size={15} /> 숙소 추가</button>{legacyDetails.stayName && <button type="button" onClick={() => open({ ...emptyDraft(trip), name: legacyDetails.stayName, address: legacyDetails.stayAddress || '', checkIn: '', checkOut: '' })}>기존 숙소로 추가</button>}</div>}
    {!draft && legacyDetails.stayName && <p className="lodging-hint">기존 숙소로 추가해도 이전 정보는 그대로 보관됩니다.</p>}
    {!readOnly && draft && <form className="lodging-form" onSubmit={save}>
      <div className="travel-memory-form-grid">
        {availablePlaces.length > 0 && <label className="travel-memory-form-grid-wide"><span>저장 장소에서 선택 (선택)</span><select value={selectedPlace} onChange={e => {
          const id = e.target.value; setSelectedPlace(id);
          const place = availablePlaces.find(item => String(item.id) === id);
          if (!place) { setDraft(current => ({ ...current, lat: undefined, lng: undefined, placeId: undefined, nativePlaceSource: undefined })); return; }
          const { lat, lng, placeId, nativePlaceSource } = place;
          setDraft(current => ({ ...current, name: place.displayName || place.name || '', address: place.loc || place.address || '', lat, lng, placeId, nativePlaceSource }));
        }}><option value="">직접 입력</option>{availablePlaces.map(place => <option key={place.id} value={place.id}>{place.displayName || place.name}</option>)}</select></label>}
        <label><span>숙소 이름</span><input value={draft.name || ''} maxLength={200} onChange={e => setDraft({ ...draft, name: e.target.value })} required /></label>
        <label><span>주소 (선택)</span><input value={draft.address || ''} maxLength={2000} onChange={e => { setSelectedPlace(''); setDraft({ ...draft, address: e.target.value, lat: undefined, lng: undefined, placeId: undefined, nativePlaceSource: undefined }); }} /></label>
        <label><span>체크인 날짜</span><input type="date" value={draft.checkIn || ''} onChange={e => setDraft({ ...draft, checkIn: e.target.value })} required /></label>
        <label><span>체크아웃 날짜</span><input type="date" value={draft.checkOut || ''} onChange={e => setDraft({ ...draft, checkOut: e.target.value })} required /></label>
        <label><span>체크인 시간 (선택)</span><input type="time" value={draft.checkInTime || ''} onChange={e => setDraft({ ...draft, checkInTime: e.target.value })} /></label>
        <label><span>체크아웃 시간 (선택)</span><input type="time" value={draft.checkOutTime || ''} onChange={e => setDraft({ ...draft, checkOutTime: e.target.value })} /></label>
        <label className="travel-memory-form-grid-wide"><span>예약 메모 (선택)</span><input value={draft.memo || ''} maxLength={10000} onChange={e => setDraft({ ...draft, memo: e.target.value })} /></label>
      </div>
      {overlap && <p className="lodging-hint" role="status">다른 숙소와 숙박 기간이 겹칩니다. 예약을 확인해주세요.</p>}
      {error && <p className="travel-memory-form-error" role="alert">{error}</p>}
      <div className="travel-memory-form-actions"><button type="button" className="travel-memory-cancel-button" onClick={() => setDraft(null)}>취소</button><button type="submit" className="travel-memory-primary-button" disabled={saving}>숙소 저장</button></div>
    </form>}
    {!draft && error && <p className="travel-memory-form-error" role="alert">{error}</p>}
  </section>;
}
