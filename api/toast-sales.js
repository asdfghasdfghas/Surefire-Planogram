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

  try {
    const results = await Promise.all(
      dates.map((bd) =>
        toastFetch(`/orders/v2/ordersBulk?businessDate=${bd}&pageSize=100`)
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status} for ${bd}`))))
          .catch((err) => ({ __error: String(err && err.message || err), businessDate: bd }))
      )
    );

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
