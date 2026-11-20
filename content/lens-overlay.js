(() => {
  const STATE_KEY = '__edgeGoogleLensState';
  if (window[STATE_KEY]?.active) {
    window[STATE_KEY].destroy();
    return;
  }

  const STORAGE_PREVIEW_KEY = 'lensPreviewMode';
  const MAX_PNG_PIXELS = 900000;
  const MAX_OUTPUT_DIM = 2400;

  const host = document.createElement('div');
  host.id = 'edge-google-lens-host';
  host.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;pointer-events:auto;opacity:0;transition:opacity 0.14s ease-out;';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Segoe UI", system-ui, -apple-system, sans-serif; }
    .backdrop {
      position: fixed;
      inset: 0;
      cursor: crosshair;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }
    canvas {
      display: block;
      width: 100vw;
      height: 100vh;
    }
    .toolbar {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 9px 7px 13px;
      background: rgba(24, 26, 32, 0.94);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      color: #f8f9fa;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 999px;
      box-shadow: 0 12px 34px rgba(0, 0, 0, 0.42);
      font-size: 13px;
      line-height: 1;
      z-index: 4;
      pointer-events: auto;
      white-space: nowrap;
      max-width: calc(100vw - 24px);
    }
    .lens-icon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      display: block;
    }
    .hint {
      color: #e8eaed;
      font-weight: 500;
      padding: 0 4px 0 2px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sep {
      width: 1px;
      height: 16px;
      background: rgba(255, 255, 255, 0.14);
      flex-shrink: 0;
    }
    .btn {
      appearance: none;
      border: 1px solid transparent;
      border-radius: 999px;
      cursor: pointer;
      font-size: 12.5px;
      font-weight: 600;
      padding: 7px 11px;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
    }
    .btn:active { transform: scale(0.97); }
    .btn-full {
      background: rgba(66, 133, 244, 0.22);
      color: #9ec0fb;
      border-color: rgba(138, 180, 248, 0.32);
    }
    .btn-full:hover { background: rgba(66, 133, 244, 0.34); }
    .btn-ghost {
      background: rgba(255, 255, 255, 0.08);
      color: #e8eaed;
      border-color: rgba(255, 255, 255, 0.1);
    }
    .btn-ghost:hover { background: rgba(255, 255, 255, 0.16); }
    .btn-toggle.active {
      background: rgba(52, 168, 83, 0.24);
      color: #8ce0a3;
      border-color: rgba(52, 168, 83, 0.45);
    }
    .btn-close {
      width: 28px;
      height: 28px;
      padding: 0;
      justify-content: center;
      background: rgba(255, 255, 255, 0.1);
      color: #e8eaed;
      font-size: 14px;
    }
    .btn-close:hover { background: rgba(255, 255, 255, 0.22); }
    .dim-badge {
      position: fixed;
      display: none;
      padding: 4px 8px;
      border-radius: 7px;
      background: rgba(20, 22, 28, 0.92);
      color: #e8eaed;
      border: 1px solid rgba(255, 255, 255, 0.16);
      font-size: 11.5px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      pointer-events: none;
      z-index: 3;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
    .action-dock {
      position: fixed;
      display: none;
      align-items: center;
      gap: 6px;
      padding: 6px;
      border-radius: 999px;
      background: rgba(24, 26, 32, 0.96);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.16);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.46);
      z-index: 4;
      pointer-events: auto;
    }
    .btn-lens {
      background: #8ab4f8;
      color: #13161d;
    }
    .btn-lens:hover { background: #a8c7fa; }
    .status-toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      padding: 10px 16px;
      border-radius: 999px;
      background: rgba(24, 26, 32, 0.95);
      color: #f8f9fa;
      border: 1px solid rgba(255, 255, 255, 0.16);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      font-size: 13px;
      font-weight: 500;
      display: none;
      z-index: 5;
      pointer-events: none;
    }
    @media (max-width: 720px) {
      .hint { display: none; }
      .sep { display: none; }
    }
  `;

  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';

  const canvas = document.createElement('canvas');
  backdrop.appendChild(canvas);

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <svg class="lens-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M7.5 4h3.2L12 2.5h3v3H8.5A3.5 3.5 0 0 0 5 9v3H2V9a5.5 5.5 0 0 1 5.5-5z"/>
      <path fill="#4285F4" d="M15 2.5h1.5L18 4a5.5 5.5 0 0 1 4 5.3V14h-3V9.3A2.5 2.5 0 0 0 16.5 7H15V2.5z"/>
      <path fill="#FBBC05" d="M2 12h3v3.5A2.5 2.5 0 0 0 7.5 18H13v3H7.5A5.5 5.5 0 0 1 2 15.5V12z"/>
      <circle fill="#4285F4" cx="12" cy="12.5" r="3.4"/>
      <circle fill="#34A853" cx="18.2" cy="18.2" r="2.1"/>
    </svg>
    <span class="hint">Glissez, entourez ou cliquez sur une image</span>
    <span class="sep"></span>
    <button type="button" class="btn btn-full" title="Capturer tout l'onglet visible">Toute la page</button>
    <button type="button" class="btn btn-ghost btn-paste" title="Rechercher une image du presse-papiers (Ctrl+V)">Coller</button>
    <button type="button" class="btn btn-ghost btn-toggle" title="Activer pour prévisualiser, copier ou enregistrer avant l'envoi">Aperçu</button>
    <button type="button" class="btn btn-close" title="Fermer (Échap)">✕</button>
  `;

  const dimBadge = document.createElement('div');
  dimBadge.className = 'dim-badge';

  const actionDock = document.createElement('div');
  actionDock.className = 'action-dock';
  actionDock.innerHTML = `
    <button type="button" class="btn btn-lens btn-send" title="Envoyer vers Google Lens (Entrée)">Rechercher</button>
    <button type="button" class="btn btn-ghost btn-copy" title="Copier l'image recadrée (Ctrl+C)">Copier</button>
    <button type="button" class="btn btn-ghost btn-save" title="Télécharger en PNG">Enregistrer</button>
    <button type="button" class="btn btn-close btn-retry" title="Nouvelle sélection (Échap)">↺</button>
  `;

  const toast = document.createElement('div');
  toast.className = 'status-toast';

  shadow.append(style, backdrop, toolbar, dimBadge, actionDock, toast);
  (document.body || document.documentElement).appendChild(host);
  requestAnimationFrame(() => {
    host.style.opacity = '1';
  });

  const ctx = canvas.getContext('2d');
  const hintEl = toolbar.querySelector('.hint');
  const fullBtn = toolbar.querySelector('.btn-full');
  const pasteBtn = toolbar.querySelector('.btn-paste');
  const previewToggleBtn = toolbar.querySelector('.btn-toggle');
  const closeBtn = toolbar.querySelector('.btn-close');
  const sendBtn = actionDock.querySelector('.btn-send');
  const copyBtn = actionDock.querySelector('.btn-copy');
  const saveBtn = actionDock.querySelector('.btn-save');
  const retryBtn = actionDock.querySelector('.btn-retry');

  let dpr = window.devicePixelRatio || 1;
  let width = window.innerWidth;
  let height = window.innerHeight;
  let dragging = false;
  let busy = false;
  let previewMode = false;
  let lockedBox = null;
  let hoveredBox = null;
  let lastHoverCheck = 0;
  let points = [];
  let startPt = null;
  let endPt = null;
  let toastTimer = null;

  chrome.storage.local
    .get(STORAGE_PREVIEW_KEY)
    .then((res) => {
      previewMode = Boolean(res?.[STORAGE_PREVIEW_KEY]);
      previewToggleBtn.classList.toggle('active', previewMode);
    })
    .catch(() => {});

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    drawOverlay();
    if (lockedBox) positionActionDock(lockedBox);
  }

  function getSelectionBox() {
    if (lockedBox) return lockedBox;
    if (!startPt || !endPt) return null;
    if (points.length >= 2) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const x = Math.max(0, minX);
      const y = Math.max(0, minY);
      const r = Math.min(width, maxX);
      const b = Math.min(height, maxY);
      return { x, y, w: Math.max(0, r - x), h: Math.max(0, b - y) };
    }
    const x = Math.max(0, Math.min(startPt.x, endPt.x));
    const y = Math.max(0, Math.min(startPt.y, endPt.y));
    const r = Math.min(width, Math.max(startPt.x, endPt.x));
    const b = Math.min(height, Math.max(startPt.y, endPt.y));
    return { x, y, w: r - x, h: b - y };
  }

  function isLassoPath() {
    if (lockedBox || points.length < 10 || !startPt || !endPt) return false;
    let totalLen = 0;
    for (let i = 1; i < points.length; i++) {
      totalLen += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    const diag = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);
    return totalLen > Math.max(40, diag * 1.38);
  }

  function drawRoundedRectPath(x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  function drawCornerHandles(x, y, w, h) {
    const len = Math.min(18, Math.max(8, Math.min(w, h) * 0.24));
    ctx.save();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;

    const corners = [
      [[x, y + len], [x, y], [x + len, y]],
      [[x + w - len, y], [x + w, y], [x + w, y + len]],
      [[x + w, y + h - len], [x + w, y + h], [x + w - len, y + h]],
      [[x + len, y + h], [x, y + h], [x, y + h - len]],
    ];
    for (const [p1, p2, p3] of corners) {
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.lineTo(p3[0], p3[1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  function updateDimBadge(box) {
    if (!box || box.w < 16 || box.h < 16) {
      dimBadge.style.display = 'none';
      return;
    }
    dimBadge.textContent = `${Math.round(box.w)} × ${Math.round(box.h)}`;
    dimBadge.style.display = 'block';
    const badgeW = dimBadge.offsetWidth || 76;
    const badgeH = dimBadge.offsetHeight || 24;
    const left = Math.min(width - badgeW - 10, Math.max(10, box.x));
    const top =
      box.y - badgeH - 8 >= 64
        ? box.y - badgeH - 8
        : Math.min(height - badgeH - 10, box.y + box.h + 8);
    dimBadge.style.left = `${Math.round(left)}px`;
    dimBadge.style.top = `${Math.round(top)}px`;
  }

  function drawOverlay() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(12, 16, 24, 0.4)';
    ctx.fillRect(0, 0, width, height);

    const activeBox = getSelectionBox();
    const targetBox = activeBox && activeBox.w >= 4 && activeBox.h >= 4 ? activeBox : hoveredBox;

    if (targetBox && targetBox.w >= 4 && targetBox.h >= 4) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      drawRoundedRectPath(targetBox.x, targetBox.y, targetBox.w, targetBox.h, 8);
      ctx.fill();
      ctx.restore();

      const grad = ctx.createLinearGradient(
        targetBox.x,
        targetBox.y,
        targetBox.x + targetBox.w,
        targetBox.y + targetBox.h
      );
      grad.addColorStop(0, '#4285F4');
      grad.addColorStop(0.35, '#EA4335');
      grad.addColorStop(0.7, '#FBBC05');
      grad.addColorStop(1, '#34A853');

      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth = activeBox ? 2.5 : 2;
      if (!activeBox) ctx.setLineDash([6, 4]);
      drawRoundedRectPath(targetBox.x, targetBox.y, targetBox.w, targetBox.h, 8);
      ctx.stroke();
      ctx.restore();

      drawCornerHandles(targetBox.x, targetBox.y, targetBox.w, targetBox.h);

      if (isLassoPath()) {
        ctx.save();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(66, 133, 244, 0.5)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
    updateDimBadge(activeBox);
  }

  function showToast(text, durationMs = 2400) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = text;
    toast.style.display = 'block';
    if (durationMs > 0) {
      toastTimer = setTimeout(() => {
        toast.style.display = 'none';
      }, durationMs);
    }
  }

  function detectHoveredMedia(clientX, clientY) {
    const now = performance.now();
    if (now - lastHoverCheck < 45) return;
    lastHoverCheck = now;

    const prevPE = host.style.pointerEvents;
    host.style.pointerEvents = 'none';
    const elems = document.elementsFromPoint(clientX, clientY);
    host.style.pointerEvents = prevPE;

    let found = null;
    for (const el of elems) {
      if (!el || el === host || el === document.documentElement || el === document.body) continue;
      const tag = el.tagName;
      if (tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'SVG') {
        const rect = el.getBoundingClientRect();
        if (
          rect.width >= 28 &&
          rect.height >= 28 &&
          rect.width < width * 0.94 &&
          rect.height < height * 0.94
        ) {
          const x = Math.max(0, rect.left);
          const y = Math.max(0, rect.top);
          const r = Math.min(width, rect.right);
          const b = Math.min(height, rect.bottom);
          if (r - x >= 24 && b - y >= 24) {
            found = { x, y, w: r - x, h: b - y };
            break;
          }
        }
      }
    }

    const changed =
      Boolean(found) !== Boolean(hoveredBox) ||
      (found &&
        hoveredBox &&
        (Math.abs(found.x - hoveredBox.x) > 1 ||
          Math.abs(found.y - hoveredBox.y) > 1 ||
          Math.abs(found.w - hoveredBox.w) > 1 ||
          Math.abs(found.h - hoveredBox.h) > 1));

    if (changed) {
      hoveredBox = found;
      backdrop.style.cursor = found ? 'pointer' : 'crosshair';
      drawOverlay();
    }
  }

  function waitNextRepaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  async function renderCroppedCanvas(box) {
    host.style.display = 'none';
    await waitNextRepaint();

    const captureRes = await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' });
    if (!captureRes?.ok || !captureRes?.dataUrl) {
      throw new Error(captureRes?.error || "Capture d'écran impossible");
    }

    const img = new Image();
    img.src = captureRes.dataUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Décodage de l'image échoué"));
    });

    const scaleX = img.naturalWidth / Math.max(1, window.innerWidth);
    const scaleY = img.naturalHeight / Math.max(1, window.innerHeight);

    const sx = Math.max(0, Math.round(box.x * scaleX));
    const sy = Math.max(0, Math.round(box.y * scaleY));
    const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.round(box.w * scaleX)));
    const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.round(box.h * scaleY)));

    let targetW = sw;
    let targetH = sh;
    if (sw > MAX_OUTPUT_DIM || sh > MAX_OUTPUT_DIM) {
      const ratio = Math.min(MAX_OUTPUT_DIM / sw, MAX_OUTPUT_DIM / sh);
      targetW = Math.max(1, Math.round(sw * ratio));
      targetH = Math.max(1, Math.round(sh * ratio));
    }

    const out = document.createElement('canvas');
    out.width = targetW;
    out.height = targetH;
    const outCtx = out.getContext('2d');
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);

    return out;
  }

  function canvasToPayload(outCanvas, forcePng = false) {
    const usePng = forcePng || outCanvas.width * outCanvas.height <= MAX_PNG_PIXELS;
    const mimeType = usePng ? 'image/png' : 'image/jpeg';
    const dataUrl = usePng
      ? outCanvas.toDataURL('image/png')
      : outCanvas.toDataURL('image/jpeg', 0.93);
    return { dataUrl, mimeType };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Lecture image impossible'));
      reader.readAsDataURL(blob);
    });
  }

  async function captureAndSearch(box) {
    if (busy) return;
    busy = true;
    try {
      const outCanvas = await renderCroppedCanvas(box);
      const { dataUrl, mimeType } = canvasToPayload(outCanvas);
      const res = await chrome.runtime.sendMessage({ type: 'SUBMIT_LENS_CAPTURE', dataUrl, mimeType });
      if (!res?.ok) {
        throw new Error(res?.error || "Impossible d'envoyer la capture vers Google Lens.");
      }
      destroy();
    } catch (err) {
      host.style.display = 'block';
      busy = false;
      showToast(`Erreur : ${err?.message || 'échec de la capture'}`, 3500);
    }
  }

  async function copyCropToClipboard(box) {
    if (busy) return;
    busy = true;
    try {
      const outCanvas = await renderCroppedCanvas(box);
      host.style.display = 'block';
      const blob = await new Promise((resolve) => outCanvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Conversion PNG impossible');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('Image copiée dans le presse-papiers !', 2200);
    } catch (err) {
      host.style.display = 'block';
      showToast(`Copie impossible : ${err?.message || 'permission refusée'}`, 3000);
    } finally {
      busy = false;
    }
  }

  async function downloadCrop(box) {
    if (busy) return;
    busy = true;
    try {
      const outCanvas = await renderCroppedCanvas(box);
      host.style.display = 'block';
      const { dataUrl } = canvasToPayload(outCanvas, true);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `google-lens-${Date.now()}.png`;
      a.click();
      showToast('Capture enregistrée en PNG.', 2000);
    } catch (err) {
      host.style.display = 'block';
      showToast(`Téléchargement impossible : ${err?.message || 'erreur'}`, 3000);
    } finally {
      busy = false;
    }
  }

  function positionActionDock(box) {
    actionDock.style.display = 'flex';
    const dockW = actionDock.offsetWidth || 320;
    const dockH = actionDock.offsetHeight || 44;
    const left = Math.min(
      width - dockW - 12,
      Math.max(12, box.x + box.w / 2 - dockW / 2)
    );
    const belowTop = box.y + box.h + 12;
    const aboveTop = box.y - dockH - 12;
    const top =
      belowTop + dockH <= height - 12
        ? belowTop
        : aboveTop >= 68
          ? aboveTop
          : Math.max(68, height - dockH - 16);

    actionDock.style.left = `${Math.round(left)}px`;
    actionDock.style.top = `${Math.round(top)}px`;
  }

  function clearSelection() {
    lockedBox = null;
    startPt = null;
    endPt = null;
    points = [];
    actionDock.style.display = 'none';
    drawOverlay();
  }

  function finalizeSelection(box) {
    if (previewMode) {
      lockedBox = { ...box };
      startPt = null;
      endPt = null;
      points = [];
      drawOverlay();
      positionActionDock(lockedBox);
    } else {
      captureAndSearch(box);
    }
  }

  function onPointerDown(e) {
    if (busy || e.button !== 0) return;
    if (lockedBox) clearSelection();
    dragging = true;
    startPt = { x: e.clientX, y: e.clientY };
    endPt = { ...startPt };
    points = [{ ...startPt }];
    backdrop.setPointerCapture?.(e.pointerId);
    drawOverlay();
  }

  function onPointerMove(e) {
    if (busy) return;
    if (!dragging) {
      if (!lockedBox) detectHoveredMedia(e.clientX, e.clientY);
      return;
    }
    endPt = { x: e.clientX, y: e.clientY };
    const prev = points[points.length - 1];
    if (!prev || Math.hypot(endPt.x - prev.x, endPt.y - prev.y) >= 3) {
      points.push({ ...endPt });
    }
    drawOverlay();
  }

  function onPointerUp(e) {
    if (!dragging || busy) return;
    dragging = false;
    endPt = { x: e.clientX, y: e.clientY };
    points.push({ ...endPt });
    backdrop.releasePointerCapture?.(e.pointerId);

    const box = getSelectionBox();
    if (!box || box.w < 12 || box.h < 12) {
      if (hoveredBox) {
        const snap = { ...hoveredBox };
        hoveredBox = null;
        finalizeSelection(snap);
        return;
      }
      clearSelection();
      hintEl.textContent = 'Glissez sur une zone ou cliquez sur une image';
      setTimeout(() => {
        if (!busy) hintEl.textContent = 'Glissez, entourez ou cliquez sur une image';
      }, 2000);
      return;
    }

    hoveredBox = null;
    finalizeSelection(box);
  }

  async function handlePasteBlob(blob) {
    if (!blob || busy) return;
    busy = true;
    try {
      const dataUrl = await blobToDataUrl(blob);
      const res = await chrome.runtime.sendMessage({
        type: 'SUBMIT_LENS_CAPTURE',
        dataUrl,
        mimeType: blob.type || 'image/png',
      });
      if (!res?.ok) {
        throw new Error(res?.error || "Impossible d'envoyer l'image.");
      }
      destroy();
    } catch (err) {
      busy = false;
      showToast(`Erreur presse-papiers : ${err?.message || 'échec'}`, 3000);
    }
  }

  function onPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          e.preventDefault();
          e.stopPropagation();
          handlePasteBlob(blob);
          return;
        }
      }
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (lockedBox) {
        clearSelection();
      } else {
        destroy();
      }
      return;
    }

    if (lockedBox && !busy) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        captureAndSearch(lockedBox);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        e.stopPropagation();
        copyCropToClipboard(lockedBox);
      }
    }
  }

  function destroy() {
    window.removeEventListener('resize', resizeCanvas);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('paste', onPaste, true);
    host.remove();
    delete window[STATE_KEY];
  }

  toolbar.addEventListener('pointerdown', (e) => e.stopPropagation());
  actionDock.addEventListener('pointerdown', (e) => e.stopPropagation());

  fullBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    finalizeSelection({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
  });

  pasteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          await handlePasteBlob(blob);
          return;
        }
      }
      showToast('Aucune image trouvée dans le presse-papiers.', 2400);
    } catch {
      showToast('Appuyez sur Ctrl+V pour coller une image.', 2400);
    }
  });

  previewToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    previewMode = !previewMode;
    previewToggleBtn.classList.toggle('active', previewMode);
    chrome.storage.local.set({ [STORAGE_PREVIEW_KEY]: previewMode }).catch(() => {});
    showToast(
      previewMode
        ? 'Mode Aperçu activé : vérifiez, copiez ou enregistrez avant envoi.'
        : 'Envoi direct activé (comme Chrome Lens).',
      2200
    );
  });

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    destroy();
  });

  sendBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (lockedBox) captureAndSearch(lockedBox);
  });
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (lockedBox) copyCropToClipboard(lockedBox);
  });
  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (lockedBox) downloadCrop(lockedBox);
  });
  retryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearSelection();
  });

  backdrop.addEventListener('pointerdown', onPointerDown);
  backdrop.addEventListener('pointermove', onPointerMove);
  backdrop.addEventListener('pointerup', onPointerUp);
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('paste', onPaste, true);

  window[STATE_KEY] = { active: true, destroy };
  resizeCanvas();
})();
