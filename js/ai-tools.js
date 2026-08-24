// Front-end for the AI image generator.
// Calls the Netlify Function at /api/generate-image, which holds the Hugging
// Face token server-side and talks to FLUX.1-schnell.

const form = document.getElementById('gen-form');
const promptInput = document.getElementById('prompt');
const button = document.getElementById('generate-btn');
const statusEl = document.getElementById('status');
const result = document.getElementById('result');

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const prompt = promptInput.value.trim();
  if (!prompt) return;

  button.disabled = true;
  result.innerHTML = '';
  statusEl.textContent = 'Generating… (FLUX.1-schnell — usually 5–15s)';

  try {
    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) {
      const msg = await res.text();
      // Hugging Face returns 503 while a cold model warms up.
      statusEl.textContent =
        res.status === 503
          ? 'The model is warming up on Hugging Face. Wait ~20s and try again.'
          : `Error (${res.status}): ${msg}`;
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    // Derive a file extension from the returned type (image/webp -> webp).
    const ext = (blob.type.split('/')[1] || 'webp').replace('jpeg', 'jpg');

    const img = document.createElement('img');
    img.src = url;
    img.alt = prompt;
    result.appendChild(img);

    const download = document.createElement('a');
    download.href = url;
    download.download = `generated.${ext}`;
    download.className = 'download-link';
    download.textContent = 'Download image';
    result.appendChild(download);

    statusEl.textContent = 'Done.';
  } catch (err) {
    statusEl.textContent = `Network error: ${err.message}`;
  } finally {
    button.disabled = false;
  }
});
