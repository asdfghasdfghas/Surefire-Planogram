const { toastFetch, checkAppKey } = require('./_toastClient');

function businessDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// GET /api/toast-sales?days=30 — total units sold per Toast menu item guid,
// summed over the trailing N business days (default 30), plus a simple
// daily average. Toast's Orders API is date-scoped (one call per business
// day, via the bulk export so a whole day's orders come back in one
// response) — there's no single "sales report by item" self-service
// endpoint, so this loops the requested window and sums selections
// client-side.
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!checkAppKey(req, res)) return;

  const days = Math.max(1, Math.min(60, parseInt(req.query.days, 10) || 30));
  const dates = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(businessDateStr(d));
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function fetchDay(bd, attempt) {
    const r = await toastFetch(`/orders/v2/ordersBulk?businessDate=${bd}&pageSize=100`);
    if (r.status === 429 && attempt < 3) {
      await sleep(500 * (attempt + 1));
      return fetchDay(bd, attempt + 1);
    }
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${bd}`);
    return r.json();
  }

  try {
    // ordersBulk is rate-limited much tighter than the config/menus/stock
    // endpoints — firing all N days at once 429s partway through. A small
    // concurrency pool (with retry-with-backoff on 429) keeps this well
    // under that ceiling while still being faster than fully sequential.
    const results = [];
    const CONCURRENCY = 3;
    for (let i = 0; i < dates.length; i += CONCURRENCY) {
      const batch = dates.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((bd) =>
          fetchDay(bd, 0).catch((err) => ({ __error: String(err && err.message || err), businessDate: bd }))
        )
      );
      results.push(...batchResults);
    }

    if (req.query.debug) {
      // First business day that actually returned data, raw and unmodified,
      // so the real selection/item field names for this account can be
      // checked instead of guessed at.
      const withData = results.find((r) => Array.isArray(r) && r.length);
      return res.status(200).json({
        daysRequested: days,
        errors: results.filter((r) => r && r.__error),
        sampleDate: withData ? dates[results.indexOf(withData)] : null,
        sampleOrder: withData ? withData[0] : null,
      });
    }

    const totals = {};
    results.forEach((orders) => {
      if (!Array.isArray(orders)) return;
      orders.forEach((order) => {
        (order.checks || []).forEach((check) => {
          (check.selections || []).forEach((sel) => {
            if (sel.voided || sel.refundStatus === 'REFUNDED') return;
            const guid = sel.item && sel.item.guid;
            if (!guid) return;
            const qty = typeof sel.quantity === 'number' ? sel.quantity : 1;
            totals[guid] = (totals[guid] || 0) + qty;
          });
        });
      });
    });

    const out = {};
    Object.keys(totals).forEach((guid) => {
      out[guid] = { sold: totals[guid], dailyAvg: totals[guid] / days };
    });
    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message || err) });
  }
};
