const { toastFetch, checkAppKey } = require('./_toastClient');

// Recursively collect items out of the Menus API's nested menu -> menuGroup
// (-> menuGroup...) -> menuItem tree.
function collectItems(groups, out) {
  (groups || []).forEach((g) => {
    (g.menuItems || []).forEach((it) => out.push(it));
    if (g.menuGroups && g.menuGroups.length) collectItems(g.menuGroups, out);
  });
}

// GET /api/toast-menu-items — list Toast menu items for the "match to Toast" picker in Setup.
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!checkAppKey(req, res)) return;

  try {
    // The Configuration API (/config/v2/menuItems) doesn't carry price for
    // this account — price only shows up on an item's placement inside a
    // menu, via the Menus API. That nesting also gives every item a
    // `salesCategory`, which is a cleaner "is this retail" signal than the
    // sku-presence heuristic this endpoint used before.
    const menusRes = await toastFetch('/menus/v2/menus');
    if (!menusRes.ok) {
      return res.status(menusRes.status).json({ error: await menusRes.text() });
    }
    const menus = await menusRes.json();

    if (req.query.debug) {
      return res.status(200).json(menus);
    }

    const all = [];
    (menus.menus || []).forEach((m) => collectItems(m.menuGroups, all));

    // Same item can appear under multiple menus/groups (e.g. both a
    // "Drinks" placement and the "Retail" menu) — dedupe by guid, keeping
    // the first (highest-priority) placement's data.
    const byGuid = {};
    all
      .filter((it) => {
        const cat = it.salesCategory && it.salesCategory.name;
        return cat === 'Retail' || cat === 'Retail-Alcoholic';
      })
      .forEach((it) => {
        if (!byGuid[it.guid]) byGuid[it.guid] = it;
      });

    // Cost (COGS) isn't exposed anywhere in this API's item schema for this
    // account, even though Toast's own dashboard shows it — that data lives
    // behind a higher API tier this account doesn't have. Left null; the UI
    // already treats null cost as "not synced" rather than an error.
    const list = Object.values(byGuid).map((it) => ({
      guid: it.guid,
      name: it.name,
      price: typeof it.price === 'number' ? it.price : null,
      cost: null,
    }));
    res.status(200).json(list);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message || err) });
  }
};
