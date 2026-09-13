export const getMapAvailability = ({ apiKey, isLoaded, loadError }) => {
  if (!apiKey) {
    return {
      appAvailable: true,
      mapAvailable: false,
      reason: 'missing-key',
      title: '지도 API 키가 없습니다'
    };
  }

  if (loadError) {
    return {
      appAvailable: true,
      mapAvailable: false,
      reason: 'load-error',
      title: '지도를 불러오지 못했습니다',
      detail: loadError.message || '지도 서비스를 초기화하지 못했습니다.'
    };
  }

  if (!isLoaded) {
    return {
      appAvailable: true,
      mapAvailable: false,
      reason: 'loading',
      title: '여행 지도를 불러오는 중…',
      detail: ''
    };
  }

  return {
    appAvailable: true,
    mapAvailable: true,
    reason: null,
    title: '',
    detail: ''
  };
};
