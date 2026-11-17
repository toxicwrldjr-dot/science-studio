# Science Studio Vercel add-on

This is an add-on to the existing Next.js project, designed not to replace its current practice page.

## Place the files
- `public/science-studio.html` → existing project `public/science-studio.html`
- `src/app/api/tutor/route.ts` → existing project `src/app/api/tutor/route.ts`

The new page will then be available at `/science-studio.html`. Add a link to it from the existing home page when convenient.

## Configure Groq securely
1. Open Vercel → project `ofentse` → Settings → Environment Variables.
2. Add `GROQ_API_KEY` using Vercel's value field. Select the environments you need.
3. Optional: set `GROQ_MODEL` to a model ID currently enabled for your Groq account. The route defaults to `openai/gpt-oss-20b`.
4. Redeploy. The browser calls the same-origin `/api/tutor` route; the Groq secret remains server-side.

Never paste the key into HTML/JavaScript, commit it to Git, or send it in chat. The virtual labs work independently of the tutor key.

## Included simulations
- Gas chamber: 3D perspective particles with elastic wall collisions; temperature changes speed; pressure follows `p = nRT/V`.
- Molecule viewer: orbitable H2O, CO2, CH4, HCl and NH3 geometry, bond and lone-pair models.
- Tensile tester: load-controlled specimen, illustrative elastic/yield/fracture response, and stress–strain graph.

The simulations state their assumptions and are educational models, not measured real-world data.
