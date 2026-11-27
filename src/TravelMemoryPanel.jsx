import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronRight, Edit2, FileText, MapPin, PlusCircle, Trash2, X } from 'lucide-react';
import TripManagementPanel from './TripManagementPanel';
import {
  createJournalEntry,
  getItineraryPlaceOptions,
  getJournalAlbumDates,
  getJournalDateKey,
  getTripCountdownLabel,
  normalizeJournalEntry,
  sortJournalEntriesForTimeline
} from './travelMemory';

const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const EMPTY_JOURNAL = [];
const dateFormatter = new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' });
const formatJournalDate = (date) => date ? dateFormatter.format(new Date(`${date}T00:00:00`)) : '날짜 미정';

export default function TravelMemoryPanel({
  trip,
  readOnly = false,
  savedPlaces = [],
  onUpdateTrip,
  onOpenItinerary,
  onOpenPlace,
  onOpenManagement,
  managementActions
}) {
  const malformedJournal = trip?.journalEntries != null && !Array.isArray(trip.journalEntries);
  const rows = Array.isArray(trip?.journalEntries) ? trip.journalEntries : EMPTY_JOURNAL;
  const canEdit = !readOnly && !malformedJournal && typeof onUpdateTrip === 'function';
  const journalEntries = useMemo(() => sortJournalEntriesForTimeline(rows.flatMap((row, sourceIndex) => {
    const entry = normalizeJournalEntry(row);
    return entry ? [{ ...entry, sourceIndex, dateKey: getJournalDateKey(entry.date) }] : [];
  })), [rows]);
  const itineraryPlaceOptions = useMemo(() => {
    const options = new Map(getItineraryPlaceOptions(trip).map(place => [place.key, place]));
    for (const { place } of journalEntries) {
      if (place && !options.has(place.key)) options.set(place.key, place);
    }
    return [...options.values()];
  }, [trip, journalEntries]);
  const [dateFilter, setDateFilter] = useState(null);
  const [journalDraft, setJournalDraft] = useState(null);
  const [editing, setEditing] = useState(null);
  const [journalError, setJournalError] = useState('');
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const imageReader = useRef(null);
  const journalForm = useRef(null);

  const dateOptions = getJournalAlbumDates(trip, journalEntries);
  if (dateFilter !== null && !dateOptions.includes(dateFilter)) dateOptions.push(dateFilter);
  const visibleEntries = dateFilter === null ? journalEntries : journalEntries.filter(entry => entry.dateKey === dateFilter);
  const editorOpen = canEdit && journalDraft !== null;

  useEffect(() => () => imageReader.current?.abort(), []);
  useEffect(() => {
    if (editorOpen) {
      journalForm.current?.scrollIntoView({ block: 'nearest' });
      journalForm.current?.elements.namedItem('journal-title')?.focus({ preventScroll: true });
    }
  }, [editorOpen, editing]);

  const stopReadingPhoto = () => {
    imageReader.current?.abort();
    imageReader.current = null;
    setReadingPhoto(false);
  };

  const showEditor = (entry) => {
    stopReadingPhoto();
    setEditing(entry ? { index: entry.sourceIndex, source: rows[entry.sourceIndex], placeKey: entry.place?.key || '' } : null);
    setJournalDraft({
      date: entry ? entry.date : dateFilter ?? (getJournalDateKey(trip?.startDate) || getJournalDateKey(new Date())),
      title: entry?.title || '',
      body: entry?.body || '',
      imageDataUrl: entry?.imageDataUrl || '',
      placeKey: entry?.place?.key || ''
    });
    setJournalError('');
  };

  const closeEditor = () => {
    stopReadingPhoto();
    setJournalDraft(null);
    setEditing(null);
    setJournalError('');
  };

  const updateDraft = (field, value) => {
    setJournalDraft(current => current ? { ...current, [field]: value } : current);
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    stopReadingPhoto();
    if (file.size > MAX_IMAGE_BYTES) {
      setJournalError('사진은 2.5MB 이하만 추가할 수 있습니다.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setJournalError('이미지 파일을 선택해주세요.');
      return;
    }

    const reader = new FileReader();
    imageReader.current = reader;
    setReadingPhoto(true);
    setJournalError('');
    reader.onload = () => {
      if (imageReader.current !== reader) return;
      imageReader.current = null;
      setReadingPhoto(false);
      updateDraft('imageDataUrl', String(reader.result || ''));
    };
    reader.onerror = () => {
      if (imageReader.current !== reader) return;
      imageReader.current = null;
      setReadingPhoto(false);
      setJournalError('사진을 읽지 못했습니다. 다시 선택해주세요.');
    };
    reader.readAsDataURL(file);
  };

  const persistJournal = async (nextRows, onSaved, errorMessage) => {
    setSaving(true);
    setJournalError('');
    try {
      await onUpdateTrip({ journalEntries: nextRows });
      onSaved?.();
    } catch {
      setJournalError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const saveJournalEntry = (event) => {
    event.preventDefault();
    if (!canEdit || !journalDraft || saving || readingPhoto) return;
    const original = editing && rows[editing.index];
    if (editing && original !== editing.source && JSON.stringify(original) !== JSON.stringify(editing.source)) {
      setJournalError('기록이 변경되었습니다. 닫고 다시 열어주세요.');
      return;
    }

    const { date, title, body, imageDataUrl, placeKey } = journalDraft;
    if (!title.trim() && !body.trim() && !imageDataUrl && !original?.imageFileName) {
      setJournalError('제목, 내용 또는 사진 중 하나는 입력해주세요.');
      return;
    }

    const nextEntry = createJournalEntry({
      date,
      title,
      body,
      imageDataUrl,
      place: itineraryPlaceOptions.find(place => place.key === placeKey)
    });
    let nextRows = [nextEntry, ...rows];
    if (editing) {
      const edited = {
        ...original,
        ...(date !== String(original.date || '') ? { date: nextEntry.date } : {}),
        title: nextEntry.title,
        body: nextEntry.body,
        imageDataUrl: nextEntry.imageDataUrl,
        updatedAt: Math.max(nextEntry.updatedAt, (Number(original.updatedAt) || 0) + 1)
      };
      if (placeKey !== editing.placeKey) {
        if (nextEntry.place) edited.place = nextEntry.place;
        else delete edited.place;
      }
      nextRows = rows.map((row, index) => index === editing.index ? edited : row);
    }

    void persistJournal(nextRows, () => {
      if (dateFilter !== null) setDateFilter(getJournalDateKey(date));
      closeEditor();
    }, '기록을 저장하지 못했습니다. 다시 시도해주세요.');
  };

  const deleteJournalEntry = (sourceIndex) => {
    if (!canEdit || editorOpen || saving) return;
    void persistJournal(
      rows.filter((_, index) => index !== sourceIndex),
      null,
      '기록을 삭제하지 못했습니다. 다시 시도해주세요.'
    );
  };

  return (
    <div className="travel-memory-panel">
      <header className="travel-memory-hero">
        <div>
          <h2 className="menu-section-title">여행 기록</h2>
          <p>{trip?.name || '여행'}</p>
          {onOpenItinerary && (
            <button type="button" className="travel-memory-link-button" onClick={() => onOpenItinerary()}>
              일정 전체 보기 <ChevronRight size={14} aria-hidden="true" />
            </button>
          )}
        </div>
        <span className="travel-memory-status-chip">{getTripCountdownLabel(trip ?? {})}</span>
      </header>

      {onOpenManagement ? (
        <button type="button" className="travel-memory-secondary-button travel-memory-management-link" onClick={() => onOpenManagement()}>
          여행 관리 <ChevronRight size={14} aria-hidden="true" />
        </button>
      ) : (
        <details className="travel-memory-management">
          <summary>여행 관리 <ChevronRight size={14} aria-hidden="true" /></summary>
          <TripManagementPanel {...managementActions} trip={trip} readOnly={readOnly} savedPlaces={savedPlaces} onUpdateTrip={onUpdateTrip} />
        </details>
      )}

      <section className="travel-memory-entry-list" aria-label="사진과 메모 앨범">
        <div className="travel-memory-timeline-heading travel-memory-album-heading">
          <h3>사진과 메모</h3>
          <span className="travel-memory-timeline-count">{visibleEntries.length}개 기록</span>
          {canEdit && !editorOpen && (
            <button type="button" className="travel-memory-primary-button" disabled={saving} onClick={() => showEditor()}>
              <PlusCircle size={15} aria-hidden="true" /> 기록 추가
            </button>
          )}
        </div>

        <div className="travel-memory-timeline-filter" role="group" aria-label="여행 기록 날짜 필터">
          {[null, ...dateOptions].map(date => (
            <button
              key={date ?? 'all'}
              type="button"
              title={date || undefined}
              className={dateFilter === date ? 'is-active' : ''}
              aria-pressed={dateFilter === date}
              onClick={() => setDateFilter(date)}
            >{date === null ? '전체 기록' : formatJournalDate(date)}</button>
          ))}
        </div>

        {readOnly && <p className="travel-memory-readonly-note">공유된 일정에서는 기록을 확인만 할 수 있습니다.</p>}
        {malformedJournal && <p className="travel-memory-form-error" role="alert">저장된 기록 형식을 읽을 수 없습니다.</p>}
        {journalError && !editorOpen && canEdit && <p className="travel-memory-form-error" role="alert">{journalError}</p>}

        {editorOpen && (
          <section className="travel-memory-card travel-memory-journal-card">
            <div className="travel-memory-card-heading">
              <h3>{editing ? '여행 기록 수정' : '여행 기록 남기기'}</h3>
              <Camera size={18} aria-hidden="true" />
            </div>
            <form ref={journalForm} onSubmit={saveJournalEntry} className="travel-memory-journal-form">
              <fieldset className="travel-memory-journal-fields" disabled={saving}>
                <div className="travel-memory-form-grid">
                  <label>
                    <span>기록 날짜</span>
                    <input type="date" value={getJournalDateKey(journalDraft.date)} onChange={event => updateDraft('date', event.target.value)} />
                  </label>
                  <label>
                    <span>제목</span>
                    <input name="journal-title" value={journalDraft.title} onChange={event => updateDraft('title', event.target.value)} placeholder="예: 첫날의 저녁" maxLength={80} />
                  </label>
                  <label className="travel-memory-form-grid-wide">
                    <span>장소 연결 (선택)</span>
                    <select value={journalDraft.placeKey} onChange={event => updateDraft('placeKey', event.target.value)}>
                      <option value="">장소를 연결하지 않음</option>
                      {itineraryPlaceOptions.map(place => (
                        <option key={place.key} value={place.key}>
                          {place.day ? `${place.day}일차 · ` : ''}{place.name || place.id}{place.address ? ` · ${place.address}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="travel-memory-journal-body">
                  <span>내용</span>
                  <textarea value={journalDraft.body} onChange={event => updateDraft('body', event.target.value)} maxLength={2000} rows={4} />
                </label>
                <div className="travel-memory-photo-row">
                  <label className="travel-memory-photo-picker">
                    <Camera size={15} aria-hidden="true" /> {journalDraft.imageDataUrl ? '사진 변경' : '사진 추가'}
                    <input type="file" accept="image/*" onChange={handleImageChange} />
                  </label>
                  {journalDraft.imageDataUrl && (
                    <div className="travel-memory-photo-preview">
                      <img src={journalDraft.imageDataUrl} alt="여행 기록 사진 미리보기" />
                      <button type="button" onClick={() => { stopReadingPhoto(); updateDraft('imageDataUrl', ''); }} aria-label="선택한 사진 제거"><X size={13} /></button>
                    </div>
                  )}
                  {readingPhoto && <span role="status">사진을 읽고 있습니다.</span>}
                </div>
              </fieldset>
              {journalError && <p className="travel-memory-form-error" role="alert">{journalError}</p>}
              <div className="travel-memory-form-actions">
                <button type="button" className="travel-memory-cancel-button" onClick={closeEditor} disabled={saving}>취소</button>
                <button type="submit" className="travel-memory-primary-button" disabled={saving || readingPhoto}>{saving ? '저장 중' : editing ? '수정 저장' : '기록 저장'}</button>
              </div>
            </form>
          </section>
        )}

        {visibleEntries.length === 0 ? (
          <div className="travel-memory-empty-state" role="status">
            <FileText size={28} aria-hidden="true" />
            <strong>{dateFilter === null ? '아직 여행 기록이 없습니다.' : '선택한 날짜에 기록이 없습니다.'}</strong>
            {dateFilter !== null && (
              <button type="button" className="travel-memory-link-button" onClick={() => setDateFilter(null)}>전체 기록 보기</button>
            )}
          </div>
        ) : (
          <div className="travel-memory-album">
            {visibleEntries.map(entry => (
              <article key={entry.sourceIndex} className="travel-memory-entry-card">
                {entry.imageDataUrl && <img className="travel-memory-entry-image" src={entry.imageDataUrl} alt={entry.title || '여행 기록 사진'} loading="lazy" />}
                <div className="travel-memory-entry-content">
                  <div className="travel-memory-entry-meta">
                    {entry.dateKey
                      ? <time dateTime={entry.dateKey}>{formatJournalDate(entry.dateKey)}</time>
                      : <span>날짜 미정</span>}
                    {canEdit && (
                      <div>
                        <button type="button" disabled={editorOpen || saving} onClick={() => showEditor(entry)} aria-label="여행 기록 수정"><Edit2 size={13} /></button>
                        <button type="button" disabled={editorOpen || saving} onClick={() => deleteJournalEntry(entry.sourceIndex)} aria-label="여행 기록 삭제"><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                  {entry.title && <h4>{entry.title}</h4>}
                  {entry.body && <p>{entry.body}</p>}
                  {entry.place && (
                    Number.isFinite(entry.place.lat) && Number.isFinite(entry.place.lng) && onOpenPlace ? (
                      <button type="button" className="travel-memory-entry-place" onClick={() => onOpenPlace(entry.place)} title="지도에서 장소 보기">
                        <MapPin size={13} aria-hidden="true" />
                        <span>{entry.place.name || entry.place.id}</span>
                        <span className="travel-memory-entry-place-action">지도에서 장소 보기</span>
                      </button>
                    ) : (
                      <span className="travel-memory-entry-place is-static">
                        <MapPin size={13} aria-hidden="true" />
                        <span>{entry.place.name || entry.place.id}</span>
                      </span>
                    )
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
