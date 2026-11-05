const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const J = 'https://api.jikan.moe/v4';
const cache = new Map();
const TTL = 10 * 60 * 1000;

async function get(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < TTL) return hit.d;
  let err;
  for (let i = 0; i < 3; i++) {            // retry for Jikan rate limits (429)
    try {
      const r = await axios.get(url, { timeout: 10000 });
      cache.set(url, { d: r.data, t: Date.now() });
      if (cache.size > 300) cache.delete(cache.keys().next().value);
      return r.data;
    } catch (e) {
      err = e;
      if (e.response && e.response.status === 429) await new Promise(r => setTimeout(r, 1200 * (i + 1)));
      else break;
    }
  }
  throw err;
}
const wrap = fn => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) { res.status(502).json({ error: 'upstream failed', data: [] }); }
};

app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/trending', wrap(() => get(`${J}/top/anime?filter=airing&limit=24&sfw`)));
app.get('/api/season', wrap(() => get(`${J}/seasons/now?limit=24&sfw`)));
app.get('/api/top', wrap(() => get(`${J}/top/anime?limit=24&sfw`)));
app.get('/api/search', wrap(req => {
  const q = (req.query.q || '').trim();
  return q ? get(`${J}/anime?q=${encodeURIComponent(q)}&limit=24&sfw`) : { data: [] };
}));
app.get('/api/anime/:id', wrap(async req => {
  const id = encodeURIComponent(req.params.id);
  const info = await get(`${J}/anime/${id}/full`);
  let eps = { data: [] };
  try { eps = await get(`${J}/anime/${id}/episodes`); } catch (e) {}
  return { info: info.data, episodes: eps.data || [], has_next: !!(eps.pagination && eps.pagination.has_next_page) };
}));
app.get('/watch', (q, r) => r.sendFile(path.join(__dirname, 'public', 'watch.html')));
app.get('*', (q, r) => r.sendFile(path.join(__dirname, 'public', 'index.html')));
const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log('Anime Final on ' + PORT));
module.exports = app;
