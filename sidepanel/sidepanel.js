const lensFrame = document.getElementById('lensFrame');
const emptyState = document.getElementById('emptyState');
const loadingOverlay = document.getElementById('loadingOverlay');
const previewThumb = document.getElementById('previewThumb');
const loadingText = document.getElementById('loadingText');
const loadingTabBtn = document.getElementById('loadingTabBtn');
const fallbackBanner = document.getElementById('fallbackBanner');
const fallbackText = document.getElementById('fallbackText');
const fallbackTabBtn = document.getElementById('fallbackTabBtn');
const fallbackCloseBtn = document.getElementById('fallbackCloseBtn');
const errorToast = document.getElementById('errorToast');
const lensForm = document.getElementById('lensForm');
const lensFileInput = document.getElementById('lensFileInput');

const captureBtn = document.getElementById('captureBtn');
const pasteBtn = document.getElementById('pasteBtn');
const openTabBtn = document.getElementById('openTabBtn');
const emptyCaptureBtn = document.getElementById('emptyCaptureBtn');
const emptyPickBtn = document.getElementById('emptyPickBtn');
const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');

let lastHandledJobId = null;
let lastSearchJob = null;
let lastResultUrl = null;
let hasLoadedResult = false;
let errorTimer = null;
let loadTimeout = null;
let currentUploadController = null;

// Connect persistent port so service worker always knows Side Panel is open and ready
let panelPort = null;
try {
  panelPort = chrome.runtime.connect({ name: 'lens-sidepanel' });
  panelPort.onMessage.addListener((message) => {
    if (message?.type === 'RUN_LENS_JOB' && message.job) {
      runLensJob(message.job);
    }
  });
} catch {
  // Ignore port connect errors
}

function getUiLanguageCode() {
  try {
    const lang = chrome.i18n?.getUILanguage?.() || navigator.language || 'fr';
    return lang.split(/[-_]/)[0] || 'fr';
  } catch {
    return 'fr';
  }
}

function showToast(text, durationMs = 3600) {
  if (errorTimer) clearTimeout(errorTimer);
  errorToast.textContent = text;
  errorToast.style.display = 'block';
  if (durationMs > 0) {
    errorTimer = setTimeout(() => {
      errorToast.style.display = 'none';
    }, durationMs);
  }
}

function showFallbackBanner(text) {
  fallbackText.textContent = text;
  fallbackBanner.style.display = 'flex';
}

function hideFallbackBanner() {
  fallbackBanner.style.display = 'none';
}

function setLoading(active, text = 'Recherche avec Google Lens…', thumbDataUrl = null) {
  loadingText.textContent = text;
  if (thumbDataUrl) {
    previewThumb.src = thumbDataUrl;
    previewThumb.style.display = 'block';
  } else if (!active) {
    previewThumb.style.display = 'none';
  }
  loadingOverlay.style.display = active ? 'flex' : 'none';

  if (loadTimeout) clearTimeout(loadTimeout);
  if (active) {
    loadTimeout = setTimeout(() => {
      loadingOverlay.style.display = 'none';
      showFallbackBanner("Google Lens met du temps à s'afficher dans le panneau.");
    }, 15000);
  }
}

function dataUrlToBlob(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    throw new Error('Format de capture invalide.');
  }
  const header = dataUrl.slice(0, commaIdx);
  const base64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = /data:([^;]+)/i.exec(header);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { blob: new Blob([bytes], { type: mimeType }), mimeType };
}

function extensionFromMime(mimeType = '') {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  return 'jpg';
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Lecture de l'image impossible."));
    reader.readAsDataURL(blob);
  });
}

async function openCurrentInTab() {
  if (lastResultUrl) {
    await chrome.tabs.create({ url: lastResultUrl, active: true });
    return;
  }
  if (!lastSearchJob) {
    await chrome.tabs.create({ url: 'https://lens.google.com/', active: true });
    return;
  }
  if (lastSearchJob.mode === 'url' && lastSearchJob.url) {
    await chrome.tabs.create({ url: lastSearchJob.url, active: true });
    return;
  }
  if (lastSearchJob.mode === 'upload' && lastSearchJob.dataUrl) {
    await chrome.runtime.sendMessage({
      type: 'OPEN_LENS_UPLOAD_TAB',
      dataUrl: lastSearchJob.dataUrl,
      mimeType: lastSearchJob.mimeType || 'image/jpeg',
    });
    return;
  }
  await chrome.tabs.create({ url: 'https://lens.google.com/', active: true });
}

function submitViaIframeForm(blob, mimeType) {
  const ext = extensionFromMime(mimeType);
  const file = new File([blob], `capture.${ext}`, { type: mimeType });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  lensFileInput.files = transfer.files;
  lensForm.action = `https://lens.google.com/v3/upload?hl=${encodeURIComponent(getUiLanguageCode())}`;
  lensForm.submit();
}

async function uploadJobToSidePanel(job) {
  if (currentUploadController) {
    currentUploadController.abort();
  }
  const controller = new AbortController();
  currentUploadController = controller;
  const timeoutId = setTimeout(() => controller.abort(), 14000);

  hideFallbackBanner();
  lastSearchJob = job;
  lastResultUrl = null;
  hasLoadedResult = true;
  emptyState.style.display = 'none';
  setLoading(true, 'Envoi de la capture vers Google Lens…', job.dataUrl);

  try {
    const { blob, mimeType } = dataUrlToBlob(job.dataUrl);
    const ext = extensionFromMime(mimeType);
    const formData = new FormData();
    formData.append('encoded_image', blob, `capture.${ext}`);

    const hl = getUiLanguageCode();
    const uploadEndpoint = `https://lens.google.com/v3/upload?hl=${encodeURIComponent(hl)}`;

    const res = await fetch(uploadEndpoint, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (controller.signal.aborted) return;

    const finalUrl = res.url || '';

    if (finalUrl.includes('/sorry/')) {
      setLoading(false);
      showFallbackBanner('Google demande une vérification avant affichage.');
      await openCurrentInTab();
      return;
    }

    if (finalUrl.includes('consent.google.')) {
      lastResultUrl = finalUrl;
      setLoading(true, 'Validation Google requise…');
      lensFrame.src = finalUrl;
      showFallbackBanner('Si la page de consentement bloque, ouvrez-la dans un onglet.');
      return;
    }

    if (res.ok && finalUrl && !finalUrl.includes('/v3/upload')) {
      lastResultUrl = finalUrl;
      setLoading(true, 'Chargement des résultats Google Lens…');
      lensFrame.src = finalUrl;
      return;
    }

    // Fallback: try direct form submit to iframe and reveal tab option
    setLoading(true, 'Tentative de chargement direct…');
    submitViaIframeForm(blob, mimeType);
    showFallbackBanner("Si le panneau reste vide, cliquez sur « Ouvrir dans un onglet ».");
  } catch (err) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError' && controller !== currentUploadController) return;

    try {
      const { blob, mimeType } = dataUrlToBlob(job.dataUrl);
      submitViaIframeForm(blob, mimeType);
      showFallbackBanner("Connexion directe lente ou bloquée : ouvrez dans un onglet si besoin.");
    } catch (innerErr) {
      setLoading(false);
      showToast(innerErr?.message || "Impossible d'envoyer la capture.");
      showFallbackBanner("Échec de l'aperçu intégré — ouvrez dans un onglet.");
    }
  }
}

function runLensJob(job) {
  if (!job || !job.id || job.id === lastHandledJobId) return;
  lastHandledJobId = job.id;

  if (job.mode === 'selecting') {
    hideFallbackBanner();
    if (!hasLoadedResult) {
      emptyState.style.display = 'flex';
    }
    setLoading(false);
    return;
  }

  if (job.mode === 'cancelled') {
    setLoading(false);
    if (!hasLoadedResult) {
      emptyState.style.display = 'flex';
    }
    return;
  }

  if (job.mode === 'pending') {
    emptyState.style.display = 'none';
    setLoading(true, job.text || "Préparation de l'image…");
    return;
  }

  if (job.mode === 'paste') {
    hasLoadedResult = false;
    hideFallbackBanner();
    emptyState.style.display = 'flex';
    setLoading(false);
    if (job.notice) showToast(job.notice, 4200);
    return;
  }

  if (job.mode === 'url' && job.url) {
    hideFallbackBanner();
    lastSearchJob = job;
    lastResultUrl = job.url;
    hasLoadedResult = true;
    emptyState.style.display = 'none';
    setLoading(true, 'Ouverture de Google Lens…');
    lensFrame.src = job.url;
    return;
  }

  if (job.mode === 'upload' && job.dataUrl) {
    uploadJobToSidePanel(job);
  }
}

async function consumeStoredJob() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_LATEST_LENS_JOB' }).catch(() => null);
    if (res?.job) {
      runLensJob(res.job);
    }

    const { latestLensJob } = await chrome.storage.local.get('latestLensJob');
    if (!latestLensJob) return;
    await chrome.storage.local.remove('latestLensJob');
    if (Date.now() - (latestLensJob.createdAt || 0) <= 45000) {
      runLensJob(latestLensJob);
    }
  } catch {
    // Ignore storage read errors
  }
}

async function handleLocalBlob(blob) {
  if (!blob || !blob.type.startsWith('image/')) {
    showToast('Veuillez fournir une image valide (PNG, JPG, WebP…).');
    return;
  }
  try {
    setLoading(true, 'Envoi vers Google Lens…');
    const dataUrl = await blobToDataUrl(blob);
    runLensJob({
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      mode: 'upload',
      dataUrl,
      mimeType: blob.type || 'image/png',
      createdAt: Date.now(),
    });
  } catch (err) {
    setLoading(false);
    showToast(err?.message || 'Erreur pendant le chargement de l’image.');
  }
}

lensFrame.addEventListener('load', () => {
  if (hasLoadedResult) {
    setLoading(false);
  }
});

async function triggerActiveCapture() {
  const res = await chrome.runtime.sendMessage({ type: 'START_CAPTURE_ACTIVE_TAB' }).catch(() => null);
  if (res && res.ok === false && res.error) {
    showToast(res.error, 4200);
  }
}

captureBtn.addEventListener('click', triggerActiveCapture);
emptyCaptureBtn.addEventListener('click', triggerActiveCapture);
openTabBtn.addEventListener('click', openCurrentInTab);
loadingTabBtn.addEventListener('click', openCurrentInTab);
fallbackTabBtn.addEventListener('click', openCurrentInTab);
fallbackCloseBtn.addEventListener('click', hideFallbackBanner);

pasteBtn.addEventListener('click', async () => {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imgType = item.types.find((t) => t.startsWith('image/'));
      if (imgType) {
        const blob = await item.getType(imgType);
        await handleLocalBlob(blob);
        return;
      }
    }
    showToast('Aucune image trouvée dans le presse-papiers.');
  } catch {
    showToast('Cliquez dans le panneau et appuyez sur Ctrl+V.');
  }
});

emptyPickBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) handleLocalBlob(file);
  fileInput.value = '';
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) handleLocalBlob(file);
});

window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (blob) {
        e.preventDefault();
        handleLocalBlob(blob);
        return;
      }
    }
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'RUN_LENS_JOB' && message.job) {
    runLensJob(message.job);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.latestLensJob?.newValue) return;
  const job = changes.latestLensJob.newValue;
  chrome.storage.local.remove('latestLensJob').catch(() => {});
  runLensJob(job);
});

consumeStoredJob();
