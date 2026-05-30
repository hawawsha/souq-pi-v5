const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID;

const AT = (path, method = 'GET', body) =>
  fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  }).then(r => r.json());

export default async function handler(req, res) {
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE) {
    return res.status(500).json({ error: 'Server configuration missing' });
  }

  // GET /api/ratings?payment_id=X  — check if buyer already rated this order
  // GET /api/ratings?seller_username=X  — get all ratings for a seller
  if (req.method === 'GET') {
    const { payment_id, seller_username, product_id } = req.query;
    try {
      let formula = '';
      if (payment_id) formula = `{payment_id}="${payment_id}"`;
      else if (seller_username) formula = `{seller_username}="${seller_username}"`;
      else if (product_id) formula = `{product_id}="${product_id}"`;
      else return res.status(400).json({ error: 'payment_id or seller_username required' });

      const data = await AT(
        `/Ratings?filterByFormula=${encodeURIComponent(formula)}&sort[0][field]=created_at&sort[0][direction]=desc`
      );
      return res.status(200).json({ records: data.records || [] });
    } catch (e) {
      return res.status(500).json({ error: 'فشل جلب التقييمات' });
    }
  }

  // POST /api/ratings  — submit a new rating
  if (req.method === 'POST') {
    const { buyer_username, seller_username, product_id, payment_id, stars, comment } = req.body || {};

    if (!buyer_username || !seller_username || !payment_id || !stars) {
      return res.status(400).json({ error: 'buyer_username, seller_username, payment_id, stars مطلوبة' });
    }
    const starsNum = parseInt(stars, 10);
    if (isNaN(starsNum) || starsNum < 1 || starsNum > 5) {
      return res.status(400).json({ error: 'التقييم يجب أن يكون بين 1 و 5' });
    }

    try {
      // Prevent duplicate ratings for same order
      const dup = await AT(
        `/Ratings?filterByFormula=${encodeURIComponent(`{payment_id}="${payment_id}"`)}`
      );
      if (dup.records?.length > 0) {
        return res.status(200).json({ message: 'تم التقييم مسبقاً', existing: dup.records[0] });
      }

      // Verify the order belongs to this buyer (security check)
      const order = await AT(
        `/Orders?filterByFormula=${encodeURIComponent(
          `AND({payment_id}="${payment_id}",{username}="${buyer_username}")`
        )}`
      );
      if (!order.records?.length) {
        return res.status(403).json({ error: 'لا يوجد طلب مطابق لهذا المشتري' });
      }

      const saved = await AT('/Ratings', 'POST', {
        fields: {
          buyer_username,
          seller_username,
          product_id: product_id || '',
          payment_id,
          stars: starsNum,
          comment: (comment || '').trim().slice(0, 500),
          created_at: new Date().toISOString()
        }
      });

      return res.status(200).json({ success: true, record: saved });
    } catch (e) {
      console.error('[ratings] error:', e);
      return res.status(500).json({ error: 'فشل حفظ التقييم' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
