import React from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';

export default class MapPaneErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="map-pane-error-state" role="alert">
        <AlertCircle size={38} aria-hidden="true" />
        <strong>지도를 불러오지 못했습니다</strong>
        <p>지도 화면에 일시적인 문제가 생겼습니다. 여행 일정과 다른 메뉴는 계속 이용할 수 있습니다.</p>
        <button type="button" onClick={this.props.onRetry}>
          <RotateCw size={16} aria-hidden="true" /> 다시 시도
        </button>
      </div>
    );
  }
}
