const { toastFetch, checkAppKey } = require('./_toastClient');

// GET /api/toast-menu-items — list Toast menu items for the "match to Toast" picker in Setup.
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!checkAppKey(req, res)) return;

  try {
    const toastRes = await toastFetch('/config/v2/menuItems');
    if (!toastRes.ok) {
      return res.status(toastRes.status).json({ error: await toastRes.text() });
    }
    const items = await toastRes.json();
    const list = (Array.isArray(items) ? items : []).map((it) => {
      // Simple-priced items carry price directly; other pricing strategies
      // (e.g. size groups) nest it under pricingRules.basePrice instead.
      const price = typeof it.price === 'number'
        ? it.price
        : (it.pricingRules && typeof it.pricingRules.basePrice === 'number' ? it.pricingRules.basePrice : null);
      return { guid: it.guid, name: it.name, price };
    });
    res.status(200).json(list);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message || err) });
  }
};
