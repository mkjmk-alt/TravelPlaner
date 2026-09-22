import React, { useMemo, useState } from 'react';
import { Calendar, Camera, Check, ChevronRight, Edit2, FileText, MapPin, Plane, PlusCircle, Save, Trash2, X } from 'lucide-react';
import {
  createJournalEntry,
  getItineraryPlaceOptions,
  getJournalEntryDay,
  getJournalEntries,
  getTravelDetails,
  getTripCountdownLabel,
  getTripDayOptions,
  getTripDurationLabel,
  sortJournalEntriesForTimeline
} from './travelMemory';

const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;

const getTodayInputValue = () => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
};

const formatJournalDate = (value) => {
  if (!value) return '날짜 미정';
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    weekday: 'short'
  }).format(date);
};

const getInitialDraft = (trip) => ({
  date: trip?.startDate || getTodayInputValue(),
  title: '',
  body: '',
  imageDataUrl: '',
  placeKey: ''
});

export default function TravelMemoryPanel({
  trip,
  readOnly = false,
  onUpdateTrip,
  onOpenItinerary,
  onOpenPlace
}) {
  const travelDetails = useMemo(() => getTravelDetails(trip), [trip]);
  const journalEntries = useMemo(() => sortJournalEntriesForTimeline(getJournalEntries(trip)), [trip]);
  const itineraryPlaceOptions = useMemo(() => {
    const itineraryOptions = getItineraryPlaceOptions(trip);
    const optionKeys = new Set(itineraryOptions.map(option => option.key));
    const savedPlaceOptions = journalEntries
      .map(entry => entry.place)
      .filter(place => place && !optionKeys.has(place.key));
    return [...itineraryOptions, ...savedPlaceOptions];
  }, [trip, journalEntries]);
  const [detailsDraft, setDetailsDraft] = useState(travelDetails);
  const [journalDraft, setJournalDraft] = useState(() => getInitialDraft(trip));
  const [editingJournalId, setEditingJournalId] = useState(null);
  const [journalError, setJournalError] = useState('');
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [journalDayFilter, setJournalDayFilter] = useState('all');
  const journalDayOptions = useMemo(() => getTripDayOptions(trip), [trip]);
  const selectedJournalDay = journalDayFilter === 'all' ? null : Number(journalDayFilter);
  const visibleJournalEntries = useMemo(() => (
    selectedJournalDay === null || !journalDayOptions.includes(selectedJournalDay)
      ? journalEntries
      : journalEntries.filter(entry => getJournalEntryDay(entry, trip) === selectedJournalDay)
  ), [journalEntries, journalDayOptions, selectedJournalDay, trip]);

  const updateDetailsField = (field, value) => {
    setDetailsSaved(false);
    setDetailsDraft(current => ({ ...current, [field]: value }));
  };

  const saveTravelDetails = () => {
    if (readOnly || !onUpdateTrip) return;
    onUpdateTrip({ travelDetails: detailsDraft });
    setDetailsSaved(true);
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setJournalError('사진은 2.5MB 이하만 추가할 수 있습니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setJournalError('');
      setJournalDraft(current => ({ ...current, imageDataUrl: String(reader.result || '') }));
    };
    reader.onerror = () => setJournalError('사진을 읽지 못했습니다. 다시 선택해주세요.');
    reader.readAsDataURL(file);
  };

  const resetJournalDraft = () => {
    setJournalDraft(getInitialDraft(trip));
    setEditingJournalId(null);
    setJournalError('');
  };

  const saveJournalEntry = (event) => {
    event.preventDefault();
    if (readOnly || !onUpdateTrip) return;
    const title = journalDraft.title.trim();
    const body = journalDraft.body.trim();
    if (!title && !body && !journalDraft.imageDataUrl) {
      setJournalError('제목, 내용 또는 사진 중 하나는 입력해주세요.');
      return;
    }

    const now = Date.now();
    const nextEntry = createJournalEntry({
      id: editingJournalId || undefined,
      date: journalDraft.date,
      title,
      body,
      imageDataUrl: journalDraft.imageDataUrl,
      place: itineraryPlaceOptions.find(place => place.key === journalDraft.placeKey),
      now
    });
    const nextEntries = editingJournalId
      ? journalEntries.map(entry => entry.id === editingJournalId
        ? { ...nextEntry, createdAt: entry.createdAt || now }
        : entry)
      : [nextEntry, ...journalEntries];

    onUpdateTrip({ journalEntries: nextEntries });
    resetJournalDraft();
  };

  const editJournalEntry = (entry) => {
    setEditingJournalId(entry.id);
    setJournalDraft({
      date: entry.date || getTodayInputValue(),
      title: entry.title || '',
      body: entry.body || '',
      imageDataUrl: entry.imageDataUrl || '',
      placeKey: entry.place?.key || ''
    });
    setJournalError('');
  };

  const deleteJournalEntry = (entryId) => {
    if (readOnly || !onUpdateTrip) return;
    onUpdateTrip({ journalEntries: journalEntries.filter(entry => entry.id !== entryId) });
    if (editingJournalId === entryId) resetJournalDraft();
  };

  const daySummaries = (trip?.itinerary || []).map((dayPlan, index) => ({
    day: Number(dayPlan?.day) || index + 1,
    count: Array.isArray(dayPlan?.items) ? dayPlan.items.length : 0
  }));

  return (
    <div className="travel-memory-panel">
      <section className="travel-memory-hero">
        <div>
          <span className="travel-memory-eyebrow">TRIP MEMORY</span>
          <h2 className="menu-section-title">여행 기록</h2>
          <p>{trip?.name || '여행'}</p>
        </div>
        <div className="travel-memory-status-chip">
          {getTripCountdownLabel(trip)}
        </div>
      </section>

      <section className="travel-memory-summary-card">
        <div className="travel-memory-summary-heading">
          <div>
            <strong>{trip?.country || '여행지 미정'}</strong>
            <span>{getTripDurationLabel(trip)} · {journalEntries.length}개 기록</span>
          </div>
          <Plane size={22} aria-hidden="true" />
        </div>
        <div className="travel-memory-summary-meta">
          <span><Calendar size={13} aria-hidden="true" />{trip?.startDate || '날짜 미정'} ~ {trip?.endDate || trip?.startDate || '날짜 미정'}</span>
          <span><MapPin size={13} aria-hidden="true" />{daySummaries.reduce((total, day) => total + day.count, 0)}개 일정 장소</span>
        </div>
        <div className="travel-memory-day-strip" aria-label="날짜별 일정 요약">
          {daySummaries.length > 0 ? daySummaries.map(day => (
            <span key={`memory-day-${day.day}`} className={day.count > 0 ? 'has-places' : ''}>
              {day.day}일차 <b>{day.count}</b>
            </span>
          )) : <span>아직 일정이 없습니다.</span>}
        </div>
        {onOpenItinerary && (
          <button type="button" className="travel-memory-link-button" onClick={() => onOpenItinerary()}>
            일정 전체 보기 <ChevronRight size={14} aria-hidden="true" />
          </button>
        )}
      </section>

      <section className="travel-memory-card">
        <div className="travel-memory-card-heading">
          <div>
            <span className="travel-memory-card-kicker">TRAVEL DETAILS</span>
            <h3>항공·숙소 정보</h3>
          </div>
          <Plane size={18} aria-hidden="true" />
        </div>
        <div className="travel-memory-form-grid">
          <label>
            <span>출발지</span>
            <input disabled={readOnly} value={detailsDraft.departure} onChange={event => updateDetailsField('departure', event.target.value)} placeholder="예: 인천공항" />
          </label>
          <label>
            <span>도착지</span>
            <input disabled={readOnly} value={detailsDraft.arrival} onChange={event => updateDetailsField('arrival', event.target.value)} placeholder="예: 나리타공항" />
          </label>
          <label>
            <span>항공편</span>
            <input disabled={readOnly} value={detailsDraft.flightNumber} onChange={event => updateDetailsField('flightNumber', event.target.value)} placeholder="예: KE703" />
          </label>
          <label>
            <span>숙소</span>
            <input disabled={readOnly} value={detailsDraft.stayName} onChange={event => updateDetailsField('stayName', event.target.value)} placeholder="예: 도쿄 호텔" />
          </label>
          <label className="travel-memory-form-grid-wide">
            <span>숙소 주소</span>
            <input disabled={readOnly} value={detailsDraft.stayAddress} onChange={event => updateDetailsField('stayAddress', event.target.value)} placeholder="예: 도쿄도 신주쿠구" />
          </label>
        </div>
        {!readOnly && (
          <button type="button" className="travel-memory-secondary-button" onClick={saveTravelDetails}>
            {detailsSaved ? <Check size={14} aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
            {detailsSaved ? '저장됨' : '여행 정보 저장'}
          </button>
        )}
      </section>

      <section className="travel-memory-card travel-memory-journal-card">
        <div className="travel-memory-card-heading">
          <div>
            <span className="travel-memory-card-kicker">PHOTO JOURNAL</span>
            <h3>{editingJournalId ? '여행 기록 수정' : '여행 기록 남기기'}</h3>
          </div>
          <Camera size={18} aria-hidden="true" />
        </div>
        {!readOnly ? (
          <form onSubmit={saveJournalEntry} className="travel-memory-journal-form">
            <div className="travel-memory-form-grid">
              <label>
                <span>기록 날짜</span>
                <input type="date" value={journalDraft.date} onChange={event => setJournalDraft(current => ({ ...current, date: event.target.value }))} />
              </label>
              <label>
                <span>제목</span>
                <input value={journalDraft.title} onChange={event => setJournalDraft(current => ({ ...current, title: event.target.value }))} placeholder="예: 첫날의 저녁" maxLength={80} />
              </label>
              <label className="travel-memory-form-grid-wide">
                <span>장소 연결 (선택)</span>
                <select
                  value={journalDraft.placeKey}
                  onChange={event => setJournalDraft(current => ({ ...current, placeKey: event.target.value }))}
                >
                  <option value="">장소를 연결하지 않음</option>
                  {itineraryPlaceOptions.map(place => (
                    <option key={place.key} value={place.key}>
                      {place.day}일차 · {place.name}{place.address ? ` · ${place.address}` : ''}
                    </option>
                  ))}
                </select>
                {itineraryPlaceOptions.length === 0 && <small>일정에 장소를 추가하면 기록과 연결할 수 있어요.</small>}
              </label>
            </div>
            <label>
              <span>내용</span>
              <textarea value={journalDraft.body} onChange={event => setJournalDraft(current => ({ ...current, body: event.target.value }))} placeholder="오늘의 여행을 기록해보세요." maxLength={2000} rows={4} />
            </label>
            <div className="travel-memory-photo-row">
              <label className="travel-memory-photo-picker">
                <Camera size={15} aria-hidden="true" /> 사진 추가
                <input type="file" accept="image/*" onChange={handleImageChange} />
              </label>
              {journalDraft.imageDataUrl && (
                <div className="travel-memory-photo-preview">
                  <img src={journalDraft.imageDataUrl} alt="새 여행 기록 미리보기" />
                  <button type="button" onClick={() => setJournalDraft(current => ({ ...current, imageDataUrl: '' }))} aria-label="선택한 사진 제거"><X size={13} /></button>
                </div>
              )}
            </div>
            {journalError && <p className="travel-memory-form-error" role="alert">{journalError}</p>}
            <div className="travel-memory-form-actions">
              {editingJournalId && <button type="button" className="travel-memory-cancel-button" onClick={resetJournalDraft}>취소</button>}
              <button type="submit" className="travel-memory-primary-button"><PlusCircle size={15} />{editingJournalId ? '기록 수정' : '기록 저장'}</button>
            </div>
          </form>
        ) : (
          <p className="travel-memory-readonly-note">공유된 일정에서는 기록을 확인만 할 수 있습니다.</p>
        )}
      </section>

      <section className="travel-memory-entry-list" aria-label="저장된 여행 기록">
        <div className="travel-memory-timeline-heading">
          <div>
            <span className="travel-memory-card-kicker">TIMELINE</span>
            <h3>날짜별 여행 기록</h3>
          </div>
          <span className="travel-memory-timeline-count">{visibleJournalEntries.length} / {journalEntries.length}</span>
        </div>
        {journalEntries.length === 0 ? (
          <div className="travel-memory-empty-state">
            <FileText size={28} aria-hidden="true" />
            <strong>아직 여행 기록이 없습니다.</strong>
            <span>사진과 짧은 메모로 여행의 순간을 남겨보세요.</span>
          </div>
        ) : (
          <>
            <div className="travel-memory-timeline-filter" role="group" aria-label="여행 기록 일차 필터">
              <button
                type="button"
                className={journalDayFilter === 'all' ? 'is-active' : ''}
                aria-pressed={journalDayFilter === 'all'}
                onClick={() => setJournalDayFilter('all')}
              >전체 기록</button>
              {journalDayOptions.map(day => (
                <button
                  key={`journal-day-filter-${day}`}
                  type="button"
                  className={selectedJournalDay === day ? 'is-active' : ''}
                  aria-pressed={selectedJournalDay === day}
                  onClick={() => setJournalDayFilter(String(day))}
                >{day}일차</button>
              ))}
            </div>
            {visibleJournalEntries.length === 0 ? (
              <div className="travel-memory-empty-state">
                <FileText size={28} aria-hidden="true" />
                <strong>선택한 일차에 기록이 없습니다.</strong>
                <span>다른 일차를 선택하거나 전체 기록을 확인해보세요.</span>
              </div>
            ) : visibleJournalEntries.map(entry => {
              const entryDay = getJournalEntryDay(entry, trip);
              return (
                <article key={entry.id} className="travel-memory-entry-card">
                  <div className="travel-memory-entry-timeline-marker" aria-hidden="true">
                    <span>{entryDay ? `${entryDay}일차` : '기록'}</span>
                  </div>
                  {entry.imageDataUrl && <img className="travel-memory-entry-image" src={entry.imageDataUrl} alt="" />}
                  <div className="travel-memory-entry-content">
                    <div className="travel-memory-entry-meta">
                      <span>{formatJournalDate(entry.date)}</span>
                      {!readOnly && (
                        <div>
                          <button type="button" onClick={() => editJournalEntry(entry)} aria-label="여행 기록 수정"><Edit2 size={13} /></button>
                          <button type="button" onClick={() => deleteJournalEntry(entry.id)} aria-label="여행 기록 삭제"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                    {entry.title && <h4>{entry.title}</h4>}
                    {entry.body && <p>{entry.body}</p>}
                    {entry.place && (
                      Number.isFinite(entry.place.lat) && Number.isFinite(entry.place.lng) && onOpenPlace ? (
                        <button
                          type="button"
                          className="travel-memory-entry-place"
                          onClick={() => onOpenPlace(entry.place)}
                          title="지도에서 장소 보기"
                        >
                          <MapPin size={13} aria-hidden="true" />
                          <span>{entry.place.day ? `${entry.place.day}일차 · ` : ''}{entry.place.name}</span>
                          <span className="travel-memory-entry-place-action">지도에서 장소 보기</span>
                        </button>
                      ) : (
                        <span className="travel-memory-entry-place is-static">
                          <MapPin size={13} aria-hidden="true" />
                          {entry.place.day ? `${entry.place.day}일차 · ` : ''}{entry.place.name}
                        </span>
                      )
                    )}
                  </div>
                </article>
              );
            })}
          </>
        )}
      </section>
    </div>
  );
}
