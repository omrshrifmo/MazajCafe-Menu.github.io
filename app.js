// Register Service Worker for instant offline & repeat-visit caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.debug('Service Worker registration skipped:', err);
    });
  });
}

const welcomePage = document.getElementById('welcomePage');
const galleryPage = document.getElementById('galleryPage');
const proceedButton = document.getElementById('proceedButton');
const backToWelcomeButton = document.getElementById('backToWelcomeButton');

const galleryCards = Array.from(document.querySelectorAll('.gallery-card'));
const galleryImages = Array.from(document.querySelectorAll('.gallery-image'));
const viewImageButtons = Array.from(document.querySelectorAll('.view-image-button'));

const zoomOverlay = document.getElementById('zoomOverlay');
const viewerLayout = document.getElementById('viewerLayout');
const zoomedImage = document.getElementById('zoomedImage');
const qualityIndicator = document.getElementById('qualityIndicator');
const gestureHint = document.getElementById('gestureHint');

const closeButton = document.getElementById('closeButton');
const previousButton = document.getElementById('previousButton');
const nextButton = document.getElementById('nextButton');

const zoomInButton = document.getElementById('zoomInButton');
const zoomOutButton = document.getElementById('zoomOutButton');
const resetButton = document.getElementById('resetButton');

const zoomLevel = document.getElementById('zoomLevel');
const imageCounter = document.getElementById('imageCounter');

let currentIndex = 0;
let scale = 1.0;
let translateX = 0;
let translateY = 0;

const MIN_ZOOM = 1.0;
const MAX_ZOOM = 6.0;
const ZOOM_STEP = 0.35;

// Image natural dimensions
const imgNaturalWidth = 6250;
const imgNaturalHeight = 4419;
const imgRatio = imgNaturalWidth / imgNaturalHeight;

let layoutWidth = 0;
let layoutHeight = 0;
let baseWidth = 0;
let baseHeight = 0;

// Pointers & gestures
const pointers = new Map();
let lastPinchDistance = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let startingTranslateX = 0;
let startingTranslateY = 0;
let lastTapTime = 0;

let swipeStartX = 0;
let swipeStartY = 0;
let isSwiping = false;

let rafId = null;

function refreshLayoutBounds() {
  layoutWidth = viewerLayout.clientWidth || window.innerWidth;
  layoutHeight = viewerLayout.clientHeight || window.innerHeight;

  const containerRatio = layoutWidth / (layoutHeight || 1);
  if (containerRatio > imgRatio) {
    baseHeight = layoutHeight;
    baseWidth = baseHeight * imgRatio;
  } else {
    baseWidth = layoutWidth;
    baseHeight = baseWidth / imgRatio;
  }
}

function limitPan() {
  const currentWidth = baseWidth * scale;
  const currentHeight = baseHeight * scale;

  const maxPanX = Math.max(0, (currentWidth - layoutWidth) / 2);
  const maxPanY = Math.max(0, (currentHeight - layoutHeight) / 2);

  translateX = Math.max(-maxPanX, Math.min(maxPanX, translateX));
  translateY = Math.max(-maxPanY, Math.min(maxPanY, translateY));
}

function renderViewerImage() {
  const currentWidth = baseWidth * scale;
  const currentHeight = baseHeight * scale;

  zoomedImage.style.maxWidth = 'none';
  zoomedImage.style.maxHeight = 'none';
  zoomedImage.style.width = `${currentWidth}px`;
  zoomedImage.style.height = `${currentHeight}px`;
  zoomedImage.style.left = `${(layoutWidth - currentWidth) / 2}px`;
  zoomedImage.style.top = `${(layoutHeight - currentHeight) / 2}px`;
  zoomedImage.style.transform = `translate3d(${translateX}px, ${translateY}px, 0)`;

  zoomLevel.textContent = `${Math.round(scale * 100)}%`;
}

function scheduleRender() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    renderViewerImage();
    rafId = null;
  });
}

function setZoom(newScale, focalX = 0, focalY = 0) {
  const oldScale = scale;
  scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));

  if (scale === MIN_ZOOM) {
    translateX = 0;
    translateY = 0;
  } else if (oldScale !== scale && (focalX !== 0 || focalY !== 0)) {
    const ratio = scale / oldScale;
    translateX = focalX - (focalX - translateX) * ratio;
    translateY = focalY - (focalY - translateY) * ratio;
  }

  limitPan();
  scheduleRender();
}

function resetZoom() {
  scale = 1.0;
  translateX = 0;
  translateY = 0;
  scheduleRender();
}

// Progressive image loader: instant preview + pristine master
const preloadedCache = new Set();
let activeLoader = null;

function loadProgressiveImage(index) {
  const selectedEl = galleryImages[index];
  const previewSrc = selectedEl.getAttribute('data-preview') || ('mazaj' + (index + 1) + '_preview.webp');
  const fullSrc = selectedEl.getAttribute('data-full') || ('mazaj' + (index + 1) + '.webp');

  zoomedImage.alt = selectedEl.alt || '';

  if (activeLoader) {
    activeLoader.onload = null;
    activeLoader.onerror = null;
  }

  // If full master image is already preloaded in memory, switch to it immediately
  if (preloadedCache.has(fullSrc)) {
    zoomedImage.src = fullSrc;
    if (qualityIndicator) qualityIndicator.classList.remove('loading');
    scheduleRender();
    return;
  }

  // Display crisp preview immediately while full master loads in background
  zoomedImage.src = previewSrc;
  scheduleRender();

  if (qualityIndicator) qualityIndicator.classList.add('loading');

  const loader = new Image();
  activeLoader = loader;

  loader.onload = () => {
    preloadedCache.add(fullSrc);
    if (currentIndex === index && activeLoader === loader) {
      zoomedImage.src = fullSrc;
      if (qualityIndicator) qualityIndicator.classList.remove('loading');
      scheduleRender();
    }
  };

  loader.onerror = () => {
    if (qualityIndicator) qualityIndicator.classList.remove('loading');
  };

  loader.src = fullSrc;
}

function showImage(index) {
  currentIndex = (index + galleryImages.length) % galleryImages.length;
  refreshLayoutBounds();
  resetZoom();
  loadProgressiveImage(currentIndex);
  imageCounter.textContent = `${currentIndex + 1} / ${galleryImages.length}`;
}

async function openViewer(index) {
  showImage(index);
  zoomOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  refreshLayoutBounds();
  scheduleRender();

  if (gestureHint) {
    gestureHint.style.opacity = '1';
    setTimeout(() => {
      gestureHint.style.opacity = '0';
    }, 3500);
  }

  try {
    if (!document.fullscreenElement && zoomOverlay.requestFullscreen) {
      await zoomOverlay.requestFullscreen();
    }
  } catch (_) {}
}

async function closeViewer() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  } catch (_) {}

  zoomOverlay.classList.remove('active');
  document.body.style.overflow = '';
  resetZoom();
}

function preloadMasterImages() {
  ['mazaj1.webp', 'mazaj2.webp'].forEach((src) => {
    if (!preloadedCache.has(src)) {
      const img = new Image();
      img.onload = () => preloadedCache.add(src);
      img.src = src;
    }
  });
}

// Navigation & Actions
proceedButton.addEventListener('click', () => {
  welcomePage.classList.add('hidden');
  galleryPage.classList.remove('hidden');
  window.scrollTo(0, 0);

  if ('requestIdleCallback' in window) {
    requestIdleCallback(preloadMasterImages, { timeout: 1500 });
  } else {
    setTimeout(preloadMasterImages, 500);
  }
});

backToWelcomeButton.addEventListener('click', () => {
  galleryPage.classList.add('hidden');
  welcomePage.classList.remove('hidden');
  window.scrollTo(0, 0);
});

galleryCards.forEach((card, idx) => {
  card.addEventListener('click', () => openViewer(idx));
});

viewImageButtons.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const idx = Number(btn.getAttribute('data-image-index'));
    openViewer(idx);
  });
});

previousButton.addEventListener('click', (e) => {
  e.stopPropagation();
  showImage(currentIndex - 1);
});

nextButton.addEventListener('click', (e) => {
  e.stopPropagation();
  showImage(currentIndex + 1);
});

closeButton.addEventListener('click', (e) => {
  e.stopPropagation();
  closeViewer();
});

zoomInButton.addEventListener('click', (e) => {
  e.stopPropagation();
  setZoom(scale + ZOOM_STEP);
});

zoomOutButton.addEventListener('click', (e) => {
  e.stopPropagation();
  setZoom(scale - ZOOM_STEP);
});

resetButton.addEventListener('click', (e) => {
  e.stopPropagation();
  resetZoom();
});

// Wheel zoom
viewerLayout.addEventListener('wheel', (e) => {
  e.preventDefault();
  const step = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
  const rect = viewerLayout.getBoundingClientRect();
  const focalX = e.clientX - (rect.left + rect.width / 2);
  const focalY = e.clientY - (rect.top + rect.height / 2);
  setZoom(scale + step, focalX, focalY);
}, { passive: false });

// Pointer drag & pinch
viewerLayout.addEventListener('pointerdown', (e) => {
  const now = Date.now();
  if (now - lastTapTime < 320 && pointers.size === 0) {
    // Double tap
    e.preventDefault();
    const rect = viewerLayout.getBoundingClientRect();
    const focalX = e.clientX - (rect.left + rect.width / 2);
    const focalY = e.clientY - (rect.top + rect.height / 2);
    if (scale > 1.2) {
      resetZoom();
    } else {
      setZoom(3.5, focalX, focalY);
    }
    lastTapTime = 0;
    return;
  }
  lastTapTime = now;

  viewerLayout.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 1) {
    if (scale > 1.0) {
      isDragging = true;
      viewerLayout.classList.add('dragging');
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      startingTranslateX = translateX;
      startingTranslateY = translateY;
    } else {
      isSwiping = true;
      swipeStartX = e.clientX;
      swipeStartY = e.clientY;
    }
  } else if (pointers.size === 2) {
    isDragging = false;
    isSwiping = false;
    viewerLayout.classList.remove('dragging');
    const pts = Array.from(pointers.values());
    lastPinchDistance = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }
}, { passive: false });

viewerLayout.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2) {
    e.preventDefault();
    const pts = Array.from(pointers.values());
    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    if (lastPinchDistance && lastPinchDistance > 0) {
      const pinchRatio = dist / lastPinchDistance;
      const rect = viewerLayout.getBoundingClientRect();
      const midX = ((pts[0].x + pts[1].x) / 2) - (rect.left + rect.width / 2);
      const midY = ((pts[0].y + pts[1].y) / 2) - (rect.top + rect.height / 2);
      setZoom(scale * pinchRatio, midX, midY);
    }
    lastPinchDistance = dist;
    return;
  }

  if (isDragging && scale > 1.0) {
    e.preventDefault();
    translateX = startingTranslateX + (e.clientX - dragStartX);
    translateY = startingTranslateY + (e.clientY - dragStartY);
    limitPan();
    scheduleRender();
  }
}, { passive: false });

function handlePointerEnd(e) {
  if (pointers.has(e.pointerId)) {
    if (isSwiping && scale <= 1.0 && pointers.size === 1) {
      const dx = e.clientX - swipeStartX;
      const dy = e.clientY - swipeStartY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        if (dx < 0) {
          showImage(currentIndex + 1);
        } else {
          showImage(currentIndex - 1);
        }
      }
    }
    pointers.delete(e.pointerId);
  }

  if (pointers.size < 2) {
    lastPinchDistance = null;
  }
  if (pointers.size === 0) {
    isDragging = false;
    isSwiping = false;
    viewerLayout.classList.remove('dragging');
  }
}

viewerLayout.addEventListener('pointerup', handlePointerEnd);
viewerLayout.addEventListener('pointercancel', handlePointerEnd);

// Keyboard controls
document.addEventListener('keydown', (e) => {
  if (!zoomOverlay.classList.contains('active')) return;

  if (e.key === 'Escape') closeViewer();
  else if (e.key === 'ArrowLeft') showImage(currentIndex - 1);
  else if (e.key === 'ArrowRight') showImage(currentIndex + 1);
  else if (e.key === '+' || e.key === '=') setZoom(scale + ZOOM_STEP);
  else if (e.key === '-') setZoom(scale - ZOOM_STEP);
  else if (e.key === '0') resetZoom();
});

// Resize handler
window.addEventListener('resize', () => {
  refreshLayoutBounds();
  if (zoomOverlay.classList.contains('active')) {
    limitPan();
    scheduleRender();
  }
});
