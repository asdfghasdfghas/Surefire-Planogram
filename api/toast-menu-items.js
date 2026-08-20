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

    // Debug escape hatch: GET /api/toast-menu-items?debug=1 returns one raw,
    // unmodified item so the real field names for this account (pricing
    // strategy and any cost field both vary by Toast config) can be checked
    // instead of guessed at. Still gated by the same shared-secret check.
    if (req.query.debug) {
      return res.status(200).json(Array.isArray(items) ? items[0] || null : items);
    }
    if (req.query.debugdetail) {
      const first = (Array.isArray(items) ? items : []).find((it) => it.sku);
      if (!first) return res.status(200).json(null);
      const detailRes = await toastFetch('/config/v2/menuItems/' + first.guid);
      const detail = await detailRes.json();
      return res.status(200).json(detail);
    }
    if (req.query.debugmenus) {
      const menusRes = await toastFetch('/menus/v2/menus');
      if (!menusRes.ok) return res.status(menusRes.status).json({ error: await menusRes.text() });
      const menus = await menusRes.json();
      return res.status(200).json(menus);
    }
    // Toast's menu items for this account mix ~789 food-menu/modifier items
    // ("The Ogden", "ADD SMACK SAUCE") in with the ~211 actual retail
    // products. Retail products are the only ones carrying a UPC in `sku`;
    // food/modifier items never do — so that's the filter that keeps the
    // "match to Toast" picker limited to items that could plausibly be on
    // the planogram.
    const retailItems = (Array.isArray(items) ? items : []).filter((it) => it.sku);

    const list = retailItems.map((it) => {
      // Simple-priced items carry price directly; other pricing strategies
      // (e.g. size groups) nest it under pricingRules.basePrice instead.
      const price = typeof it.price === 'number'
        ? it.price
        : (it.pricingRules && typeof it.pricingRules.basePrice === 'number' ? it.pricingRules.basePrice : null);
      // Cost (COGS) isn't part of Toast's documented menu config schema, but
      // some accounts (food-cost/inventory add-ons) do populate a cost field
      // on the item — try the plausible names defensively; stays null if
      // none of them exist for this account, which is harmless.
      const cost = typeof it.cost === 'number' ? it.cost
        : (typeof it.unitCost === 'number' ? it.unitCost
        : (typeof it.averageCost === 'number' ? it.averageCost
        : (it.pricingRules && typeof it.pricingRules.cost === 'number' ? it.pricingRules.cost : null)));
      return { guid: it.guid, name: it.name, price, cost };
    });
    res.status(200).json(list);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message || err) });
  }
};
