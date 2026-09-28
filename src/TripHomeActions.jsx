import React from 'react';
import { Clipboard, Download, PlusCircle, Users } from 'lucide-react';

export default function TripHomeActions({
  onCreateNewTrip,
  onCreateAiPlan,
  onJoinTrip,
  deferredInstallPrompt,
  onInstallApp
}) {
  return (
    <div className="trip-home-actions" role="group" aria-label="여행 바로가기">
      <button
        type="button"
        onClick={onCreateNewTrip}
        className="trip-home-action trip-home-action--primary"
      >
        <PlusCircle size={18} aria-hidden="true" />
        새 여행 계획하기
      </button>
      <button
        type="button"
        onClick={onCreateAiPlan}
        className="trip-home-action trip-home-action--ai"
      >
        <Clipboard size={18} aria-hidden="true" />
        AI로 일정 만들기
      </button>
      <button
        type="button"
        onClick={onJoinTrip}
        className="trip-home-action trip-home-action--join"
      >
        <Users size={18} aria-hidden="true" />
        참여하기
      </button>
      {deferredInstallPrompt && (
        <button
          type="button"
          onClick={onInstallApp}
          className="trip-home-action trip-home-action--install"
        >
          <Download size={18} aria-hidden="true" />
          앱으로 설치
        </button>
      )}
    </div>
  );
}
