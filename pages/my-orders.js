import { useState, useEffect } from 'react';
import Head from 'next/head';

function log(label, data) {
  const ts = new Date().toLocaleTimeString('ar-SA');
  console.log(`[Souq Pi | ${ts}] ${label}`, data !== undefined ? data : '');
}

function StarRating({ value, onChange, disabled }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', margin: '8px 0' }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span
          key={s}
          onClick={() => !disabled && onChange(s)}
          onMouseEnter={() => !disabled && setHover(s)}
          onMouseLeave={() => !disabled && setHover(0)}
          style={{
            fontSize: '1.6em',
            cursor: disabled ? 'default' : 'pointer',
            color: s <= (hover || value) ? '#d4af37' : '#331a5e',
            transition: 'color 0.15s',
            userSelect: 'none'
          }}
        >★</span>
      ))}
    </div>
  );
}

export default function MyOrders() {
  const [user,        setUser]        = useState(null);
  const [orders,      setOrders]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [toast,       setToast]       = useState('');
  const [requesting,  setRequesting]  = useState(null);
  const [balance,     setBalance]     = useState(null);
  const [apiError,    setApiError]    = useState(null);
  const [health,      setHealth]      = useState(null);

  // ratings: map of payment_id → { stars, comment, submitted }
  const [ratings,     setRatings]     = useState({});
  const [ratingInput, setRatingInput] = useState({});  // { [payment_id]: { stars, comment } }
  const [submitting,  setSubmitting]  = useState(null);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 5000); }

  useEffect(() => {
    log('📄 صفحة طلباتي — تهيئة Pi SDK');
    checkHealth();
    const init = async () => {
      if (typeof window !== 'undefined' && window.Pi) {
        await window.Pi.init({ version: '2.0', sandbox: true });
        log('✅ Pi SDK جاهز');
      } else {
        log('⏳ انتظار Pi SDK...');
        setTimeout(init, 500);
      }
    };
    init();
  }, []);

  async function checkHealth() {
    try {
      const r = await fetch('/api/health');
      const d = await r.json();
      setHealth(d);
    } catch (e) {
      setHealth({ ok: false, checks: { error: e.message } });
    }
  }

  async function loginWithPi() {
    log('🔐 محاولة تسجيل الدخول بـ Pi...');
    try {
      if (!window.Pi) { showToast('يرجى الفتح من متصفح Pi'); return; }
      const auth = await window.Pi.authenticate(['username', 'payments', 'wallet_address'], {
        onIncompletePaymentFound: async (p) => {
          try {
            await fetch('/api/payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', paymentId: p.identifier }) });
            await fetch('/api/payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete', paymentId: p.identifier, txid: p.transaction?.txid || '' }) });
          } catch(e) {}
        }
      });
      log('✅ تسجيل دخول ناجح:', { username: auth.user.username });
      setUser(auth.user);
      await loadOrders(auth.user.username);
      if (auth.user.wallet_address) {
        const balRes  = await fetch(`/api/balance?walletAddress=${auth.user.wallet_address}`);
        const balData = await balRes.json();
        if (balData.balance) setBalance(balData.balance);
      }
    } catch(e) {
      log('❌ فشل تسجيل الدخول:', e.message);
      showToast('فشل تسجيل الدخول: ' + e.message);
    }
  }

  async function loadOrders(username) {
    setLoading(true);
    setApiError(null);
    try {
      const res  = await fetch(`/api/my-orders?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      if (!res.ok) {
        setApiError({ status: res.status, message: data.error || `HTTP ${res.status}` });
        setOrders([]);
      } else {
        const records = data.records || [];
        setOrders(records);
        // Load existing ratings for all orders
        await loadRatings(records, username);
      }
    } catch(e) {
      setApiError({ status: 0, message: 'تعذّر الاتصال بالسيرفر: ' + e.message });
      setOrders([]);
    }
    setLoading(false);
  }

  async function loadRatings(orders, username) {
    if (!orders.length) return;
    try {
      const ratingMap = {};
      await Promise.all(
        orders.map(async (order) => {
          const pid = order.fields.payment_id;
          if (!pid) return;
          const r = await fetch(`/api/ratings?payment_id=${encodeURIComponent(pid)}`);
          const d = await r.json();
          const existing = d.records?.find(rec => rec.fields.buyer_username === username);
          if (existing) {
            ratingMap[pid] = {
              stars:     existing.fields.stars,
              comment:   existing.fields.comment || '',
              submitted: true
            };
          }
        })
      );
      setRatings(ratingMap);
    } catch(e) { /* ratings are optional — don't block */ }
  }

  async function submitRating(order) {
    const pid    = order.fields.payment_id;
    const input  = ratingInput[pid] || {};
    const stars  = input.stars || 0;
    const comment = input.comment || '';

    if (!stars) { showToast('اختر عدد النجوم أولاً'); return; }
    setSubmitting(pid);
    try {
      const res = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_username:  user.username,
          seller_username: order.fields.seller_username || '',
          product_id:      order.fields.product_id      || '',
          payment_id:      pid,
          stars,
          comment
        })
      });
      const data = await res.json();
      if (res.ok && (data.success || data.message)) {
        setRatings(r => ({ ...r, [pid]: { stars, comment, submitted: true } }));
        showToast('شكراً! تم حفظ تقييمك ⭐');
      } else {
        showToast(data.error || 'فشل حفظ التقييم');
      }
    } catch(e) {
      showToast('خطأ في الإرسال');
    }
    setSubmitting(null);
  }

  async function requestRefund(order) {
    setRequesting(order.id);
    try {
      const res  = await fetch('/api/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:         'request',
          buyer_username: user.username,
          product_id:     order.fields.product_id,
          product_name:   order.fields.product_name,
          payment_id:     order.fields.payment_id,
          amount_pi:      order.fields.amount_pi,
          buyer_uid:      user.uid || ''
        })
      });
      const data = await res.json();
      if (res.ok) showToast('تم إرسال طلب الاسترجاع بنجاح');
      else showToast(data.error || 'فشل إرسال الطلب');
    } catch(e) {
      showToast('خطأ في الاتصال');
    }
    setRequesting(null);
  }

  function openWhatsapp(number, productName) {
    const clean = number.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
    const msg   = encodeURIComponent(`مرحباً، اشتريت منك منتج "${productName}" عبر سوق Pi. هل يمكنك التواصل معي؟`);
    window.open(`https://wa.me/${clean}?text=${msg}`, '_blank');
  }

  const isAirtableDown = health && !health.ok;
  const is401          = health?.checks?.airtable_status === 401;

  const STATUS_COLORS = {
    pending:   { bg: 'rgba(234,179,8,0.12)',  border: '#eab308', color: '#eab308',  label: '⏳ قيد المعالجة' },
    shipped:   { bg: 'rgba(56,189,248,0.12)', border: '#38bdf8', color: '#38bdf8',  label: '🚚 تم الشحن'    },
    delivered: { bg: 'rgba(34,197,94,0.12)',  border: '#22c55e', color: '#22c55e',  label: '✅ تم التسليم'   },
    cancelled: { bg: 'rgba(239,68,68,0.12)',  border: '#ef4444', color: '#ef4444',  label: '🚫 ملغي'        },
  };

  return (
    <>
      <Head>
        <title>طلباتي - Souq Pi</title>
        <script src="https://sdk.minepi.com/pi-sdk.js"></script>
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0a0118;color:#fff;font-family:'Cairo',sans-serif;direction:rtl;min-height:100vh;padding-bottom:100px;}
        .header{background:rgba(26,11,46,0.95);padding:14px 20px;border-bottom:1px solid #d4af37;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:100;}
        .back-btn{background:rgba(255,255,255,0.08);border:none;color:#fff;padding:8px 14px;border-radius:10px;cursor:pointer;font-family:'Cairo',sans-serif;font-size:0.85em;}
        .container{max-width:480px;margin:0 auto;padding:16px;}
        .login-box{text-align:center;padding:60px 20px;}
        .btn-login{background:linear-gradient(135deg,#6a0dad,#d4af37);color:white;border:none;padding:14px 30px;border-radius:14px;font-weight:900;cursor:pointer;font-size:1em;font-family:'Cairo',sans-serif;margin-top:20px;}
        .order-card{background:#1a0b2e;border:1px solid #331a5e;border-radius:16px;padding:16px;margin-bottom:12px;}
        .order-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;}
        .order-name{font-weight:800;font-size:0.95em;}
        .order-price{color:#d4af37;font-weight:900;font-size:0.9em;white-space:nowrap;}
        .order-date{font-size:0.7em;color:#b0b0b0;margin-top:4px;}
        .order-table{display:inline-block;background:rgba(106,13,173,0.3);border:1px solid #6a0dad;border-radius:8px;padding:2px 10px;font-size:0.72em;color:#c084fc;margin-top:6px;}
        .status-badge{display:inline-block;padding:3px 12px;border-radius:10px;font-size:0.72em;font-weight:700;margin-top:6px;}
        .btn-track{background:rgba(106,13,173,0.25);border:1px solid #6a0dad;color:#c084fc;padding:7px;border-radius:10px;width:100%;font-size:0.8em;margin-top:8px;cursor:pointer;font-family:'Cairo',sans-serif;font-weight:700;}
        .btn-refund{background:none;border:1px solid #ef4444;color:#ef4444;padding:8px;border-radius:10px;width:100%;font-size:0.8em;margin-top:8px;cursor:pointer;font-family:'Cairo',sans-serif;font-weight:700;}
        .btn-refund:disabled{opacity:0.5;cursor:not-allowed;}
        .btn-whatsapp{background:linear-gradient(135deg,#25d366,#128c7e);color:#fff;border:none;padding:8px;border-radius:10px;width:100%;font-size:0.8em;margin-top:8px;cursor:pointer;font-family:'Cairo',sans-serif;font-weight:700;}
        .rating-box{background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.2);border-radius:12px;padding:12px;margin-top:10px;}
        .rating-title{font-size:0.78em;color:#d4af37;font-weight:700;margin-bottom:6px;text-align:center;}
        .rating-done{text-align:center;padding:8px;font-size:0.8em;color:#4ade80;}
        .rating-textarea{width:100%;background:#0a0118;border:1px solid #331a5e;border-radius:10px;padding:9px 12px;color:#fff;font-family:'Cairo';font-size:0.82em;resize:none;outline:none;margin-top:6px;}
        .btn-rate{background:linear-gradient(135deg,#6a0dad,#d4af37);color:#fff;border:none;padding:8px;border-radius:10px;width:100%;font-weight:700;cursor:pointer;font-family:'Cairo';font-size:0.82em;margin-top:8px;}
        .btn-rate:disabled{opacity:0.5;cursor:not-allowed;}
        .empty{text-align:center;padding:40px 20px;color:#b0b0b0;}
        .toast{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#6a0dad;padding:10px 20px;border-radius:20px;font-size:0.85em;z-index:2000;max-width:90%;text-align:center;}
        .count-badge{background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.3);border-radius:12px;padding:8px 16px;margin-bottom:16px;text-align:center;font-size:0.85em;color:#d4af37;}
        .balance-badge{background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.3);border-radius:12px;padding:8px 16px;margin-bottom:16px;text-align:center;font-size:0.85em;color:#4ade80;}
        .bottom-nav{position:fixed;bottom:0;left:0;right:0;background:#1a0b2e;display:flex;justify-content:space-around;padding:12px;border-top:1px solid #6a0dad;z-index:1000;}
        .nav-item{text-align:center;font-size:0.7em;cursor:pointer;color:#b0b0b0;flex:1;}
        .nav-item.active{color:#d4af37;}
        .diag-banner{margin-bottom:14px;border-radius:14px;padding:14px 16px;font-size:0.82em;line-height:1.6;}
        .diag-banner.error{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.4);}
        .diag-banner.ok{background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);color:#86efac;}
        .diag-title{font-weight:900;font-size:0.95em;margin-bottom:6px;}
        .diag-row{display:flex;gap:8px;align-items:flex-start;margin-top:4px;}
        .diag-key{color:#b0b0b0;flex-shrink:0;}
        .diag-val{color:#fca5a5;font-weight:700;direction:ltr;text-align:right;flex:1;word-break:break-all;}
        .diag-recheck{background:none;border:1px solid rgba(255,255,255,0.2);color:#b0b0b0;padding:5px 14px;border-radius:8px;cursor:pointer;font-family:'Cairo';font-size:0.85em;margin-top:8px;}
      `}</style>

      <div className="header">
        <button className="back-btn" onClick={() => window.location.href = '/'}>← رجوع</button>
        <div style={{ fontWeight: 900 }}>طلباتي</div>
      </div>

      <div className="container">

        {isAirtableDown && (
          <div className="diag-banner error">
            <div className="diag-title">🔴 تشخيص: سبب عدم ظهور البيانات</div>
            <div className="diag-row">
              <span className="diag-key">الحالة:</span>
              <span className="diag-val">{health?.checks?.airtable_status || 'خطأ'} — {is401 ? 'AUTHENTICATION_REQUIRED' : 'Connection Error'}</span>
            </div>
            <div className="diag-row">
              <span className="diag-key">Pi Key:</span>
              <span style={{ color: health?.checks?.pi_key ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                {health?.checks?.pi_key ? '✅ موجود' : '❌ مفقود'}
              </span>
            </div>
            <button className="diag-recheck" onClick={checkHealth}>↻ إعادة الفحص</button>
          </div>
        )}

        {health?.ok && (
          <div className="diag-banner ok">
            <strong>🟢 الاتصال يعمل</strong> — Airtable ✓ | Pi API ✓
          </div>
        )}

        {apiError && (
          <div className="diag-banner error">
            <div className="diag-title">❌ فشل تحميل الطلبات</div>
            <div className="diag-row">
              <span className="diag-key">الخطأ:</span>
              <span className="diag-val">{apiError.message}</span>
            </div>
          </div>
        )}

        {!user ? (
          <div className="login-box">
            <div style={{ fontSize: '3em' }}>📦</div>
            <div style={{ fontWeight: 800, fontSize: '1.1em', margin: '12px 0 8px' }}>سجّل الدخول</div>
            <div style={{ fontSize: '0.85em', color: '#b0b0b0' }}>لمشاهدة مشترياتك وطلب الاسترجاع</div>
            <button className="btn-login" onClick={loginWithPi}>دخول بـ Pi</button>
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#b0b0b0' }}>
            <div style={{ fontSize: '1.5em', marginBottom: 8 }}>⏳</div>
            جاري تحميل طلباتك...
          </div>
        ) : (
          <>
            {balance && <div className="balance-badge">رصيدك: π {parseFloat(balance).toFixed(2)}</div>}
            {orders.length > 0 && <div className="count-badge">لديك {orders.length} طلب</div>}

            {orders.length === 0 && !apiError ? (
              <div className="empty">
                <div style={{ fontSize: '3em', marginBottom: 12 }}>🛒</div>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>لا توجد طلبات بعد</div>
                <div style={{ fontSize: '0.82em' }}>ابدأ التسوق من الصفحة الرئيسية</div>
                <button onClick={() => window.location.href = '/'} style={{ background: 'linear-gradient(135deg,#6a0dad,#d4af37)', border: 'none', color: 'white', padding: '10px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo', marginTop: 16 }}>
                  تسوق الآن
                </button>
              </div>
            ) : orders.map(order => {
              const pid         = order.fields.payment_id;
              const statusKey   = order.fields.delivery_status || 'pending';
              const statusStyle = STATUS_COLORS[statusKey] || STATUS_COLORS.pending;
              const existRating = ratings[pid];
              const inp         = ratingInput[pid] || {};

              return (
                <div key={order.id} className="order-card">
                  <div className="order-header">
                    <div>
                      <div className="order-name">{order.fields.product_name || 'منتج'}</div>
                      <div className="order-date">{order.fields.created_at ? order.fields.created_at.split('T')[0] : 'غير محدد'}</div>
                      <div className="order-table">{order.fields.table_name || ''}</div>
                      <div
                        className="status-badge"
                        style={{ background: statusStyle.bg, border: `1px solid ${statusStyle.border}`, color: statusStyle.color }}
                      >
                        {statusStyle.label}
                      </div>
                    </div>
                    <div className="order-price">π {order.fields.amount_pi}</div>
                  </div>

                  {/* Track order */}
                  <button className="btn-track" onClick={() => window.location.href = `/order/${order.id}`}>
                    🔍 تتبع الطلب
                  </button>

                  {/* Seller WhatsApp */}
                  {order.fields.seller_whatsapp && (
                    <button className="btn-whatsapp" onClick={() => openWhatsapp(order.fields.seller_whatsapp, order.fields.product_name)}>
                      📱 تواصل مع التاجر عبر واتساب
                    </button>
                  )}

                  {/* Refund */}
                  <button className="btn-refund" onClick={() => requestRefund(order)} disabled={requesting === order.id}>
                    {requesting === order.id ? 'جاري الإرسال...' : '↩️ طلب استرجاع'}
                  </button>

                  {/* ── Star Rating ── */}
                  <div className="rating-box">
                    <div className="rating-title">⭐ قيّم هذا الطلب</div>
                    {existRating?.submitted ? (
                      <div className="rating-done">
                        {'★'.repeat(existRating.stars)}{'☆'.repeat(5 - existRating.stars)}<br />
                        <span style={{ fontSize: '0.85em', color: '#b0b0b0' }}>
                          {existRating.comment || 'شكراً على تقييمك!'}
                        </span>
                      </div>
                    ) : (
                      <>
                        <StarRating
                          value={inp.stars || 0}
                          onChange={s => setRatingInput(r => ({ ...r, [pid]: { ...r[pid], stars: s } }))}
                          disabled={submitting === pid}
                        />
                        <textarea
                          className="rating-textarea"
                          rows={2}
                          placeholder="اكتب تعليقك هنا (اختياري)..."
                          value={inp.comment || ''}
                          onChange={e => setRatingInput(r => ({ ...r, [pid]: { ...r[pid], comment: e.target.value } }))}
                          disabled={submitting === pid}
                        />
                        <button
                          className="btn-rate"
                          disabled={!inp.stars || submitting === pid}
                          onClick={() => submitRating(order)}
                        >
                          {submitting === pid ? 'جاري الإرسال...' : '⭐ أرسل التقييم'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="bottom-nav">
        <div className="nav-item" onClick={() => window.location.href = '/'}>🏠<br />الرئيسية</div>
        <div className="nav-item" onClick={() => window.location.href = '/explore'}>🔍<br />استكشف</div>
        <div className="nav-item" onClick={() => window.location.href = '/balance'}>💰<br />الرصيد</div>
        <div className="nav-item active">📦<br />طلباتي</div>
        <div className="nav-item" onClick={() => window.location.href = '/become-seller'}>🏪<br />بيّع</div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
