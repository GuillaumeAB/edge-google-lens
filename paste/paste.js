const noticeBox = document.getElementById('noticeBox');
const dropzone = document.getElementById('dropzone');
const pasteBtn = document.getElementById('pasteBtn');
const pickBtn = document.getElementById('pickBtn');
const fileInput = document.getElementById('fileInput');
const statusBox = document.getElementById('statusBox');

const params = new URLSearchParams(window.location.search);
const notice = params.get('notice');
if (notice && noticeBox) {
  noticeBox.textContent = notice;
  noticeBox.style.display = 'block';
}

function setStatus(text, isError = true) {
  statusBox.style.color = isError ? '#f6aea9' : '#8ab4f8';
  statusBox.textContent = text;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Lecture de l'image impossible."));
    reader.readAsDataURL(blob);
  });
}

async function sendBlobToLens(blob) {
  if (!blob || !blob.type.startsWith('image/')) {
    setStatus('Ce contenu ne semble pas être une image valide.');
    return;
  }
  setStatus('Envoi vers Google Lens…', false);
  try {
    const dataUrl = await blobToDataUrl(blob);
    const res = await chrome.runtime.sendMessage({
      type: 'OPEN_LENS_UPLOAD_TAB',
      dataUrl,
      mimeType: blob.type || 'image/png',
    });
    if (!res?.ok) {
      throw new Error(res?.error || "Échec de l'envoi.");
    }
    window.close();
  } catch (err) {
    setStatus(err?.message || "Impossible d'ouvrir Google Lens.");
  }
}

pasteBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        await sendBlobToLens(blob);
        return;
      }
    }
    setStatus('Aucune image trouvée dans le presse-papiers.');
  } catch {
    setStatus('Utilisez Ctrl+V directement sur cette page pour coller votre image.');
  }
});

pickBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

dropzone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) sendBlobToLens(file);
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
  if (file) {
    sendBlobToLens(file);
  } else {
    setStatus('Déposez un fichier image (PNG, JPG, WebP…).');
  }
});

window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (blob) {
        e.preventDefault();
        sendBlobToLens(blob);
        return;
      }
    }
  }
  setStatus('Le presse-papiers ne contient pas d’image.');
});
