import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function BecomeSeller() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [shopName, setShopName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  useEffect(() => {
    const init = () => {
      if (typeof window !== 'undefined' && window.Pi) {
        window.Pi.init({ version: '2.0', sandbox: false });
      } else { setTimeout(init, 500); }
    };
    init();
  }, []);

  async function loginWithPi() {
    try {
      if (!window.Pi) { showToast('يرجى الفتح من متصفح Pi'); return; }
      const auth = await window.Pi.authenticate(['username', 'payments'], {
        onIncompletePaymentFound: async (payment) => {
          try {
            await fetch('/api/payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', paymentId: payment.identifier }) });
            await fetch('/api/payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete', paymentId: payment.identifier, txid: payment.transaction?.txid || '' }) });
          } catch(e) {}
        }
      });
      setUser(auth.user);
      await checkStatus(auth.user.username);
    } catch(e) { showToast('فشل تسجيل الدخول'); }
  }

  async function checkStatus(username) {
    setLoading(true);
    try {
      const res = await fetch(`/api/seller-request?username=${username}`);
      const data = await res.json();
      if (data.isSeller) setStatus('approved');
      else if (data.requestStatus) setStatus(data.requestStatus);
      else setStatus('not_found');
    } catch(e) { setStatus('not_found'); }
    setLoading(false);
  }

  async function submitRequest() {
    if (!shopName.trim()) { showToast('أدخل اسم المتجر'); return; }
    if (!whatsapp.trim()) { showToast('أدخل رقم الواتساب'); return; }
    if (!user) { showToast('سجّل الدخول أولاً'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/seller-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, shop_name: shopName.trim(), whatsapp: whatsapp.trim() })
      });
      const data = await res.json();
      if (data.success) { setStatus('pending'); showToast('تم إرسال طلبك بنجاح!'); }
      else if (data.error === 'طلب موجود مسبقاً') { setStatus(data.status); showToast('طلبك موجود مسبقاً'); }
      else showToast(data.error || 'حدث خطأ');
    } catch(e) { showToast('خطأ في الإرسال'); }
    setSubmitting(false);
  }

  return (
    <>
      <Head>
        <title>انضم كتاجر - Souq Pi</title>
        <script src="https://sdk.minepi.com/pi-sdk.js"></script>
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0a0118;color:#fff;font-family:'Cairo',sans-serif;direction:rtl;min-height:100vh;padding-bottom:40px;}
        .header{background:rgba(26,11,46,0.95);padding:14px 20px;border-bottom:1px solid #d4af37;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:100;}
        .back-btn{background:rgba(255,255,255,0.08);border:none;color:#fff;padding:8px 14px;border-radius:10px;cursor:pointer;font-family:'Cairo',sans-serif;font-size:0.85em;}
        .container{max-width:480px;margin:0 auto;padding:24px 16px;}
        .hero{text-align:center;margin-bottom:24px;}
        .benefits{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px;}
        .benefit{background:rgba(255,255,255,0.04);border:1px solid rgba(106,13,173,0.3);border-radius:14px;padding:14px 10px;text-align:center;}
        .card{background:rgba(26,11,46,0.8);border:1px solid #331a5e;border-radius:20px;padding:22px;}
        .label{font-size:0.85em;color:#d4af37;font-weight:700;margin-bottom:8px;}
        .input{width:100%;background:#0a0118;border:1px solid #6a0dad;padding:14px;border-radius:12px;color:#fff;font-size:1em;font-family:'Cairo',sans-serif;margin-bottom:16px;direction:rtl;outline:none;}
        .input-wa{width:100%;background:#0a0118;border:1px solid #25d366;padding:14px;border-radius:12px;color:#fff;font-size:1em;font-family:'Cairo',sans-serif;margin-bottom:16px;direction:ltr;outline:none;}
        .btn-primary{background:linear-gradient(135deg,#6a0dad,#d4af37);color:white;border:none;padding:14px;border-radius:14px;font-weight:900;cursor:pointer;font-size:1em;width:100%;font-family:'Cairo',sans-serif;}
        .btn-primary:disabled{opacity:0.6;cursor:not-allowed;}
        .btn-login{background:rgba(106,13,173,0.3);border:1px solid #6a0dad;color:#fff;padding:14px;border-radius:14px;font-weight:700;cursor:pointer;font-size:1em;width:100%;font-family:'Cairo',sans-serif;}
        .status-box{border-radius:20px;padding:30px 20px;text-align:center;}
        .user-bar{background:rgba(106,13,173,0.2);border:1px solid rgba(106,13,173,0.4);border-radius:12px;padding:10px 14px;display:flex;align-items:center;gap:10px;margin-bottom:16px;}
        .user-avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#6a0dad,#d4af37);display:flex;align-items:center;justify-content:center;font-weight:900;flex-shrink:0;}
        .divider{height:1px;background:rgba(255,255,255,0.06);margin:16px 0;}
        .toast{position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#6a0dad;padding:10px 20px;border-radius:20px;font-size:0.85em;z-index:2000;white-space:nowrap;}
      `}</style>

      <div className="header">
        <button className="back-btn" onClick={() => window.history.back()}>← رجوع</button>
        <div style={{ fontWeight: 900 }}>انضم كتاجر</div>
      </div>

      <div className="container">
        <div className="hero">
          <div style={{ fontSize: '3.5em', marginBottom: 12 }}>🛍️</div>
          <div style={{ fontWeight: 900, fontSize: '1.5em', marginBottom: 8 }}>
            ابدأ البيع في <span style={{ color: '#d4af37' }}>سوق Pi</span>
          </div>
          <div style={{ fontSize: '0.85em', color: '#b0b0b0', lineHeight: 1.6 }}>
            انضم إلى آلاف التجار وابدأ البيع بعملة Pi
          </div>
        </div>

        <div className="benefits">
          {[
            { icon: '🚀', text: 'إضافة منتجاتك بسهولة' },
            { icon: 'π', text: 'استقبل مدفوعات Pi' },
            { icon: '🌍', text: 'وصول لآلاف المشترين' },
            { icon: '🔒', text: 'منصة آمنة وموثوقة' },
          ].map((b, i) => (
            <div key={i} className="benefit">
              <div style={{ fontSize: '1.6em', marginBottom: 6 }}>{b.icon}</div>
              <div style={{ fontSize: '0.75em', color: '#d4af37', fontWeight: 700 }}>{b.text}</div>
            </div>
          ))}
        </div>

        <div className="card">
          {!user && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.9em', color: '#b0b0b0', marginBottom: 16 }}>سجّل الدخول بحساب Pi لإرسال طلبك</div>
              <button className="btn-login" onClick={loginWithPi}>تسجيل الدخول بـ Pi</button>
            </div>
          )}

          {user && loading && <div style={{ textAlign: 'center', padding: 20, color: '#b0b0b0' }}>جاري التحقق...</div>}

          {user && !loading && (
            <>
              <div className="user-bar">
                <div className="user-avatar">{user.username[0].toUpperCase()}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9em' }}>@{user.username}</div>
                  <div style={{ fontSize: '0.7em', color: '#b0b0b0' }}>مسجل الدخول</div>
                </div>
              </div>
              <div className="divider" />

              {status === 'not_found' && (
                <>
                  <div className="label">اسم متجرك</div>
                  <input className="input" type="text" placeholder="مثال: متجر أحمد للإلكترونيات" value={shopName} onChange={e => setShopName(e.target.value)} maxLength={50} />
                  <div className="label" style={{ color: '#25d366' }}>رقم الواتساب</div>
                  <input className="input-wa" type="tel" placeholder="+962791234567" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} maxLength={20} />
                  <div style={{ fontSize: '0.72em', color: '#b0b0b0', marginBottom: 16, marginTop: -10 }}>أدخل الرقم مع رمز الدولة</div>
                  <button className="btn-primary" onClick={submitRequest} disabled={submitting || !shopName.trim() || !whatsapp.trim()}>
                    {submitting ? 'جاري الإرسال...' : 'أرسل طلب الانضمام'}
                  </button>
                </>
              )}

              {status === 'pending' && (
                <div className="status-box" style={{ background: 'rgba(234,179,8,0.08)', border: '2px solid #eab308' }}>
                  <div style={{ fontSize: '3em', marginBottom: 12 }}>⏳</div>
                  <div style={{ fontWeight: 900, fontSize: '1.1em', color: '#eab308', marginBottom: 8 }}>طلبك قيد المراجعة</div>
                  <div style={{ fontSize: '0.82em', color: '#b0b0b0', lineHeight: 1.7 }}>تم استلام طلبك! سيتم الرد عليك قريباً.</div>
                </div>
              )}

              {status === 'approved' && (
                <div className="status-box" style={{ background: 'rgba(34,197,94,0.08)', border: '2px solid #22c55e' }}>
                  <div style={{ fontSize: '3em', marginBottom: 12 }}>🎉</div>
                  <div style={{ fontWeight: 900, fontSize: '1.1em', color: '#22c55e', marginBottom: 8 }}>مبروك! أنت تاجر معتمد</div>
                  <div style={{ fontSize: '0.82em', color: '#b0b0b0', lineHeight: 1.7, marginBottom: 16 }}>تمت الموافقة على طلبك! يمكنك الآن إضافة منتجاتك.</div>
                  <button className="btn-primary" onClick={() => window.location.href = '/seller-dashboard'}>لوحة التاجر</button>
                </div>
              )}

              {status === 'rejected' && (
                <div className="status-box" style={{ background: 'rgba(239,68,68,0.08)', border: '2px solid #ef4444' }}>
                  <div style={{ fontSize: '3em', marginBottom: 12 }}>❌</div>
                  <div style={{ fontWeight: 900, fontSize: '1.1em', color: '#ef4444', marginBottom: 8 }}>تم رفض طلبك</div>
                  <div style={{ fontSize: '0.82em', color: '#b0b0b0', lineHeight: 1.7 }}>نأسف، لم تتم الموافقة على طلبك. تواصل مع الإدارة لمعرفة السبب.</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
