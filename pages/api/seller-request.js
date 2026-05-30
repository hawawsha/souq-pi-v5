const AIRTABLE_TOKEN   = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

async function airtableFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  console.log('[seller-request] Airtable status:', res.status, url.split('?')[0].split('/').pop());
  if (!res.ok) {
    const errText = await res.text();
    console.error('[seller-request] Airtable error:', errText);
    throw new Error(`Airtable ${res.status}: ${errText.slice(0, 120)}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    console.error('[seller-request] Missing env vars');
    return res.status(500).json({ error: 'إعدادات السيرفر ناقصة — AIRTABLE_TOKEN أو AIRTABLE_BASE_ID' });
  }

  if (req.method === 'GET') {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username مطلوب' });

    try {
      console.log('[seller-request] Checking seller status for:', username);
      const approvedData = await airtableFetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Approved_Sellers?filterByFormula=${encodeURIComponent(`{username}="${username}"`)}`
      );
      if (approvedData.records?.length > 0) {
        console.log('[seller-request] User IS an approved seller:', username);
        return res.status(200).json({ isSeller: true });
      }

      const reqData = await airtableFetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sellers_Requests?filterByFormula=${encodeURIComponent(`{username}="${username}"`)}`
      );
      if (reqData.records?.length > 0) {
        const status = reqData.records[0].fields.status;
        console.log('[seller-request] User has request with status:', status);
        return res.status(200).json({ isSeller: false, requestStatus: status });
      }
      console.log('[seller-request] No record found for:', username);
      return res.status(200).json({ isSeller: false, requestStatus: null });
    } catch (e) {
      console.error('[seller-request] Error:', e.message);
      return res.status(502).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { username, shop_name, whatsapp } = req.body;
    if (!username || !shop_name) return res.status(400).json({ error: 'بيانات ناقصة' });
    if (!whatsapp || whatsapp.trim().length < 7) return res.status(400).json({ error: 'رقم الواتساب مطلوب' });

    try {
      const checkData = await airtableFetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sellers_Requests?filterByFormula=${encodeURIComponent(`{username}="${username}"`)}`
      );
      if (checkData.records?.length > 0) {
        return res.status(200).json({ error: 'طلب موجود مسبقاً', status: checkData.records[0].fields.status });
      }

      const data = await airtableFetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sellers_Requests`,
        { method: 'POST', body: JSON.stringify({ fields: { username, shop_name, whatsapp: whatsapp.trim(), status: 'pending' } }) }
      );
      console.log('[seller-request] New seller request created for:', username);
      return res.status(200).json({ success: true, data });
    } catch (e) {
      console.error('[seller-request] POST Error:', e.message);
      return res.status(502).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
