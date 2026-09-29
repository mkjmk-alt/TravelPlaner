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
        aria-label="새 여행 계획하기"
      >
        <PlusCircle size={18} aria-hidden="true" />
        <span className="trip-home-action-label-full">새 여행 계획하기</span>
        <span className="trip-home-action-label-compact">새 여행</span>
      </button>
      <button
        type="button"
        onClick={onCreateAiPlan}
        className="trip-home-action trip-home-action--ai"
        aria-label="AI로 일정 만들기"
      >
        <Clipboard size={18} aria-hidden="true" />
        <span className="trip-home-action-label-full">AI로 일정 만들기</span>
        <span className="trip-home-action-label-compact">AI 일정</span>
      </button>
      <button
        type="button"
        onClick={onJoinTrip}
        className="trip-home-action trip-home-action--join"
        aria-label="참여하기"
      >
        <Users size={18} aria-hidden="true" />
        <span className="trip-home-action-label-full">참여하기</span>
        <span className="trip-home-action-label-compact">참여</span>
      </button>
      {deferredInstallPrompt && (
        <button
          type="button"
          onClick={onInstallApp}
          className="trip-home-action trip-home-action--install"
          aria-label="앱으로 설치"
        >
          <Download size={18} aria-hidden="true" />
          <span className="trip-home-action-label-full">앱으로 설치</span>
          <span className="trip-home-action-label-compact">앱 설치</span>
        </button>
      )}
    </div>
  );
}
