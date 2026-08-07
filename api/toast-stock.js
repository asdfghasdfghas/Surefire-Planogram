const { toastFetch, checkAppKey } = require('./_toastClient');

// GET /api/toast-stock?guids=a,b,c — batch-read live on-hand quantity from Toast.
// Returns { [guid]: quantity|null } (null = not tracked as QUANTITY, e.g. IN_STOCK/OUT_OF_STOCK/unmatched).
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!checkAppKey(req, res)) return;

  const guids = String(req.query.guids || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!guids.length) return res.status(200).json({});

  try {
    const toastRes = await toastFetch('/stock/v1/inventory/search', {
      method: 'POST',
      body: JSON.stringify({ guids }),
    });
    if (!toastRes.ok) {
      return res.status(toastRes.status).json({ error: await toastRes.text() });
    }
    const rows = await toastRes.json();
    const out = {};
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      out[row.guid] = row.status === 'QUANTITY' ? row.quantity : (row.status === 'OUT_OF_STOCK' ? 0 : null);
    });
    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message || err) });
  }
};
