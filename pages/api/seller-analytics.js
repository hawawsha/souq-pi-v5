const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID;
const ADMIN_KEY      = process.env.ADMIN_SECRET_KEY;

async function fetchAll(table) {
  const records = [];
  let offset = '';
  do {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${table}?pageSize=100${offset ? `&offset=${offset}` : ''}`;
    const r   = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    const d   = await r.json();
    if (d.records) records.push(...d.records);
    offset = d.offset || '';
  } while (offset);
  return records;
}

export default async function handler(req, res) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE) return res.status(500).json({ error: 'Config missing' });

  try {
    const [sellers, orders, ratings] = await Promise.all([
      fetchAll('Sellers_Requests'),
      fetchAll('Orders'),
      fetchAll('Ratings')
    ]);

    const approved = sellers.filter(s => s.fields.status === 'approved');

    // Build per-seller analytics
    const analytics = approved.map(seller => {
      const username  = seller.fields.username || '';
      const shopName  = seller.fields.shop_name || username;
      const whatsapp  = seller.fields.whatsapp  || '';

      // Orders for this seller
      const sellerOrders = orders.filter(o => o.fields.seller_username === username);
      const totalOrders  = sellerOrders.length;
      const totalPi      = sellerOrders.reduce((s, o) => s + (parseFloat(o.fields.amount_pi) || 0), 0);

      // Delivery breakdown
      const delivered  = sellerOrders.filter(o => o.fields.delivery_status === 'delivered').length;
      const shipped    = sellerOrders.filter(o => o.fields.delivery_status === 'shipped').length;
      const pending    = sellerOrders.filter(o => o.fields.delivery_status === 'pending' || !o.fields.delivery_status).length;
      const cancelled  = sellerOrders.filter(o => o.fields.delivery_status === 'cancelled').length;
      const deliveryPct = totalOrders > 0 ? Math.round((delivered / totalOrders) * 100) : 0;

      // Top product
      const productCounts = {};
      sellerOrders.forEach(o => {
        const name = o.fields.product_name || '(بدون اسم)';
        productCounts[name] = (productCounts[name] || 0) + 1;
      });
      const topProduct = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
      const topProductCount = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0]?.[1] || 0;

      // Ratings for this seller
      const sellerRatings = ratings.filter(r => r.fields.seller_username === username);
      const ratingCount   = sellerRatings.length;
      const avgRating     = ratingCount > 0
        ? sellerRatings.reduce((s, r) => s + (parseFloat(r.fields.stars) || 0), 0) / ratingCount
        : 0;

      // Star distribution
      const starDist = [1,2,3,4,5].map(n => ({
        stars: n,
        count: sellerRatings.filter(r => r.fields.stars === n).length
      }));

      // Last order date
      const orderDates = sellerOrders
        .map(o => o.fields.created_at)
        .filter(Boolean)
        .sort()
        .reverse();
      const lastOrderDate = orderDates[0] ? orderDates[0].split('T')[0] : '—';

      return {
        username,
        shopName,
        whatsapp,
        totalOrders,
        totalPi: parseFloat(totalPi.toFixed(4)),
        delivered, shipped, pending, cancelled,
        deliveryPct,
        topProduct,
        topProductCount,
        ratingCount,
        avgRating: parseFloat(avgRating.toFixed(2)),
        starDist,
        lastOrderDate
      };
    });

    // Sort by total Pi earned descending
    analytics.sort((a, b) => b.totalPi - a.totalPi);

    // Platform-wide summary
    const summary = {
      totalSellers:    approved.length,
      activeSellers:   analytics.filter(a => a.totalOrders > 0).length,
      totalOrders:     orders.length,
      totalPi:         parseFloat(orders.reduce((s, o) => s + (parseFloat(o.fields.amount_pi) || 0), 0).toFixed(4)),
      totalRatings:    ratings.length,
      overallAvgRating: ratings.length > 0
        ? parseFloat((ratings.reduce((s, r) => s + (parseFloat(r.fields.stars) || 0), 0) / ratings.length).toFixed(2))
        : 0,
      deliveredOrders: orders.filter(o => o.fields.delivery_status === 'delivered').length
    };

    return res.status(200).json({ summary, sellers: analytics });
  } catch (e) {
    console.error('[seller-analytics]', e);
    return res.status(500).json({ error: 'فشل جلب التحليلات' });
  }
}
