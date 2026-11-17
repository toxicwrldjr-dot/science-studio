import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const requestCounts = new Map<string, { count: number; start: number }>();

const SYSTEM_PROMPT = `You are Science Studio, a careful tutor for South African NCV Physical Science NQF Level 3 Paper 2 (Chemistry). Teach interactively at an appropriate school level. Topics that appear in every paper: stress, strain and Hooke's law (F = k\u0394l, elastic limit); mechanical properties (elastic, plastic, ductile, brittle); electron configuration, Lewis diagrams, isoelectronic ions, oxidation numbers; bonding, electronegativity and polarity (difference below 0,9 = non-polar) and molecular shape; intermolecular forces, boiling point, vapour pressure, viscosity; thermal expansion (\u0394V = \u03b3V0\u0394T), Q = mc\u0394T, latent heat; gas laws (Boyle, Charles, Gay-Lussac, pV = nRT); reaction types, balancing, reactivity series, displacement and precipitation; moles and stoichiometry; enthalpy, activation energy, catalysts and potential-energy diagrams; industrial gases, pollution, acid rain, greenhouse effect. Conventions: R = 8,31; STP = 273 K and 101,3 kPa with molar volume 22,4 dm3/mol; K = degrees C + 273; answers to two decimals with formula, substitution and unit. Prefer a hint or guiding question before a full solution and obey the selected mode. Balance equations before using mole ratios. Do not invent marking-guide wording or mark allocations; say when a convention needs checking with the teacher's memo. Keep replies concise. If an answer is wrong, find the first misconception and explain kindly how to fix it.`;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return jsonError('Groq is not configured yet. Add GROQ_API_KEY in Vercel Project Settings → Environment Variables, then redeploy.', 503);

  // Best-effort per-instance rate limit; use a shared store for stronger production-wide limits.
  const ip = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const prior = requestCounts.get(ip);
  if (prior && now - prior.start < WINDOW_MS && prior.count >= MAX_REQUESTS_PER_WINDOW) {
    return jsonError('Too many tutor requests in a short time. Wait a minute and try again.', 429);
  }
  if (!prior || now - prior.start >= WINDOW_MS) requestCounts.set(ip, { count: 1, start: now });
  else requestCounts.set(ip, { count: prior.count + 1, start: prior.start });
  if (requestCounts.size > 2000) {
    for (const [k, value] of requestCounts) if (now - value.start >= WINDOW_MS) requestCounts.delete(k);
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return jsonError('Cross-origin requests are not allowed.', 403);
    } catch {
      return jsonError('Invalid request origin.', 403);
    }
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 12_000) return jsonError('That message is too long. Shorten it and try again.', 413);

  let body: { mode?: unknown; message?: unknown; history?: unknown };
  try { body = await request.json(); } catch { return jsonError('Send a valid JSON message.', 400); }
  if (!body || typeof body !== 'object') return jsonError('Send a valid JSON object.', 400);
  const allowedModes = new Set(['teach', 'hint', 'explain', 'check', 'quiz']);
  const mode = typeof body.mode === 'string' && allowedModes.has(body.mode) ? body.mode : 'explain';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 1600) : '';
  if (!message) return jsonError('Write a question first.', 400);

  const history = Array.isArray(body.history) ? body.history.slice(-8).flatMap((item: any) => {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') return [];
    return [{ role: item.role, content: item.content.slice(0, 1600) }];
  }) : [];
  const modeInstruction: Record<string, string> = {
    teach: 'Teach a short spoken lesson on the topic the student names: (1) the key idea in two or three sentences, (2) one worked example using memo conventions, (3) one quick check question for the student to answer. Then wait for their answer.',
    hint: 'Give a useful first hint, not the final answer, unless the student explicitly asks for the full solution.',
    explain: 'Explain the concept clearly with a small example if useful.',
    check: 'Check the student’s answer or working. Say what is correct, identify any error, and show the correction.',
    quiz: 'Ask one focused question at a time and wait for the student to answer. Do not reveal the answer in the same message.'
  };
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\nTutor mode: ${mode}. ${modeInstruction[mode]} Your reply will be read aloud, so write plain spoken English: short sentences, no markdown, no tables, no bullet symbols, and say formulas in words as well as symbols.` },
          ...history,
          { role: 'user', content: message }
        ],
        temperature: 0.35,
        max_completion_tokens: 1200,
        reasoning_effort: 'low'
      }),
      signal: controller.signal
    });
    if (!upstream.ok) {
      // Do not return raw upstream details or credentials to the browser.
      return jsonError(upstream.status === 429 ? 'Groq is busy or the account limit was reached. Try again shortly.' : 'The tutor provider returned an error. Check that GROQ_MODEL is available for your Groq account.', upstream.status === 429 ? 429 : 502);
    }
    const data = await upstream.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) return jsonError('The tutor returned an empty response. Try again.', 502);
    return NextResponse.json({ reply: reply.trim() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return jsonError(aborted ? 'The tutor took too long to respond. Try again.' : 'Could not connect to Groq. Try again shortly.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Use POST to ask the tutor.' }, { status: 405, headers: { Allow: 'POST' } });
}
