// Vercel serverless function: POST /api/tutor
const WINDOW_MS = 60000, MAX_REQ = 10, counts = new Map();
const SYSTEM_PROMPT = `You are Science Studio, a careful tutor for South African NCV Physical Science NQF Level 3 Paper 2 (Chemistry). Teach interactively at an appropriate school level. Topics that appear in every paper: stress, strain and Hooke's law (F = k\u0394l, elastic limit); mechanical properties (elastic, plastic, ductile, brittle); electron configuration, Lewis diagrams, isoelectronic ions, oxidation numbers; bonding, electronegativity and polarity (difference below 0,9 = non-polar) and molecular shape; intermolecular forces, boiling point, vapour pressure, viscosity; thermal expansion (\u0394V = \u03b3V0\u0394T), Q = mc\u0394T, latent heat; gas laws (Boyle, Charles, Gay-Lussac, pV = nRT); reaction types, balancing, reactivity series, displacement and precipitation; moles and stoichiometry; enthalpy, activation energy, catalysts and potential-energy diagrams; industrial gases, pollution, acid rain, greenhouse effect. Conventions: R = 8,31; STP = 273 K and 101,3 kPa with molar volume 22,4 dm3/mol; K = degrees C + 273; answers to two decimals with formula, substitution and unit. Prefer a hint or guiding question before a full solution and obey the selected mode. Balance equations before using mole ratios. Do not invent marking-guide wording or mark allocations; say when a convention needs checking with the teacher's memo. Keep replies concise. If an answer is wrong, find the first misconception and explain kindly how to fix it.`;
const MODES = {
  teach: 'Teach a short spoken lesson on the topic the student names: (1) the key idea in two or three sentences, (2) one worked example using memo conventions, (3) one quick check question for the student to answer. Then wait for their answer.',
  hint: 'Give a useful first hint, not the final answer, unless the student explicitly asks for the full solution.',
  explain: 'Explain the concept clearly with a small example if useful.',
  check: 'Check the student\u2019s answer or working. Say what is correct, identify any error, and show the correction.',
  quiz: 'Ask one focused question at a time and wait for the student to answer. Do not reveal the answer in the same message.'
};

module.exports = async (req, res) => {
  const send = (status, obj) => { res.status(status).setHeader('Cache-Control', 'no-store').json(obj); };
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(405, { error: 'Use POST to ask the tutor.' }); }
  const key = process.env.GROQ_API_KEY;
  if (!key) return send(503, { error: 'Groq is not configured yet. Add GROQ_API_KEY in Vercel Project Settings, Environment Variables, then redeploy.' });
  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim(), now = Date.now(), prior = counts.get(ip);
  if (prior && now - prior.start < WINDOW_MS && prior.count >= MAX_REQ) return send(429, { error: 'Too many tutor requests in a short time. Wait a minute and try again.' });
  if (!prior || now - prior.start >= WINDOW_MS) counts.set(ip, { count: 1, start: now }); else prior.count++;
  if (counts.size > 2000) for (const [k, v] of counts) if (now - v.start >= WINDOW_MS) counts.delete(k);
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return send(403, { error: 'Cross-origin requests are not allowed.' }); } catch { return send(403, { error: 'Invalid request origin.' }); } }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return send(400, { error: 'Send a valid JSON message.' }); } }
  if (!body || typeof body !== 'object') return send(400, { error: 'Send a valid JSON object.' });
  if (JSON.stringify(body).length > 12000) return send(413, { error: 'That message is too long. Shorten it and try again.' });
  const mode = typeof body.mode === 'string' && MODES[body.mode] ? body.mode : 'explain';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 1600) : '';
  if (!message) return send(400, { error: 'Write a question first.' });
  const history = Array.isArray(body.history) ? body.history.slice(-8).flatMap(i => (i && ['user', 'assistant'].includes(i.role) && typeof i.content === 'string') ? [{ role: i.role, content: i.content.slice(0, 1600) }] : []) : [];
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const up = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
        messages: [{ role: 'system', content: SYSTEM_PROMPT + '\nTutor mode: ' + mode + '. ' + MODES[mode] + ' Your reply will be read aloud, so write plain spoken English: short sentences, no markdown, no tables, no bullet symbols, and say formulas in words as well as symbols.' }, ...history, { role: 'user', content: message }],
        temperature: 0.35, max_completion_tokens: 1200, reasoning_effort: 'low'
      })
    });
    if (!up.ok) return send(up.status === 429 ? 429 : 502, { error: up.status === 429 ? 'Groq is busy or the account limit was reached. Try again shortly.' : 'The tutor provider returned an error. Check that GROQ_MODEL is available for your Groq account.' });
    const data = await up.json(), reply = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof reply !== 'string' || !reply.trim()) return send(502, { error: 'The tutor returned an empty response. Try again.' });
    return send(200, { reply: reply.trim() });
  } catch (e) {
    return send(502, { error: e && e.name === 'AbortError' ? 'The tutor took too long to respond. Try again.' : 'Could not connect to Groq. Try again shortly.' });
  } finally { clearTimeout(timer); }
};
