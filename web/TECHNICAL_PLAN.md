# FITR – Full Technical Build Plan
## "The Amazon of Fitness"

---

## What FITR Is (Business Model)

FITR is a **two-sided marketplace**:
- **Sellers** (brands/gyms) list products on FITR
- **Buyers** (athletes) purchase directly on FITR
- **FITR** takes a 10–15% platform fee on every transaction (like Amazon/Etsy)

Revenue = Volume of sales × Platform fee %

---

## Phase 1 — What's Built (Current)

✅ HTML/CSS/JS mockup (shop, checkout, about, contact)
✅ Cart + checkout flow (demo)
✅ FITR branding + domain: joinfitr.com
✅ Deployed to Bluehost

---

## Phase 2 — Real Product (Build This Next)

### Frontend (What Users See)
- **Framework:** Next.js (React) — fast, SEO-friendly, works great for marketplaces
- **Mobile App:** React Native — one codebase for iOS + Android
- **Styling:** Tailwind CSS

### Backend (The Engine)
- **Runtime:** Node.js with Express OR Next.js API routes
- **Database:** PostgreSQL via Supabase (free tier available)
  - Tables: users, products, orders, sellers, transactions
- **Auth:** Supabase Auth (email/password + Google login)
- **File Storage:** Supabase Storage (for product images)

### Payments (Most Important)
- **Stripe Connect** — built specifically for marketplaces
  - Customer pays FITR
  - Stripe automatically splits: 88% → seller, 12% → FITR
  - Handles refunds, disputes, payouts to sellers
  - Supports Apple Pay, Google Pay, cards

### Hosting
- **Web:** Vercel (free tier, auto-deploys from GitHub)
- **Database:** Supabase (free tier up to 500MB)
- **Domain:** joinfitr.com (already owned, point to Vercel)

---

## Database Schema (Key Tables)

```
users
  id, email, name, role (buyer/seller/admin), created_at

products
  id, seller_id, name, brand, price, category,
  description, images[], stock, status, created_at

orders
  id, buyer_id, status, total, fitr_fee, created_at

order_items
  id, order_id, product_id, qty, price_at_purchase

transactions
  id, order_id, stripe_payment_id, amount, fee_amount, status

sellers
  id, user_id, brand_name, payout_account_id, approved
```

---

## Feature Roadmap

### MVP (Launch)
- [ ] User signup/login
- [ ] Product listings (search, filter, categories)
- [ ] Cart + Stripe checkout
- [ ] Order confirmation emails
- [ ] Seller dashboard (list products, see sales)
- [ ] Admin dashboard (approve sellers, view revenue)

### V2 (Growth)
- [ ] Product reviews and ratings
- [ ] Creator/athlete referral program (unique links, earn %)
- [ ] Push notifications (mobile)
- [ ] Flash deal system (timed discounts)
- [ ] Seller analytics (views, conversion, revenue)

### V3 (Scale)
- [ ] Subscription plans for sellers (featured placement)
- [ ] FITR Premium for buyers (free shipping, early access)
- [ ] AI-powered product recommendations
- [ ] Native iOS + Android apps

---

## Estimated Costs (Monthly)

| Service | Cost |
|---|---|
| Vercel (hosting) | Free |
| Supabase (database) | Free → $25/mo at scale |
| Stripe (payments) | 2.9% + 30¢ per transaction |
| Domain (joinfitr.com) | ~$12/year |
| Email (Resend or SendGrid) | Free tier |
| **Total to start** | **~$0–25/mo** |

---

## How to Get Sellers on Platform

1. **Cold email brands** (use the email draft from earlier)
2. **Instagram DMs** to smaller fitness brands (easier yes)
3. **Offer 0% fee for first 3 months** to early sellers
4. **Start with 5 hand-picked brands** — quality > quantity at launch

---

## Next Immediate Steps

1. ✅ Deploy current HTML mockup to Bluehost → joinfitr.com
2. Sign up for [Stripe](https://stripe.com) account (free)
3. Sign up for [Supabase](https://supabase.com) (free)
4. Sign up for [Vercel](https://vercel.com) (free)
5. Start building the Next.js app using this plan
