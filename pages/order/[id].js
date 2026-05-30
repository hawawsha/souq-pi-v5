import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const STATUS_MAP = {
  pending:   { label: 'قيد المعالجة', icon: '⏳', color: '#eab308', bg: 'rgba(234,179,8,0.1)',   border: '#eab308' },
  shipped:   { label: 'تم الشحن',     icon: '🚚', color: '#38bdf8', bg: 'rgba(56,189,248,0.1)', border: '#38bdf8' },
  delivered: { label: 'تم التسليم',   icon: '✅', color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: '#22c55e' },
  cancelled: { label: 'ملغي',         icon: '🚫', color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  border: '#ef4444' },
};

const STEPS = ['pending', 'shipped', 'delivered'];

export default function OrderTracking() {
  const router = useRouter();
  const { id }  = router.query;

  const [order,   setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/order-track?id=${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setOrder(d);
      })
      .catch(() => setError('خطأ في تحميل الطلب'))
      .finally(() => setLoading(false));
  }, [id]);

  const status   = order?.delivery_status || 'pending';
  const statusInfo = STATUS_MAP[status] || STATUS_MAP.pending;
  const stepIndex  = STEPS.indexOf(status);

  function openWhatsapp() {
    if (!order?.seller_whatsapp) return;
    const clean = order.seller_whatsapp.replace(/\D/g, '');
    const msg   = encodeURIComponent(
      `مرحباً، أريد الاستفسار عن طلبي "${order.product_name}" | رقم الدفع: ${order.payment_id}`
    );
    window.open(`https://wa.me/${clean}?text=${msg}`, '_blank');
  }

  return (
    <>
      <Head>
        <title>تتبع الطلب — Souq Pi</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0a0118;color:#fff;font-family:'Cairo',sans-serif;direction:rtl;min-height:100vh;padding-bottom:40px;}
        .header{background:rgba(26,11,46,0.95);padding:14px 20px;border-bottom:1px solid #d4af37;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:100;}
        .back-btn{background:rgba(255,255,255,0.08);border:none;color:#fff;padding:8px 14px;border-radius:10px;cursor:pointer;font-family:'Cairo',sans-serif;font-size:0.85em;}
        .container{max-width:480px;margin:0 auto;padding:20px 16px;}
        .status-card{border-radius:20px;padding:24px;text-align:center;margin-bottom:20px;}
        .status-icon{font-size:3em;margin-bottom:10px;}
        .status-label{font-size:1.3em;font-weight:900;}
        .stepper{display:flex;align-items:center;justify-content:center;margin:24px 0;gap:0;}
        .step{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;}
        .step-circle{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.9em;font-weight:900;border:2px solid;}
        .step-label{font-size:0.62em;color:#b0b0b0;text-align:center;max-width:55px;}
        .step-line{height:2px;flex:1;margin-top:-22px;}
        .detail-card{background:#1a0b2e;border:1px solid #331a5e;border-radius:16px;padding:18px;margin-bottom:14px;}
        .detail-row{display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);}
        .detail-row:last-child{border-bottom:none;}
        .detail-key{font-size:0.78em;color:#b0b0b0;flex-shrink:0;}
        .detail-val{font-size:0.82em;font-weight:700;text-align:left;direction:ltr;max-width:60%;word-break:break-all;}
        .btn-wa{width:100%;background:linear-gradient(135deg,#25d366,#128c7e);color:#fff;border:none;padding:14px;border-radius:14px;font-weight:900;cursor:pointer;font-family:'Cairo';font-size:1em;margin-bottom:10px;}
        .btn-orders{width:100%;background:rgba(106,13,173,0.3);border:1px solid #6a0dad;color:#fff;padding:12px;border-radius:14px;font-weight:700;cursor:pointer;font-family:'Cairo';font-size:0.9em;}
        .txid{font-size:0.65em;color:#6a0dad;direction:ltr;text-align:right;margin-top:4px;}
        .loading{text-align:center;padding:60px 20px;color:#b0b0b0;}
        .error-box{background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:16px;padding:24px;text-align:center;color:#fca5a5;}
      `}</style>

      <div className="header">
        <button className="back-btn" onClick={() => window.location.href = '/my-orders'}>← رجوع</button>
        <div style={{ fontWeight: 900 }}>تتبع الطلب</div>
      </div>

      <div className="container">
        {loading && (
          <div className="loading">
            <div style={{ fontSize: '2em', marginBottom: 12 }}>⏳</div>
            جاري تحميل الطلب...
          </div>
        )}

        {error && !loading && (
          <div className="error-box">
            <div style={{ fontSize: '2em', marginBottom: 12 }}>❌</div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>الطلب غير موجود</div>
            <div style={{ fontSize: '0.85em' }}>{error}</div>
            <button onClick={() => window.location.href = '/my-orders'} style={{ marginTop: 16, background: 'linear-gradient(135deg,#6a0dad,#d4af37)', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo' }}>
              طلباتي
            </button>
          </div>
        )}

        {order && !loading && (
          <>
            {/* Status Card */}
            <div className="status-card" style={{ background: statusInfo.bg, border: `2px solid ${statusInfo.border}` }}>
              <div className="status-icon">{statusInfo.icon}</div>
              <div className="status-label" style={{ color: statusInfo.color }}>{statusInfo.label}</div>
              <div style={{ fontSize: '0.8em', color: '#b0b0b0', marginTop: 6 }}>{order.product_name}</div>
              <div style={{ fontSize: '1.2em', fontWeight: 900, color: '#d4af37', marginTop: 8 }}>
                π {Number(order.amount_pi).toFixed(2)}
              </div>
            </div>

            {/* Stepper (only for non-cancelled) */}
            {status !== 'cancelled' && (
              <div className="stepper">
                {STEPS.map((s, i) => {
                  const done    = i <= stepIndex;
                  const current = i === stepIndex;
                  const info    = STATUS_MAP[s];
                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                      <div className="step" style={{ flex: 'none', width: 64 }}>
                        <div className="step-circle" style={{
                          background:   done ? info.color : 'transparent',
                          borderColor:  done ? info.color : '#331a5e',
                          color:        done ? '#fff' : '#331a5e',
                          boxShadow:    current ? `0 0 0 4px ${info.color}33` : 'none'
                        }}>
                          {done ? '✓' : (i + 1)}
                        </div>
                        <div className="step-label" style={{ color: done ? info.color : '#b0b0b0' }}>
                          {info.label}
                        </div>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className="step-line" style={{
                          background: i < stepIndex ? '#22c55e' : '#331a5e',
                          flex: 1, alignSelf: 'flex-start', marginTop: 16
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Order Details */}
            <div className="detail-card">
              <div style={{ fontWeight: 800, marginBottom: 12, color: '#d4af37' }}>تفاصيل الطلب</div>
              <div className="detail-row">
                <span className="detail-key">المنتج</span>
                <span className="detail-val" style={{ direction: 'rtl' }}>{order.product_name}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">المبلغ</span>
                <span className="detail-val" style={{ color: '#d4af37' }}>π {Number(order.amount_pi).toFixed(2)}</span>
              </div>
              {order.seller_username && (
                <div className="detail-row">
                  <span className="detail-key">البائع</span>
                  <span className="detail-val">@{order.seller_username}</span>
                </div>
              )}
              {order.created_at && (
                <div className="detail-row">
                  <span className="detail-key">تاريخ الطلب</span>
                  <span className="detail-val">{order.created_at.split('T')[0]}</span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-key">رقم الدفع</span>
                <span className="detail-val txid">{order.payment_id?.slice(0, 20)}…</span>
              </div>
              {order.txid && (
                <div className="detail-row">
                  <span className="detail-key">TX</span>
                  <span className="detail-val txid">{order.txid?.slice(0, 20)}…</span>
                </div>
              )}
            </div>

            {/* Actions */}
            {order.seller_whatsapp && (
              <button className="btn-wa" onClick={openWhatsapp}>
                💬 تواصل مع البائع عبر واتساب
              </button>
            )}
            <button className="btn-orders" onClick={() => window.location.href = '/my-orders'}>
              ← العودة لطلباتي
            </button>
          </>
        )}
      </div>
    </>
  );
}
