// Cloud save for Rilakkuma Fortune Street — Vercel serverless function + Vercel Blob (free on the Hobby plan)
// Setup once: Vercel → your project → Storage → Create → Blob → connect to this project → Redeploy.
//   POST /api/save   body {data:"RFS1:..."}  → {code:"100001"}   running numbers; a code is never reused or overwritten
//   GET  /api/save?code=100001               → {data:"RFS1:...", t:...}
const { put, head } = require('@vercel/blob');
const P = 'rfs/';
const file = (c) => P + 'save-' + c + '.json';
async function readJSON(pathname) {
  try { const h = await head(pathname); const r = await fetch(h.url + '?t=' + Date.now(), { cache: 'no-store' }); return r.ok ? await r.json() : null; }
  catch (e) { return null; }
}
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'nodb' });
  try {
    if (req.method === 'POST') {
      let body = req.body; if (typeof body === 'string') body = JSON.parse(body || '{}');
      const data = body && body.data;
      if (typeof data !== 'string' || data.indexOf('RFS1:') !== 0) return res.status(400).json({ error: 'bad' });
      if (data.length > 3 * 1024 * 1024) return res.status(413).json({ error: 'big' });
      const last = await readJSON(P + 'last.json');
      let n = Math.max(100000, (last && last.n) || 100000) + 1;
      const payload = JSON.stringify({ data: data, t: Date.now() });
      for (let i = 0; i < 40; i++, n++) {
        try {
          // allowOverwrite:false → if this number already exists the upload fails and we try the next number
          await put(file(n), payload, { access: 'public', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json', cacheControlMaxAge: 60 });
          try { await put(P + 'last.json', JSON.stringify({ n: n }), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 }); } catch (e) { }
          return res.status(200).json({ code: String(n) });
        } catch (e) {
          if (!/exist/i.test(String(e && e.message))) throw e;
        }
      }
      return res.status(500).json({ error: 'busy' });
    }
    if (req.method === 'GET') {
      const code = String((req.query && req.query.code) || '').replace(/\D/g, '');
      if (code.length < 6) return res.status(400).json({ error: 'bad' });
      const v = await readJSON(file(code));
      if (!v) return res.status(404).json({ error: 'notfound' });
      return res.status(200).json(v);
    }
    res.status(405).json({ error: 'method' });
  } catch (e) { res.status(500).json({ error: 'server', msg: String(e && e.message || e) }); }
};
