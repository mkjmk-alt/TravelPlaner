export const getMapCaptureScale = (width, height) => {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('지도 화면을 먼저 열어주세요.');
  }
  return Math.min(2, 2048 / Math.max(width, height), Math.sqrt(3000000 / (width * height)));
};

export const captureMapSnapshot = async element => {
  if (!element?.isConnected) throw new Error('지도 화면을 먼저 열어주세요.');
  if (element.querySelector('.gm-err-container')) throw new Error('지도가 정상적으로 표시된 후 다시 저장해주세요.');
  const bounds = element.getBoundingClientRect();
  const scale = getMapCaptureScale(bounds.width, bounds.height);
  const visible = image => {
    const rect = image.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.right > bounds.left && rect.left < bounds.right
      && rect.bottom > bounds.top && rect.top < bounds.bottom;
  };
  const images = [...element.querySelectorAll('img')].filter(visible);
  const tiles = images.filter(image => /\/maps\/vt|\/kh\/v|\/vt\?/.test(image.currentSrc || image.src));
  const svgImages = new Map(images.filter(image => (image.currentSrc || image.src).startsWith('data:image/svg+xml'))
    .map(image => [image.currentSrc || image.src, image]));
  if (!tiles.length || [...tiles, ...svgImages.values()].some(image => !image.complete || !image.naturalWidth)) {
    throw new Error('지도를 불러오는 중입니다. 잠시 후 다시 저장해주세요.');
  }
  // Fail visibly when tiles cannot be copied; never save a blank background
  // after the image renderer silently skips a cross-origin map tile.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    await Promise.all([...new Set(tiles.map(image => image.currentSrc || image.src))].map(async url => {
      const response = await fetch(url, { mode: 'cors', cache: 'force-cache', signal: controller.signal });
      if (!response.ok) throw new Error('지도 이미지를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }));
  } catch {
    throw new Error('지도 이미지를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
  } finally {
    clearTimeout(timer);
  }
  const { default: html2canvas } = await import('html2canvas');
  let canvas;
  try {
    canvas = await html2canvas(element, {
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      scale,
      imageTimeout: 10000,
      ignoreElements: node => node.matches('.gm-style-iw-t, .gm-style-iw-tc, [data-map-snapshot-ignore]'),
      onclone: (clonedDocument, clonedElement) => {
        // SVG data images without intrinsic dimensions (the Google logo) are
        // clipped by the renderer. Rasterize the already loaded originals only
        // in the clone, preserving their CSS size and position on the map.
        clonedElement.querySelectorAll('img').forEach(image => {
          const original = svgImages.get(image.currentSrc || image.src);
          if (!original) return;
          const raster = clonedDocument.createElement('canvas');
          const imageScale = getMapCaptureScale(original.naturalWidth, original.naturalHeight);
          raster.width = Math.ceil(original.naturalWidth * Math.min(1, imageScale));
          raster.height = Math.ceil(original.naturalHeight * Math.min(1, imageScale));
          raster.getContext('2d').drawImage(original, 0, 0, raster.width, raster.height);
          image.src = raster.toDataURL('image/png');
          raster.width = 0;
          raster.height = 0;
        });
      }
    });
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob
      ? resolve(blob)
      : reject(new Error('지도 이미지를 만들지 못했습니다. 다시 시도해주세요.')), 'image/png'));
  } catch {
    throw new Error('지도 이미지를 만들지 못했습니다. 지도가 완전히 표시된 후 다시 시도해주세요.');
  } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
};
