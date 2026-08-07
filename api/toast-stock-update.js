const { toastFetch, checkAppKey } = require('./_toastClient');

// POST /api/toast-stock-update  body: [{ guid, quantity }]
// Pushes a physical recount into Toast so its sales-driven decrementing baseline stays correct.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkAppKey(req, res)) return;

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }
  }
  const items = Array.isArray(body) ? body : [];
  if (!items.length) return res.status(400).json({ error: 'Expected a non-empty array of { guid, quantity }' });

  const payload = items
    .filter((it) => it && it.guid)
    .map((it) => {
      const qty = Number(it.quantity);
      // Toast auto-converts a 0 quantity to OUT_OF_STOCK, and requires quantity > 0 for QUANTITY status.
      return qty > 0
        ? { guid: it.guid, status: 'QUANTITY', quantity: qty }
        : { guid: it.guid, status: 'OUT_OF_STOCK' };
    });

  try {
    const toastRes = await toastFetch('/stock/v1/inventory/update', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!toastRes.ok) {
      return res.status(toastRes.status).json({ error: await toastRes.text() });
    }
    const result = await toastRes.json();
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message || err) });
  }
};
