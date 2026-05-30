const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const checks = { airtable: false, pi_key: false, airtable_status: null, error: null };

  checks.pi_key = !!process.env.PI_NETWORK_API_KEY;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE) {
    checks.error = 'AIRTABLE_TOKEN أو AIRTABLE_BASE_ID غير موجود في الـ Secrets';
    return res.status(200).json({ ok: false, checks });
  }

  try {
    const r = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/Orders?maxRecords=1`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }, signal: AbortSignal.timeout(6000) }
    );
    checks.airtable_status = r.status;
    if (r.ok) {
      checks.airtable = true;
    } else {
      const body = await r.json().catch(() => ({}));
      checks.error = body?.error?.type === 'AUTHENTICATION_REQUIRED'
        ? 'AIRTABLE_TOKEN منتهي الصلاحية — أنشئ Personal Access Token جديداً من airtable.com/create/tokens'
        : `Airtable ${r.status}: ${body?.error?.message || 'خطأ غير معروف'}`;
    }
  } catch (e) {
    checks.error = 'تعذّر الوصول إلى Airtable: ' + e.message;
  }

  return res.status(200).json({ ok: checks.airtable && checks.pi_key, checks });
}
