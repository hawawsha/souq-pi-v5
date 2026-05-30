const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID;
const TABLES         = ['Cars', 'Electronics', 'Electric', 'Real_Estate'];

export default async function handler(req, res) {
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE) {
    console.error('[seller-products] Missing env vars');
    return res.status(500).json({ error: 'إعدادات السيرفر ناقصة' });
  }

  if (req.method === 'GET') {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username مطلوب' });
    console.log('[seller-products] Fetching products for seller:', username);

    try {
      // فحص أولي سريع للتوكن قبل جلب كل الجداول
      const testUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/Cars?maxRecords=1`;
      const testRes = await fetch(testUrl, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      console.log('[seller-products] Airtable token check status:', testRes.status);
      if (!testRes.ok) {
        const errBody = await testRes.json().catch(() => ({}));
        console.error('[seller-products] Airtable auth failed:', errBody);
        return res.status(502).json({ error: `Airtable: ${testRes.status} — تحقق من AIRTABLE_TOKEN`, records: [] });
      }

      const results = await Promise.all(
        TABLES.map(async table => {
          const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${table}?filterByFormula=${encodeURIComponent(`{seller_username}="${username}"`)}`;
          const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
          console.log(`[seller-products] ${table} status:`, r.status);
          if (!r.ok) {
            const errText = await r.text();
            console.error(`[seller-products] ${table} error:`, errText);
            return [];
          }
          const d = await r.json();
          return (d.records || []).map(p => ({ ...p, fields: { ...p.fields, table_name: table } }));
        })
      );
      const records = results.flat();
      console.log('[seller-products] Total products found:', records.length);
      return res.status(200).json({ records });
    } catch (e) {
      console.error('[seller-products] Error:', e.message);
      return res.status(500).json({ error: 'فشل جلب المنتجات' });
    }
  }

  if (req.method === 'DELETE') {
    const { username, recordId, tableName } = req.body;
    if (!username || !recordId || !tableName) return res.status(400).json({ error: 'بيانات ناقصة' });
    if (!TABLES.includes(tableName)) return res.status(400).json({ error: 'اسم جدول غير صالح' });

    try {
      // التحقق أن المستخدم بائع معتمد
      const checkRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE}/Approved_Sellers?filterByFormula=${encodeURIComponent(`{username}="${username}"`)}`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
      );
      console.log('[seller-products] DELETE auth check status:', checkRes.status);
      if (!checkRes.ok) {
        const errText = await checkRes.text();
        console.error('[seller-products] DELETE auth check error:', errText);
        return res.status(502).json({ error: `Airtable ${checkRes.status} — تحقق من AIRTABLE_TOKEN` });
      }
      const checkData = await checkRes.json();
      if (!checkData.records?.length) return res.status(403).json({ error: 'غير مصرح — لست بائعاً معتمداً' });

      const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableName}/${recordId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
      });
      console.log('[seller-products] DELETE product status:', response.status);
      const data = await response.json();
      return res.status(200).json({ success: !!data.deleted });
    } catch (e) {
      console.error('[seller-products] DELETE error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
