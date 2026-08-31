# FITR

Fitness commerce. Storefront, seller platform, and mobile app in one place.

## Structure

| Folder | What it is | Live at | Stack |
|--------|-----------|---------|-------|
| `web/` | Storefront and customer accounts | joinfitr.com | HTML, Vercel functions, Firebase, Stripe |
| `sellers/` | Seller dashboard and onboarding | sell.joinfitr.com | HTML, Vercel, Firebase, Stripe Connect |
| `mobile/` | iOS app | App Store | Expo, React Native, Firebase |

## Deploy

Web and sellers deploy from their own folder with the Vercel CLI.

```
cd web && vercel --prod
cd sellers && vercel --prod
```

Mobile builds through EAS.

```
cd mobile && eas build --platform ios
```

## Notes

Secrets live in Vercel environment variables and local `.env.local` files, never in the repo. The Firebase web API key in the client HTML is a public identifier, secured by Firestore rules.
