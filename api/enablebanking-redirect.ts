import type { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';

interface RedirectPayload {
  bankId: string;
  aspspName: string;
  aspspCountry: string;
  redirectUrl: string;
  timestamp?: number;
}

// Simple in-memory cache for redirect tracking
// In production, this would be stored in a database
const redirectCache = new Map<string, RedirectPayload>();

/**
 * Vercel Serverless Function to handle EnableBanking redirect links
 * GET /api/enablebanking-redirect?bankId=xxx&aspspName=yyy&aspspCountry=zzz&redirectUrl=...
 *
 * This edge function:
 * 1. Validates redirect parameters
 * 2. Logs redirect events for analytics
 * 3. Performs a fast redirect to Enable Banking OAuth URL
 */
export default async function handler(
  req: IncomingMessage & { query: Record<string, string | string[]> },
  res: ServerResponse
): Promise<void> {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const { bankId, aspspName, aspspCountry, redirectUrl } = req.query;

  // Validate required parameters
  if (!bankId || !aspspName || !aspspCountry || !redirectUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({
        error: 'Missing required parameters',
        required: ['bankId', 'aspspName', 'aspspCountry', 'redirectUrl'],
      })
    );
  }

  // Ensure single values (handle array responses)
  const singleBankId = Array.isArray(bankId) ? bankId[0] : bankId;
  const singleAspspName = Array.isArray(aspspName) ? aspspName[0] : aspspName;
  const singleAspspCountry = Array.isArray(aspspCountry) ? aspspCountry[0] : aspspCountry;
  const singleRedirectUrl = Array.isArray(redirectUrl) ? redirectUrl[0] : redirectUrl;

  // Validate redirectUrl is a valid URL
  try {
    new URL(singleRedirectUrl);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Invalid redirectUrl' }));
  }

  // Log the redirect for analytics
  const redirectId = `${singleBankId}_${Date.now()}`;
  const redirectPayload: RedirectPayload = {
    bankId: singleBankId,
    aspspName: singleAspspName,
    aspspCountry: singleAspspCountry,
    redirectUrl: singleRedirectUrl,
    timestamp: Date.now(),
  };

  // Store in cache (in production, write to database/analytics service)
  redirectCache.set(redirectId, redirectPayload);

  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');

  // Log to console for debugging (visible in Vercel logs)
  console.log(`[EnableBanking Redirect] ID: ${redirectId}`, {
    bankId: singleBankId,
    aspspName: singleAspspName,
    aspspCountry: singleAspspCountry,
    timestamp: new Date().toISOString(),
  });

  // Perform redirect with proper HTTP status (307 preserves method)
  res.writeHead(307, {
    Location: singleRedirectUrl,
  });
  res.end();
}
