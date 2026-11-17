# Science Studio: immersive labs + Groq tutor add-on

This package is intended to add a **new** study page to the existing Next.js/Vercel site without overwriting the current practice page.

## Files to place in the existing project

- `science-studio.html` → `public/science-studio.html`
- `route.ts` → `src/app/api/tutor/route.ts`

Then add a link from the existing site to `/science-studio.html` if you want students to discover it from the main page.

## Secure Groq setup

1. In Vercel, open the `ofentse` project → **Settings → Environment Variables**.
2. Add `GROQ_API_KEY` and paste the key into Vercel's value field. Choose Production and Preview (Development too if you use Vercel local development). **Do not put the key in HTML, browser JavaScript, a public repository, or chat.**
3. Optional: add `GROQ_MODEL` with a model ID enabled for your Groq account. The route defaults to `openai/gpt-oss-20b`; model IDs can change, so check the Groq console if requests fail.
4. Redeploy after setting the variables. The tutor POSTs to the same-origin `/api/tutor` route, which calls Groq server-side.

The interface still loads without the key; its AI tutor shows a setup message until the server variable is configured. The interactive labs work without Groq.

## Labs included

- **Gas chamber:** orbitable perspective scene with 30 representative particles, elastic wall collisions, temperature-dependent speed and volume-dependent pressure from `p = nRT/V`.
- **Molecule viewer:** orbitable 3D-style H₂O, CO₂, CH₄, HCl and NH₃ geometries with bond connectors and schematic lone-pair lobes.
- **Tensile tester:** load-controlled specimen with an illustrative elastic/yield/fracture model and a stress–strain plot.

These are educational models, not molecular-scale photography or certified lab measurements. The assumptions are stated in the interface.

## Important source/deployment note

The current Vercel integration can inspect deployments but does not expose the linked repository's source files for safe in-place editing. The add-on files are prepared for the existing Next.js project; the project owner (or a connected source-control workflow) must place them in the repository and redeploy. This avoids accidentally replacing existing registration, XP, leaderboard or practice-page behavior.
