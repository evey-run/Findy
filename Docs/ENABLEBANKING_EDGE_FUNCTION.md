# EnableBanking Edge Function for Vercel

## Overview

This document describes the EnableBanking redirect edge function deployed on Vercel. The edge function provides fast, secure redirects to Enable Banking OAuth URLs with built-in analytics logging.

## Files

- **`api/enablebanking-redirect.ts`** - Vercel serverless function for handling redirects
- **`vercel.json`** - Vercel deployment configuration

## How It Works

### 1. Request Flow

```
Client
  ↓
POST /api/enablebanking/link (Express server)
  ↓
Returns: { link, redirectLink }
  ↓
Client redirects to /api/enablebanking-redirect?bankId=...&redirectUrl=...
  ↓
Edge Function logs & redirects to Enable Banking OAuth URL
  ↓
Enable Banking OAuth Flow
  ↓
Callback to /api/enablebanking/callback (Express server)
```

### 2. Edge Function Endpoint

**URL:** `GET /api/enablebanking-redirect`

**Query Parameters:**
- `bankId` (required): Bank identifier
- `aspspName` (required): ASPSP name (e.g., "BNPFRPP")
- `aspspCountry` (required): ISO 3166-1 country code (e.g., "FR")
- `redirectUrl` (required): Enable Banking OAuth URL to redirect to

**Response:**
- HTTP 307 redirect to `redirectUrl`
- Sets security headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: no-referrer-when-downgrade`

**Example:**
```bash
GET /api/enablebanking-redirect?bankId=123&aspspName=BNPFRPP&aspspCountry=FR&redirectUrl=https://auth.enablebanking.com/...
```

## Deployment on Vercel

### Prerequisites

1. Vercel account with CLI installed
2. Enable Banking credentials (App ID and RSA Key)

### Environment Variables

Add these secrets to your Vercel project:

```bash
vercel env add ENABLE_BANKING_APP_ID
vercel env add ENABLE_BANKING_RSA_KEY
vercel env add DATABASE_URL
```

### Deploy

```bash
# From project root
vercel deploy

# Or for production
vercel deploy --prod
```

### Configuration

The `vercel.json` file configures:
- Build command: `npm run build && npm run build:server`
- Output directory: `dist`
- Serverless function runtime: Node.js 20.x
- Function memory: 128 MB
- Max duration: 10 seconds

## Analytics & Logging

### Console Logs

Every redirect is logged to Vercel's console with:
- Redirect ID: `{bankId}_{timestamp}`
- Bank ID
- ASPSP Name
- ASPSP Country
- ISO timestamp

Example log output:
```
[EnableBanking Redirect] ID: bank123_1688756400000 {
  bankId: 'bank123',
  aspspName: 'BNPFRPP',
  aspspCountry: 'FR',
  timestamp: '2023-07-07T14:00:00.000Z'
}
```

### View Logs

```bash
# Stream logs from Vercel
vercel logs

# Or in Vercel Dashboard
# Project → Deployments → Function Logs
```

## Local Development

### Testing Locally

The edge function uses standard Node.js APIs and can be tested locally:

```bash
# Start dev server
npm run dev:server

# In another terminal, test the edge function
curl "http://localhost:3000/api/enablebanking-redirect?bankId=test&aspspName=TEST&aspspCountry=FR&redirectUrl=https://example.com"
```

### Without Vercel Runtime

When running locally or outside Vercel:
- The function falls back to standard Express/Node.js routing
- Update routes to use the redirect link (see `/api/enablebanking/link` response)

## Security Considerations

1. **URL Validation**: All redirect URLs are validated as proper URLs
2. **HTTP Status 307**: Preserves the HTTP method during redirect
3. **Security Headers**: Prevents XSS, clickjacking, and content-type sniffing
4. **Query Parameter Validation**: All required parameters are checked
5. **Logging**: Redirects are logged for audit and analytics purposes

## Future Enhancements

1. **Database Logging**: Store redirects in Supabase/Prisma instead of in-memory cache
2. **Rate Limiting**: Add rate limiting per bankId to prevent abuse
3. **Redirect Stats API**: Create `/api/enablebanking-redirect/stats` endpoint
4. **Custom Domain**: Use a branded redirect URL for better security perception
5. **Webhook Integration**: Send analytics data to external service

## Troubleshooting

### Redirect Not Working

1. Check Vercel logs: `vercel logs`
2. Verify query parameters are URL-encoded
3. Ensure `redirectUrl` is a valid URL starting with `https://`

### Missing Environment Variables

```bash
vercel env list
vercel env add ENABLE_BANKING_APP_ID
```

### CORS Issues

The edge function returns a redirect (307), not CORS headers. If testing from browser:
- Enable Banking URLs should be on same origin or CORS-enabled
- This is not an issue for normal OAuth flow
