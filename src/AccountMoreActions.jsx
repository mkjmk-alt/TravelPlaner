import { ChevronRight, Lock, Trash2 } from 'lucide-react';

export default function AccountMoreActions({ session, onSignOut, onLogin, onDeleteAccount }) {
  const isSignedIn = Boolean(session);

  return (
    <>
      <button type="button" className="mobile-more-item" onClick={isSignedIn ? onSignOut : onLogin}>
        <span className="mobile-more-item-icon"><Lock size={17} /></span>
        <span className="mobile-more-item-copy">
          <strong>{isSignedIn ? '로그아웃' : '로그인 / 회원가입'}</strong>
          <small>{isSignedIn ? '현재 계정에서 로그아웃합니다.' : '여러 기기에서 여행을 이어갈 수 있어요.'}</small>
        </span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>

      {isSignedIn && (
        <button type="button" className="mobile-more-item mobile-more-item--danger" onClick={onDeleteAccount}>
          <span className="mobile-more-item-icon is-danger"><Trash2 size={17} /></span>
          <span className="mobile-more-item-copy">
            <strong>계정 삭제</strong>
            <small>계정과 연결된 데이터를 영구 삭제합니다.</small>
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      )}
    </>
  );
}
