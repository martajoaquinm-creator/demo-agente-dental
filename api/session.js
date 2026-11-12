export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://martajoaquinm-creator.github.io', 'https://demo-agente-dental-p396.vercel.app', 'http://localhost:3000', 'http://127.0.0.1:5500'];
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!allowed.includes(origin)) return res.status(403).json({ error: 'Origen no autorizado' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Configura OPENAI_API_KEY en Vercel' });
  let sdp = '';
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 100000) return res.status(413).json({ error: 'Solicitud demasiado grande' });
      chunks.push(chunk);
    }
    sdp = Buffer.concat(chunks).toString('utf8').trim();
  } catch {
    return res.status(400).json({ error: 'No se pudo leer la solicitud de audio' });
  }
  if (!sdp.startsWith('v=0') || !sdp.includes('m=audio')) return res.status(400).json({ error: 'Oferta de audio SDP inválida' });
  try {
    const form = new FormData();
    form.set('sdp', sdp);
    form.set('session', JSON.stringify({
      type: 'realtime',
      model: 'gpt-realtime',
      audio: { output: { voice: 'marin' } },
      instructions: 'Eres la recepcionista virtual de una clínica dental de DEMOSTRACIÓN en Madrid. Habla español de España, cálido y conciso. Saluda al comenzar. Informa sobre revisiones, limpiezas, ortodoncia e implantes en términos generales. No inventes horarios, precios, disponibilidad, dirección, reservas, confirmaciones ni envíos de WhatsApp. Explica que esta demo no está conectada a la agenda real y que puedes recoger verbalmente una solicitud de cita, pero no confirmarla. No des diagnósticos; ante dolor intenso, hinchazón grave, fiebre o traumatismo indica que contacte con un dentista de urgencias y ante dificultades respiratorias llame al 112. Evita solicitar datos sensibles en la demo.'
    }));
    const upstream = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST', headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY }, body: form
    });
    const answer = await upstream.text();
    if (!upstream.ok) {
      let reason = 'Respuesta no válida de OpenAI';
      try { const parsed = JSON.parse(answer); reason = parsed.error?.message || reason; } catch {}
      console.error('OpenAI Realtime rejected session:', upstream.status, reason);
      const explanation = upstream.status === 401 ? 'La clave OPENAI_API_KEY no es válida o ha caducado.' : upstream.status === 403 ? 'La cuenta o el proyecto no tiene acceso al modelo de voz.' : upstream.status === 429 ? 'Revisa la facturación, los créditos y los límites de uso de la API.' : upstream.status === 400 ? 'OpenAI rechazó la configuración de la sesión de voz.' : 'OpenAI no pudo iniciar la sesión de voz.';
      return res.status(502).json({ error: explanation, upstreamStatus: upstream.status, detail: reason.slice(0, 300) });
    }
    res.setHeader('Content-Type', 'application/sdp');
    return res.status(200).send(answer);
  } catch (e) {
    console.error('Realtime session connection failed:', e?.message || String(e));
    return res.status(502).json({ error: 'Error de conexión con el servicio de voz' });
  }
}
