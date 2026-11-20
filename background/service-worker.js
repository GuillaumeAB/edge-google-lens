const MENU_SEARCH_IMAGE = 'edge-lens-search-image';
const MENU_SEARCH_AREA = 'edge-lens-search-area';
const MENU_PASTE_HUB = 'edge-lens-paste-hub';
const DYNAMIC_UPLOAD_RULE_ID = 1001;
const RESTRICTED_PREFIXES = [
  'edge://',
  'chrome://',
  'about:',
  'devtools://',
  'view-source:',
  'chrome-extension://',
  'extension://',
  'https://microsoftedge.microsoft.com',
  'https://chromewebstore.google.com',
];

const sidePanelPorts = new Set();
let latestMemoryJob = null;
let lastPanelOpenPromise = null;
let lastPanelOpenFailed = false;

function isRestrictedUrl(url = '') {
  if (!url) return true;
  return RESTRICTED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function getUiLanguageCode() {
  try {
    const lang = chrome.i18n.getUILanguage() || 'fr';
    return lang.split(/[-_]/)[0] || 'fr';
  } catch {
    return 'fr';
  }
}

function makeJobId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureUploadHeaderRule() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DYNAMIC_UPLOAD_RULE_ID],
      addRules: [
        {
          id: DYNAMIC_UPLOAD_RULE_ID,
          priority: 2,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'origin', operation: 'remove' },
              { header: 'referer', operation: 'set', value: 'https://lens.google.com/' },
            ],
          },
          condition: {
            initiatorDomains: [chrome.runtime.id],
            urlFilter: '||lens.google.com/',
            resourceTypes: ['xmlhttprequest', 'sub_frame'],
          },
        },
      ],
    });
  } catch {
    // Ignore if DNR dynamic rule update fails
  }
}

async function openPasteHubTab(openerTab, notice = '') {
  const query = notice ? `?notice=${encodeURIComponent(notice)}` : '';
  const createOptions = {
    url: chrome.runtime.getURL(`paste/paste.html${query}`),
    active: true,
  };
  if (typeof openerTab?.index === 'number') {
    createOptions.index = openerTab.index + 1;
  }
  await chrome.tabs.create(createOptions);
}

function dispatchSidePanelJob(job) {
  latestMemoryJob = job;

  for (const port of sidePanelPorts) {
    try {
      port.postMessage({ type: 'RUN_LENS_JOB', job });
    } catch {
      sidePanelPorts.delete(port);
    }
  }

  chrome.storage.local.set({ latestLensJob: job }).catch(() => {});
  chrome.runtime.sendMessage({ type: 'RUN_LENS_JOB', job }).catch(() => {});
}

function openSidePanelSync(tab) {
  if (!chrome.sidePanel?.open) {
    lastPanelOpenFailed = true;
    const rejected = Promise.reject(new Error('sidePanel API unavailable'));
    lastPanelOpenPromise = rejected;
    return rejected;
  }

  lastPanelOpenFailed = false;
  let promise;
  try {
    if (typeof tab?.windowId === 'number') {
      promise = chrome.sidePanel.open({ windowId: tab.windowId });
    } else if (typeof tab?.id === 'number') {
      promise = chrome.sidePanel.open({ tabId: tab.id });
    } else {
      promise = Promise.reject(new Error('No windowId or tabId'));
    }
  } catch (err) {
    promise = Promise.reject(err);
  }

  lastPanelOpenPromise = promise.then(
    () => {
      lastPanelOpenFailed = false;
      return true;
    },
    (err) => {
      lastPanelOpenFailed = true;
      throw err;
    }
  );

  return lastPanelOpenPromise;
}

async function waitForSidePanelReady(timeoutMs = 380) {
  if (sidePanelPorts.size > 0) return true;
  if (lastPanelOpenFailed) return false;

  if (lastPanelOpenPromise) {
    try {
      await Promise.race([
        lastPanelOpenPromise,
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    } catch {
      return false;
    }
  }

  if (sidePanelPorts.size > 0) return true;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (sidePanelPorts.size > 0) return true;
    if (lastPanelOpenFailed) return false;
    await new Promise((resolve) => setTimeout(resolve, 45));
  }
  return sidePanelPorts.size > 0;
}

async function cleanupStaleUploads() {
  try {
    const all = await chrome.storage.local.get(null);
    const cutoff = Date.now() - 5 * 60 * 1000;
    const staleKeys = Object.keys(all).filter((key) => {
      if (!key.startsWith('pendingLensUpload_')) return false;
      const createdAt = all[key]?.createdAt ?? 0;
      return createdAt < cutoff;
    });
    if (staleKeys.length > 0) {
      await chrome.storage.local.remove(staleKeys);
    }
  } catch {
    // Ignore cleanup errors
  }
}

async function openLensUploadTab({ dataUrl, mimeType = 'image/jpeg', openerTab }) {
  await cleanupStaleUploads();
  const id = makeJobId();
  const storageKey = `pendingLensUpload_${id}`;

  await chrome.storage.local.set({
    [storageKey]: {
      dataUrl,
      mimeType,
      createdAt: Date.now(),
    },
  });

  const createOptions = {
    url: chrome.runtime.getURL(`upload/upload.html?id=${encodeURIComponent(id)}`),
    active: true,
  };
  if (typeof openerTab?.index === 'number') {
    createOptions.index = openerTab.index + 1;
  }
  await chrome.tabs.create(createOptions);
}

async function injectOverlayWithDelay(tab, delayMs = 0) {
  if (!tab?.id || isRestrictedUrl(tab.url)) {
    return {
      ok: false,
      error: "Page protégée par Edge : collez (Ctrl+V) ou choisissez une image ci-dessous.",
    };
  }

  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/lens-overlay.js'],
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `Cliquez sur l'icône caméra dans la barre d'outils pour capturer cet onglet (${err?.message || 'accès restreint'}).`,
    };
  }
}

function startToolbarLensFlow(tab) {
  // Call chrome.sidePanel.open synchronously inside user gesture
  const panelAttempt = openSidePanelSync(tab);

  if (!tab?.id || isRestrictedUrl(tab.url)) {
    const notice =
      'Page protégée par Edge : collez (Ctrl+V) ou déposez une image ici pour la rechercher avec Google Lens.';
    const job = { id: makeJobId(), mode: 'paste', notice, createdAt: Date.now() };
    dispatchSidePanelJob(job);
    panelAttempt.catch(() => openPasteHubTab(tab, notice));
    return;
  }

  dispatchSidePanelJob({ id: makeJobId(), mode: 'selecting', createdAt: Date.now() });
  panelAttempt.catch(() => {});

  // Wait briefly so Edge finishes opening/resizing the right side panel before injecting overlay
  injectOverlayWithDelay(tab, 150).then((res) => {
    if (!res.ok) {
      const job = { id: makeJobId(), mode: 'paste', notice: res.error, createdAt: Date.now() };
      dispatchSidePanelJob(job);
      panelAttempt.catch(() => openPasteHubTab(tab, res.error));
    }
  });
}

async function setupContextMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_SEARCH_IMAGE,
    title: 'Rechercher cette image avec Google Lens',
    contexts: ['image'],
  });
  chrome.contextMenus.create({
    id: MENU_SEARCH_AREA,
    title: "Rechercher une zone de l'écran avec Google Lens",
    contexts: ['page', 'selection'],
  });
  chrome.contextMenus.create({
    id: MENU_PASTE_HUB,
    title: 'Coller ou importer une image (Ctrl+V)',
    contexts: ['action'],
  });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'lens-sidepanel') return;
  sidePanelPorts.add(port);

  if (latestMemoryJob && Date.now() - (latestMemoryJob.createdAt || 0) <= 45000) {
    try {
      port.postMessage({ type: 'RUN_LENS_JOB', job: latestMemoryJob });
    } catch {
      // Ignore post error
    }
  }

  port.onDisconnect.addListener(() => {
    sidePanelPorts.delete(port);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus().catch(() => {});
  ensureUploadHeaderRule().catch(() => {});
  chrome.sidePanel?.setOptions?.({ path: 'sidepanel/sidepanel.html', enabled: true }).catch(() => {});
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus().catch(() => {});
  ensureUploadHeaderRule().catch(() => {});
});

ensureUploadHeaderRule().catch(() => {});

chrome.action.onClicked.addListener((tab) => {
  startToolbarLensFlow(tab);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_PASTE_HUB) {
    const job = { id: makeJobId(), mode: 'paste', createdAt: Date.now() };
    dispatchSidePanelJob(job);
    openSidePanelSync(tab).catch(() => openPasteHubTab(tab));
    return;
  }

  if (info.menuItemId === MENU_SEARCH_AREA) {
    startToolbarLensFlow(tab);
    return;
  }

  if (info.menuItemId === MENU_SEARCH_IMAGE && info.srcUrl) {
    if (/^https?:\/\//i.test(info.srcUrl)) {
      const hl = getUiLanguageCode();
      const targetUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(info.srcUrl)}&hl=${encodeURIComponent(hl)}`;
      const job = { id: makeJobId(), mode: 'url', url: targetUrl, createdAt: Date.now() };

      dispatchSidePanelJob(job);
      openSidePanelSync(tab).catch(() => {
        const opts = { url: targetUrl, active: true };
        if (typeof tab?.index === 'number') opts.index = tab.index + 1;
        chrome.tabs.create(opts);
      });
      return;
    }

    const dataMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i.exec(info.srcUrl);
    if (dataMatch) {
      const mimeType = dataMatch[1];
      const job = { id: makeJobId(), mode: 'upload', dataUrl: info.srcUrl, mimeType, createdAt: Date.now() };
      dispatchSidePanelJob(job);
      openSidePanelSync(tab).catch(() =>
        openLensUploadTab({ dataUrl: info.srcUrl, mimeType, openerTab: tab })
      );
      return;
    }

    startToolbarLensFlow(tab);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'CAPTURE_VISIBLE_TAB') {
    const windowId = sender.tab?.windowId;
    chrome.tabs
      .captureVisibleTab(windowId, { format: 'png' })
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Capture impossible' }));
    return true;
  }

  if (message?.type === 'GET_LATEST_LENS_JOB') {
    const fresh =
      latestMemoryJob && Date.now() - (latestMemoryJob.createdAt || 0) <= 45000
        ? latestMemoryJob
        : null;
    sendResponse({ ok: true, job: fresh });
    return false;
  }

  if (message?.type === 'SUBMIT_LENS_CAPTURE') {
    const dataUrl = message.dataUrl;
    const mimeType = message.mimeType || 'image/jpeg';
    if (!dataUrl) {
      sendResponse({ ok: false, error: 'Image vide.' });
      return false;
    }

    const job = {
      id: makeJobId(),
      mode: 'upload',
      dataUrl,
      mimeType,
      createdAt: Date.now(),
    };

    waitForSidePanelReady(380)
      .then(async (panelReady) => {
        if (panelReady) {
          dispatchSidePanelJob(job);
          sendResponse({ ok: true, target: 'sidepanel' });
          return;
        }
        // Side panel didn't open or was closed: fall back cleanly to upload tab so search always runs
        await openLensUploadTab({ dataUrl, mimeType, openerTab: sender.tab });
        sendResponse({ ok: true, target: 'tab' });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err?.message || "Impossible d'envoyer la capture." });
      });
    return true;
  }

  if (message?.type === 'OPEN_LENS_UPLOAD_TAB' || message?.type === 'OPEN_LENS_UPLOAD') {
    openLensUploadTab({
      dataUrl: message.dataUrl,
      mimeType: message.mimeType || 'image/jpeg',
      openerTab: sender.tab,
    })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Ouverture impossible' }));
    return true;
  }

  if (message?.type === 'START_CAPTURE_ACTIVE_TAB') {
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => injectOverlayWithDelay(tab, 0))
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Capture impossible' }));
    return true;
  }

  return false;
});
