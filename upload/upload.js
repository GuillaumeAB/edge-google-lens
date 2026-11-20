function dataUrlToBlob(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    throw new Error('Format de capture invalide');
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

function showError(message) {
  const spinner = document.getElementById('spinner');
  const title = document.getElementById('title');
  const subtitle = document.getElementById('subtitle');
  const errorBox = document.getElementById('errorBox');
  if (spinner) spinner.style.display = 'none';
  if (title) title.textContent = 'Envoi interrompu';
  if (subtitle) subtitle.textContent = 'Fermez cet onglet et relancez la capture.';
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.style.display = 'block';
  }
}

async function submitPendingCapture() {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
      throw new Error('Identifiant de capture manquant.');
    }

    const storageKey = `pendingLensUpload_${id}`;
    const stored = await chrome.storage.local.get(storageKey);
    const payload = stored?.[storageKey];
    await chrome.storage.local.remove(storageKey);

    if (!payload?.dataUrl) {
      throw new Error('Aucune capture trouvée (onglet expiré ou rechargé).');
    }

    const { blob, mimeType } = dataUrlToBlob(payload.dataUrl);
    const ext = extensionFromMime(mimeType);
    const file = new File([blob], `capture.${ext}`, { type: mimeType });

    const transfer = new DataTransfer();
    transfer.items.add(file);

    const fileInput = document.getElementById('lensFileInput');
    const form = document.getElementById('lensForm');
    if (!fileInput || !form) {
      throw new Error("Formulaire d'envoi introuvable.");
    }

    fileInput.files = transfer.files;
    form.submit();
  } catch (err) {
    showError(err?.message || 'Erreur inconnue pendant la préparation de la capture.');
  }
}

document.addEventListener('DOMContentLoaded', submitPendingCapture);
