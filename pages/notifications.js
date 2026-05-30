import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function NotificationsPage() {
  const [user,         setUser]         = useState(null);
  const [isSeller,     setIsSeller]     = useState(false);
  const [sellerNotifs, setSellerNotifs] = useState([]);
  const [buyerOrders,  setBuyerOrders]  = useState([]);
  const [activeTab,    setActiveTab]    = useState('seller');
  const [loading,      setLoading]      = useState(false);
  const [toast,        setToast]        = useState('');

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  useEffect(() => {
    const init = async () => {
      if (typeof window !== 'undefined' && window.Pi) {
        await window.Pi.init({ version: '2.0', sandbox: true });
      } else { setTimeout(init, 500); }
    };
    init();
  }, []);

  async function loginWithPi() {
    if (!window.Pi) { showToast('يرجى الفتح من متصفح Pi'); return; }
    setLoading(true);
    try {
      const auth = await window.Pi.authenticate(['username', 'payments'], {
        onIncompletePaymentFound: async (p) => {
          try {
            await fetch('/api/payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', paymentId: p.identifier }) });
            await fetch('/api/payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete', paymentId: p.identifier, txid: p.transaction?.txid || '' }) });
          } catch(e) {}
        }
      });
      setUser(auth.user);
      await fetchAll(auth.user.username);
    } catch(e) { showToast('فشل تسجيل الدخول'); }
    setLoading(false);
  }

  async function fetchAll(username) {
    setLoading(true);
    try {
      // Parallel: check seller status + fetch buyer orders + fetch seller notifs
      const [sellerRes, ordersRes, notifsRes] = await Promise.all([
        fetch(`/api/seller-request?username=${encodeURIComponent(username)}`).then(r => r.json()),
        fetch(`/api/my-orders?username=${encodeURIComponent(username)}`).then(r => r.json()),
        fetch(`/api/notifications?seller_username=${encodeURIComponent(username)}`).then(r => r.json()),
      ]);

      const sellerStatus = sellerRes.isSeller || false;
      setIsSeller(sellerStatus);
      setBuyerOrders(ordersRes.records || []);
      setSellerNotifs(notifsRes.records || []);

      // Default tab: if seller has unread notifs, show seller tab; else buyer
      if (!sellerStatus || (notifsRes.records || []).length === 0) {
        setActiveTab('buyer');
      }
    } catch(e) { showToast('خطأ في التحميل'); }
    setLoading(false);
  }

  async function markRead(recordId) {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId })
      });
      setSellerNotifs(n => n.map(x => x.id === recordId
        ? { ...x, fields: { ...x.fields, is_read: true } }
        : x
      ));
    } catch(e) {}
  }

  async function markAllRead() {
    const unread = sellerNotifs.filter(n => !n.fields.is_read);
    await Promise.all(unread.map(n => markRead(n.id)));
  }

  function buildWaLink(notif) {
    const f = notif.fields;
    const phone = String(f.seller_whatsapp || '').replace(/\D/g, '');
    const msg   = encodeURIComponent(
      `🛍️ لديك طلب جديد في Souq Pi\n\nالمنتج: ${f.product_name || ''}\nالمبلغ: π ${f.amount_pi || ''}\nالمشتري: @${f.buyer_username || ''}\nرقم الدفعة: ${f.payment_id || ''}`
    );
    return `https://wa.me/${phone}?text=${msg}`;
  }

  const STATUS_MAP = {
    pending:   { label: '⏳ قيد المعالجة', color: '#eab308' },
    shipped:   { label: '🚚 تم الشحن',     color: '#38bdf8' },
    delivered: { label: '✅ تم التسليم',   color: '#22c55e' },
    cancelled: { label: '🚫 ملغي',         color: '#ef4444' },
  };

  const unreadCount = sellerNotifs.filter(n => !n.fields.is_read).length;

  return (
    <>
      <Head>
        <title>الإشعارات - Souq Pi</title>
        <script src="https://sdk.minepi.com/pi-sdk.js"></script>
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0a0118;color:#fff;font-family:'Cairo',sans-serif;direction:rtl;min-height:100vh;padding-bottom:80px;}
        .header{background:rgba(26,11,46,0.95);padding:14px 20px;border-bottom:1px solid #d4af37;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:100;}
        .back-btn{background:rgba(255,255,255,0.08);border:none;color:#fff;padding:8px 14px;border-radius:10px;cursor:pointer;font-family:'Cairo',sans-serif;font-size:0.85em;}
        .container{max-width:480px;margin:0 auto;padding:16px;}
        .tabs{display:flex;border-bottom:1px solid #331a5e;margin-bottom:14px;}
        .tab{flex:1;padding:11px 4px;background:none;border:none;color:#b0b0b0;font-family:'Cairo';font-size:0.82em;cursor:pointer;border-bottom:2px solid transparent;position:relative;}
        .tab.active{color:#d4af37;border-bottom-color:#d4af37;font-weight:700;}
        .tab-badge{position:absolute;top:6px;right:50%;transform:translateX(60%);background:#ef4444;color:#fff;font-size:0.55em;width:17px;height:17px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;}
        .notif-card{border-radius:14px;padding:14px;margin-bottom:10px;border:1px solid;}
        .notif-card.unread{background:rgba(106,13,173,0.18);border-color:#6a0dad;}
        .notif-card.read{background:#1a0b2e;border-color:#331a5e;opacity:0.75;}
        .order-card{background:#1a0b2e;border:1px solid #331a5e;border-radius:14px;padding:14px;margin-bottom:10px;}
        .btn-wa{display:inline-flex;align-items:center;gap:6px;background:#25d366;color:#fff;border:none;padding:8px 14px;border-radius:10px;font-weight:700;cursor:pointer;font-family:'Cairo';font-size:0.8em;text-decoration:none;}
        .btn-read{background:rgba(255,255,255,0.07);border:1px solid #331a5e;color:#b0b0b0;padding:7px 12px;border-radius:10px;font-family:'Cairo';font-size:0.75em;cursor:pointer;}
        .btn-mark-all{background:rgba(106,13,173,0.2);border:1px solid #6a0dad;color:#c084fc;padding:7px 14px;border-radius:10px;font-family:'Cairo';font-size:0.78em;cursor:pointer;width:100%;margin-bottom:12px;}
        .btn-track{display:inline-flex;align-items:center;gap:5px;background:rgba(106,13,173,0.25);border:1px solid #6a0dad;color:#c084fc;padding:7px 12px;border-radius:10px;font-size:0.78em;cursor:pointer;font-family:'Cairo';font-weight:700;}
        .login-box{text-align:center;padding:60px 20px;}
        .btn-login{background:linear-gradient(135deg,#6a0dad,#d4af37);color:white;border:none;padding:14px 30px;border-radius:14px;font-weight:900;cursor:pointer;font-size:1em;font-family:'Cairo';margin-top:20px;}
        .empty{text-align:center;padding:40px 20px;color:#b0b0b0;}
        .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#6a0dad;padding:10px 20px;border-radius:20px;font-size:0.85em;z-index:2000;}
        .new-pill{background:#6a0dad;color:#fff;font-size:0.6em;padding:2px 8px;border-radius:10px;font-weight:700;display:inline-block;margin-bottom:6px;}
        .bottom-nav{position:fixed;bottom:0;left:0;right:0;background:#1a0b2e;display:flex;justify-content:space-around;padding:12px;border-top:1px solid #6a0dad;z-index:1000;}
        .nav-item{text-align:center;font-size:0.7em;cursor:pointer;color:#b0b0b0;flex:1;}
        .nav-item.active{color:#d4af37;}
      `}</style>

      <div className="header">
        <button className="back-btn" onClick={() => window.history.back()}>← رجوع</button>
        <div style={{ fontWeight: 900, flex: 1 }}>
          🔔 الإشعارات
          {unreadCount > 0 && (
            <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.6em', padding: '2px 8px', borderRadius: '10px', marginRight: 8, fontWeight: 900 }}>
              {unreadCount}
            </span>
          )}
        </div>
      </div>

      <div className="container">
        {!user ? (
          <div className="login-box">
            <div style={{ fontSize: '3em' }}>🔔</div>
            <div style={{ fontWeight: 800, fontSize: '1.1em', margin: '12px 0 8px' }}>سجّل الدخول</div>
            <div style={{ fontSize: '0.85em', color: '#b0b0b0' }}>لمشاهدة إشعاراتك وطلباتك</div>
            <button className="btn-login" onClick={loginWithPi} disabled={loading}>
              {loading ? 'جاري...' : 'دخول بـ Pi'}
            </button>
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#b0b0b0' }}>⏳ جاري التحميل...</div>
        ) : (
          <>
            {/* Tabs: only show seller tab if user is a seller */}
            <div className="tabs">
              {isSeller && (
                <button className={`tab ${activeTab === 'seller' ? 'active' : ''}`} onClick={() => setActiveTab('seller')}>
                  🏪 إشعارات التاجر
                  {unreadCount > 0 && <span className="tab-badge">{unreadCount}</span>}
                </button>
              )}
              <button className={`tab ${activeTab === 'buyer' ? 'active' : ''}`} onClick={() => setActiveTab('buyer')}>
                📦 طلباتي ({buyerOrders.length})
              </button>
            </div>

            {/* ── SELLER TAB ── */}
            {activeTab === 'seller' && isSeller && (
              <>
                {unreadCount > 0 && (
                  <button className="btn-mark-all" onClick={markAllRead}>
                    ✓ تعليم الكل كمقروء ({unreadCount})
                  </button>
                )}
                {sellerNotifs.length === 0 ? (
                  <div className="empty">
                    <div style={{ fontSize: '2.5em', marginBottom: 10 }}>🔔</div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>لا توجد إشعارات بعد</div>
                    <div style={{ fontSize: '0.82em' }}>ستظهر هنا عند وصول طلب جديد</div>
                  </div>
                ) : sellerNotifs.map(n => {
                  const f = n.fields;
                  return (
                    <div key={n.id} className={`notif-card ${f.is_read ? 'read' : 'unread'}`}>
                      {!f.is_read && <span className="new-pill">🔔 جديد</span>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: '0.92em', marginBottom: 4 }}>🛒 طلب جديد</div>
                          <div style={{ fontSize: '0.82em', marginBottom: 2 }}>
                            <span style={{ color: '#b0b0b0' }}>المنتج: </span>{f.product_name}
                          </div>
                          <div style={{ color: '#d4af37', fontWeight: 900, fontSize: '0.88em', marginBottom: 2 }}>
                            π {f.amount_pi}
                          </div>
                          <div style={{ fontSize: '0.76em', color: '#b0b0b0' }}>
                            المشتري: @{f.buyer_username}
                          </div>
                          <div style={{ fontSize: '0.66em', color: '#6a0dad', marginTop: 3, direction: 'ltr', textAlign: 'right' }}>
                            #{f.payment_id?.slice(0, 14)}...
                          </div>
                        </div>
                        {!f.is_read && (
                          <button className="btn-read" onClick={() => markRead(n.id)}>✓</button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        {f.seller_whatsapp && (
                          <a className="btn-wa" href={buildWaLink(n)} target="_blank" rel="noopener noreferrer" onClick={() => markRead(n.id)}>
                            💬 واتساب المشتري
                          </a>
                        )}
                        {f.order_id && (
                          <button className="btn-track" onClick={() => window.location.href = `/order/${f.order_id}`}>
                            🔍 تتبع الطلب
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* ── BUYER TAB ── */}
            {activeTab === 'buyer' && (
              <>
                {buyerOrders.length === 0 ? (
                  <div className="empty">
                    <div style={{ fontSize: '2.5em', marginBottom: 10 }}>📦</div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>لا توجد طلبات بعد</div>
                    <button onClick={() => window.location.href = '/explore'} style={{ marginTop: 12, background: 'linear-gradient(135deg,#6a0dad,#d4af37)', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo' }}>
                      تسوق الآن
                    </button>
                  </div>
                ) : buyerOrders.map(o => {
                  const f = o.fields;
                  const statusKey = f.delivery_status || 'pending';
                  const status    = STATUS_MAP[statusKey] || STATUS_MAP.pending;
                  return (
                    <div key={o.id} className="order-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.92em' }}>{f.product_name || 'منتج'}</div>
                          <div style={{ fontSize: '0.7em', color: '#b0b0b0', marginTop: 2 }}>
                            {f.created_at ? f.created_at.split('T')[0] : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ color: '#d4af37', fontWeight: 900 }}>π {f.amount_pi}</div>
                          <div style={{ fontSize: '0.68em', fontWeight: 700, color: status.color, marginTop: 3 }}>
                            {status.label}
                          </div>
                        </div>
                      </div>
                      {f.seller_username && (
                        <div style={{ fontSize: '0.74em', color: '#b0b0b0', marginBottom: 8 }}>
                          البائع: @{f.seller_username}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="btn-track"
                          onClick={() => window.location.href = `/order/${o.id}`}
                        >
                          🔍 تتبع
                        </button>
                        {f.seller_whatsapp && (
                          <a
                            className="btn-wa"
                            href={`https://wa.me/${String(f.seller_whatsapp).replace(/\D/g,'')}?text=${encodeURIComponent(`مرحباً، أريد الاستفسار عن طلبي "${f.product_name}" رقم الدفع: ${f.payment_id}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            💬 تواصل مع البائع
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>

      <div className="bottom-nav">
        <div className="nav-item" onClick={() => window.location.href = '/'}>🏠<br />الرئيسية</div>
        <div className="nav-item" onClick={() => window.location.href = '/explore'}>🔍<br />استكشف</div>
        <div className="nav-item" onClick={() => window.location.href = '/my-orders'}>📦<br />طلباتي</div>
        <div className="nav-item active">🔔<br />إشعارات</div>
        <div className="nav-item" onClick={() => window.location.href = '/seller-dashboard'}>🏪<br />متجري</div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
