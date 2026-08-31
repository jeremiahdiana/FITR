// Brevo email helper — not a route, imported by save-order and webhook

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

async function sendBrevo(key, payload) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': key },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('Brevo send failed:', res.status, text);
  }
  return res.ok;
}

function itemsTableHtml(items) {
  return items.map(i =>
    `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">${escHtml(i.name)}${i.brand ? ' <span style="color:#888;font-size:12px;">by ${escHtml(i.brand)}</span>' : ''}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;">×${i.qty || 1}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">$${((i.price || 0) * (i.qty || 1)).toFixed(2)}</td>
    </tr>`
  ).join('');
}

// ── Order confirmation to buyer ──
export async function sendOrderConfirmation({ key, email, customerName, orderNumber, items, subtotal, fee, shipping, total }) {
  if (!key || !email) return;
  const name = customerName || email.split('@')[0];
  return sendBrevo(key, {
    sender: { name: 'FITR', email: 'no-reply@joinfitr.com' },
    to: [{ email, name }],
    subject: `Order confirmed — ${orderNumber}`,
    htmlContent: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:#111;padding:28px 32px;text-align:center;">
          <span style="color:#00C9A7;font-size:24px;font-weight:900;letter-spacing:-1px;">FITR</span>
        </div>
        <div style="padding:32px;">
          <h2 style="margin:0 0 8px;font-size:22px;color:#111;">Order Confirmed!</h2>
          <p style="color:#555;margin:0 0 24px;">Thanks ${escHtml(name)}, your order <strong>${escHtml(orderNumber)}</strong> is being processed.</p>
          <table style="width:100%;border-collapse:collapse;">
            ${itemsTableHtml(items)}
          </table>
          <table style="width:100%;margin-top:16px;border-top:2px solid #111;padding-top:12px;">
            <tr><td style="color:#555;padding:4px 0;">Subtotal</td><td style="text-align:right;color:#111;">$${Number(subtotal).toFixed(2)}</td></tr>
            <tr><td style="color:#555;padding:4px 0;">Taxes, services &amp; other fees</td><td style="text-align:right;color:#111;">$${Number(fee).toFixed(2)}</td></tr>
            <tr><td style="color:#555;padding:4px 0;">Shipping</td><td style="text-align:right;color:#111;">$${Number(shipping).toFixed(2)}</td></tr>
            <tr style="font-weight:800;font-size:16px;"><td style="padding-top:12px;">Total</td><td style="padding-top:12px;text-align:right;color:#00C9A7;">$${Number(total).toFixed(2)}</td></tr>
          </table>
          <div style="margin-top:28px;padding:16px;background:#f7f8fa;border-radius:8px;text-align:center;">
            <p style="margin:0;color:#555;font-size:13px;">Track your order at <a href="https://joinfitr.com/orders.html" style="color:#00C9A7;">joinfitr.com/orders</a></p>
          </div>
        </div>
        <div style="padding:16px 32px;background:#f7f8fa;text-align:center;">
          <p style="margin:0;font-size:11px;color:#aaa;">Questions? Email <a href="mailto:no-reply@joinfitr.com" style="color:#00C9A7;">no-reply@joinfitr.com</a></p>
        </div>
      </div>`,
  });
}

// ── New order alert to seller ──
export async function sendSellerNewOrderAlert({ key, sellerEmail, brandName, orderNumber, items, brandTotal }) {
  if (!key || !sellerEmail) return;
  return sendBrevo(key, {
    sender: { name: 'FITR', email: 'no-reply@joinfitr.com' },
    to: [{ email: sellerEmail, name: brandName || 'Seller' }],
    subject: `New order — ${orderNumber}`,
    htmlContent: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:#111;padding:28px 32px;text-align:center;">
          <span style="color:#00C9A7;font-size:24px;font-weight:900;letter-spacing:-1px;">FITR</span>
          <p style="color:#aaa;margin:8px 0 0;font-size:13px;">Seller Dashboard</p>
        </div>
        <div style="padding:32px;">
          <h2 style="margin:0 0 8px;font-size:22px;color:#111;">You have a new order!</h2>
          <p style="color:#555;margin:0 0 24px;">Order <strong>${escHtml(orderNumber)}</strong> from ${escHtml(brandName || 'your store')} needs to be fulfilled.</p>
          <table style="width:100%;border-collapse:collapse;">
            ${itemsTableHtml(items)}
          </table>
          <div style="margin-top:20px;padding:16px;background:#e8faf7;border-radius:8px;text-align:center;">
            <p style="margin:0;color:#00C9A7;font-weight:800;font-size:18px;">Your payout: $${Number(brandTotal * 0.88).toFixed(2)}</p>
            <p style="margin:4px 0 0;color:#555;font-size:12px;">88% of order total $${Number(brandTotal).toFixed(2)}</p>
          </div>
          <div style="margin-top:20px;text-align:center;">
            <a href="https://sell.joinfitr.com" style="display:inline-block;background:#00C9A7;color:#080f18;font-weight:800;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:15px;">View Order in Dashboard</a>
          </div>
        </div>
        <div style="padding:16px 32px;background:#f7f8fa;text-align:center;">
          <p style="margin:0;font-size:11px;color:#aaa;">FITR Seller Platform — <a href="https://sell.joinfitr.com" style="color:#00C9A7;">sell.joinfitr.com</a></p>
        </div>
      </div>`,
  });
}

// ── Refund notification to buyer ──
export async function sendRefundNotification({ key, email, customerName, orderNumber, refundAmount }) {
  if (!key || !email) return;
  const name = customerName || email.split('@')[0];
  return sendBrevo(key, {
    sender: { name: 'FITR', email: 'no-reply@joinfitr.com' },
    to: [{ email, name }],
    subject: `Refund processed — ${orderNumber}`,
    htmlContent: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:#111;padding:28px 32px;text-align:center;">
          <span style="color:#00C9A7;font-size:24px;font-weight:900;letter-spacing:-1px;">FITR</span>
        </div>
        <div style="padding:32px;">
          <h2 style="margin:0 0 8px;color:#111;">Your refund is on the way</h2>
          <p style="color:#555;">Hey ${escHtml(name)}, we've processed a refund for order <strong>${escHtml(orderNumber)}</strong>.</p>
          <div style="margin:24px 0;padding:16px;background:#e8faf7;border-radius:8px;text-align:center;">
            <p style="margin:0;color:#00C9A7;font-weight:800;font-size:22px;">$${Number(refundAmount || 0).toFixed(2)} refunded</p>
            <p style="margin:4px 0 0;color:#555;font-size:13px;">Allow 5–10 business days to appear on your statement.</p>
          </div>
          <p style="color:#555;font-size:13px;">Questions? Reply to this email or contact us at <a href="mailto:no-reply@joinfitr.com" style="color:#00C9A7;">no-reply@joinfitr.com</a>.</p>
        </div>
        <div style="padding:16px 32px;background:#f7f8fa;text-align:center;">
          <p style="margin:0;font-size:11px;color:#aaa;">FITR · <a href="https://joinfitr.com" style="color:#00C9A7;">joinfitr.com</a></p>
        </div>
      </div>`,
  });
}

// ── Shipping notification to buyer ──
export async function sendShippingNotification({ key, email, customerName, orderNumber, trackingNumber, carrier }) {
  if (!key || !email) return;
  const name = customerName || email.split('@')[0];
  const trackingLine = trackingNumber
    ? `<p style="color:#555;">Tracking: <strong>${escHtml(trackingNumber)}</strong>${carrier ? ' via ' + escHtml(carrier) : ''}</p>`
    : '';
  return sendBrevo(key, {
    sender: { name: 'FITR', email: 'no-reply@joinfitr.com' },
    to: [{ email, name }],
    subject: `Your order ${orderNumber} has shipped!`,
    htmlContent: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:#111;padding:28px 32px;text-align:center;">
          <span style="color:#00C9A7;font-size:24px;font-weight:900;letter-spacing:-1px;">FITR</span>
        </div>
        <div style="padding:32px;">
          <h2 style="margin:0 0 8px;font-size:22px;color:#111;">Your order is on the way!</h2>
          <p style="color:#555;">Hey ${escHtml(name)}, order <strong>${escHtml(orderNumber)}</strong> has been shipped.</p>
          ${trackingLine}
          <div style="margin-top:24px;text-align:center;">
            <a href="https://joinfitr.com/orders.html" style="display:inline-block;background:#00C9A7;color:#080f18;font-weight:800;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:15px;">Track My Order</a>
          </div>
        </div>
        <div style="padding:16px 32px;background:#f7f8fa;text-align:center;">
          <p style="margin:0;font-size:11px;color:#aaa;">Questions? <a href="mailto:no-reply@joinfitr.com" style="color:#00C9A7;">no-reply@joinfitr.com</a></p>
        </div>
      </div>`,
  });
}
