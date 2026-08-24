// Netlify Function: proxies text-to-image requests to Hugging Face (FLUX.1-schnell).
// The HF token lives only in the server environment — it is never sent to the browser.
//
// Browser  ->  POST /api/generate-image  { prompt }  ->  this function  ->  Hugging Face
//          <-  PNG image bytes                        <-

const HF_MODEL = 'black-forest-labs/FLUX.1-schnell';

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token || token.includes('REPLACE')) {
    return new Response(
      'Server misconfigured: HUGGINGFACE_API_TOKEN is not set. Add it to .env (local) and to Netlify env vars (production).',
      { status: 500 }
    );
  }

  let prompt;
  try {
    ({ prompt } = await request.json());
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  if (!prompt || !prompt.trim()) {
    return new Response('Missing "prompt"', { status: 400 });
  }

  const hfRes = await fetch(
    `https://router.huggingface.co/hf-inference/models/${HF_MODEL}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'image/webp',
      },
      body: JSON.stringify({ inputs: prompt }),
    }
  );

  if (!hfRes.ok) {
    // 503 means the model is still loading on Hugging Face's side — the browser
    // handles this case and tells the user to retry shortly.
    const detail = await hfRes.text();
    return new Response(detail || 'Image generation failed', { status: hfRes.status });
  }

  // We request WebP (smaller than JPEG/PNG); pass the real content-type back.
  const contentType = hfRes.headers.get('content-type') || 'image/webp';
  const image = await hfRes.arrayBuffer();
  return new Response(image, {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
};

export const config = { path: '/api/generate-image' };
