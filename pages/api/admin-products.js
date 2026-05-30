const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID;
const ADMIN_KEY      = process.env.ADMIN_SECRET_KEY;
const TABLES         = ['Cars', 'Electronics', 'Electric', 'Real_Estate'];

function auth(req) {
  return req.headers['x-admin-key'] === ADMIN_KEY;
}

export default async function handler(req, res) {
  if (!auth(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE) return res.status(500).json({ error: 'Config missing' });

  // ── GET: كل المنتجات من جميع الجداول ─────────────────
  if (req.method === 'GET') {
    try {
      const results = await Promise.all(
        TABLES.map(async table => {
          const r = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE}/${table}`,
            { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
          );
          const d = await r.json();
          return (d.records || []).map(rec => ({ ...rec, _table: table }));
        })
      );
      return res.status(200).json({ records: results.flat() });
    } catch (e) {
      return res.status(500).json({ error: 'فشل جلب المنتجات' });
    }
  }

  // ── DELETE: حذف منتج بواسطة الأدمن ──────────────────
  if (req.method === 'DELETE') {
    const { recordId, tableName } = req.body;
    if (!recordId || !tableName) return res.status(400).json({ error: 'recordId و tableName مطلوبان' });
    if (!TABLES.includes(tableName)) return res.status(400).json({ error: 'اسم جدول غير صالح' });

    try {
      const r = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableName}/${recordId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
      );
      const data = await r.json();
      return res.status(200).json({ success: !!data.deleted });
    } catch (e) {
      return res.status(500).json({ error: 'فشل حذف المنتج' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
