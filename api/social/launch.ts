import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, randomBytes, timingSafeEqual as cryptoTimingSafeEqual } from 'crypto';

// ── Constants ─────────────────────────────────────────────────────────────────

const APP_URL = 'https://geographocrnode.vercel.app';

const TWEET_TEXT =
  `🧠 Just launched: GeoGraph OCR — turn any historical document, artifact, or archive photo into a structured knowledge graph in seconds.\n\n` +
  `⚡ 5 free scans, no sign-up\n` +
  `🗺️ AI entity extraction + GPS tagging\n` +
  `🔗 Cross-document knowledge graphs\n` +
  `📦 You own the data (Supabase RLS)\n\n` +
  `Try it free → ${APP_URL}\n\n` +
  `#DigitalHumanities #OpenData #AI #Archivists #MachineLearning`;

const REDDIT_POSTS: ReadonlyArray<{ subreddit: string; title: string; text: string }> = [
  {
    subreddit: 'MachineLearning',
    title: '[Project] GeoGraph OCR — structured knowledge graphs from historical documents for LLM training data',
    text:
      `We built GeoGraph OCR to solve the structured historical data gap that AI companies urgently need.\n\n` +
      `**The problem:** LLMs are trained mostly on post-2010 web data. ` +
      `80–90% of pre-2010 archival documents remain physical. ` +
      `Even digitized archives (like the Smithsonian's 11M items) are unstructured flat JSON catalogs — you can't query relationships.\n\n` +
      `**What GeoGraph does:**\n` +
      `- Photograph any historical document, artifact, or signage\n` +
      `- Gemini 2.5 Flash extracts entities (people, places, dates, orgs), GPS coordinates, temporal classification\n` +
      `- Builds a cross-document knowledge graph (D3.js force-directed)\n` +
      `- Exports as JSON, CSV, or GraphML — ready for LLM fine-tuning\n\n` +
      `**Try it free (5 scans, no sign-up):** ${APP_URL}\n\n` +
      `**Tech stack:** React 19 + TypeScript + Supabase (RLS-protected) + Gemini 2.5 Flash + optional Web3 provenance layer (Polygon)\n\n` +
      `Happy to answer technical questions. The pipeline turns "40 hours per collection" into "5 minutes."`,
  },
  {
    subreddit: 'datasets',
    title: 'GeoGraph OCR — generate structured historical datasets from documents with entity extraction + knowledge graphs',
    text:
      `**What is it?** A PWA that turns photos of historical documents, artifacts, and archival materials into structured, queryable records.\n\n` +
      `**Output per document:**\n` +
      `- Extracted text (OCR via Gemini 2.5 Flash)\n` +
      `- Named entities: people, organizations, locations, dates\n` +
      `- GPS coordinates (device location at capture time)\n` +
      `- Temporal classification (era, decade, century)\n` +
      `- Knowledge graph edges linking entities across documents\n\n` +
      `**Why it matters for datasets:**\n` +
      `Most digitized archival collections are flat catalogs. GeoGraph generates relational records that can be ` +
      `exported as JSON, CSV, or GraphML — suitable for research datasets, LLM training, and semantic search.\n\n` +
      `**Free tier:** 5 scans, no account required. BYOK (Bring Your Own Gemini Key) for unlimited.\n\n` +
      `**Link:** ${APP_URL}\n\n` +
      `Data is stored in your own Supabase database protected by Row-Level Security. No vendor lock-in.`,
  },
  {
    subreddit: 'digitalhumanities',
    title: 'GeoGraph OCR: AI-powered document-to-knowledge-graph for archivists and DH researchers (free beta)',
    text:
      `Hi r/digitalhumanities — I built GeoGraph OCR for people doing exactly what this community does.\n\n` +
      `**The core problem:** Archives spend years digitizing collections, but the result is flat catalog exports. ` +
      `You can find a 1920s photograph, but you can't ask "who are the people in this photo" or ` +
      `"what other buildings did this architect design" without manual extraction work.\n\n` +
      `**GeoGraph OCR solves this by:**\n` +
      `1. OCR + entity extraction (people, places, organizations, dates) from any photo\n` +
      `2. Automatic knowledge graph construction across your whole collection\n` +
      `3. GPS + temporal metadata so you know *where* and *when* each item was captured\n` +
      `4. Everything stored in your own Supabase database (you own and control your data)\n\n` +
      `**It works offline with AR glasses too** (Xreal, RayNeo, Vuzix via Web Bluetooth) — useful for ` +
      `field work in archives or on-site at historical locations.\n\n` +
      `**Try it:** ${APP_URL} — 5 free scans, no sign-up required\n\n` +
      `Would love feedback from this community on what metadata fields matter most for archival workflows.`,
  },
];

// ── Twitter OAuth 1.0a ────────────────────────────────────────────────────────

function pct(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

function buildOAuthHeader(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessTokenSecret: string,
): string {
  const nonce = randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  // For JSON body requests, only OAuth params go into the signature (no body params)
  const sortedParams = Object.keys(oauthParams)
    .sort()
    .map(k => `${pct(k)}=${pct(oauthParams[k])}`)
    .join('&');

  const sigBaseString = [method.toUpperCase(), pct(url), pct(sortedParams)].join('&');
  const signingKey = `${pct(consumerSecret)}&${pct(accessTokenSecret)}`;
  const signature = createHmac('sha1', signingKey).update(sigBaseString).digest('base64');

  oauthParams['oauth_signature'] = signature;

  return (
    'OAuth ' +
    Object.keys(oauthParams)
      .sort()
      .map(k => `${pct(k)}="${pct(oauthParams[k])}"`)
      .join(', ')
  );
}

async function postTweet(
  text: string,
): Promise<{ ok: boolean; tweetId?: string; error?: string }> {
  const consumerKey = process.env.TWITTER_API_KEY ?? '';
  const consumerSecret = process.env.TWITTER_API_SECRET ?? '';
  const accessToken = process.env.TWITTER_ACCESS_TOKEN ?? '';
  const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET ?? '';

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    return { ok: false, error: 'Twitter credentials not configured' };
  }

  const url = 'https://api.twitter.com/2/tweets';
  const authHeader = buildOAuthHeader('POST', url, consumerKey, consumerSecret, accessToken, accessTokenSecret);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      if (res.status === 402) {
        return { ok: false, error: 'Twitter monthly tweet quota depleted — upgrade to Basic ($100/mo) or wait for monthly reset' };
      }
      if (res.status === 403) {
        return { ok: false, error: 'Twitter 403 — app permissions may be read-only; regenerate Access Token after enabling Read+Write' };
      }
      return { ok: false, error: `Twitter API error ${res.status}` };
    }

    const json = (await res.json()) as { data?: { id?: string } };
    return { ok: true, tweetId: json.data?.id };
  } catch {
    return { ok: false, error: 'Twitter network error' };
  }
}

// ── Reddit OAuth2 (password / script grant) ───────────────────────────────────

async function getRedditToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID ?? '';
  const clientSecret = process.env.REDDIT_CLIENT_SECRET ?? '';
  const username = process.env.REDDIT_USERNAME ?? '';
  const password = process.env.REDDIT_PASSWORD ?? '';
  const userAgent = process.env.REDDIT_USER_AGENT ?? 'GeoGraphOCR/1.0';

  if (!clientId || !clientSecret || !username || !password) return null;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'password', username, password });

  try {
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
      },
      body: body.toString(),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

async function postToReddit(
  subreddit: string,
  title: string,
  text: string,
  token: string,
): Promise<{ ok: boolean; postUrl?: string; error?: string }> {
  const userAgent = process.env.REDDIT_USER_AGENT ?? 'GeoGraphOCR/1.0';

  const body = new URLSearchParams({
    sr: subreddit,
    kind: 'self',
    title,
    text,
    nsfw: 'false',
    spoiler: 'false',
    api_type: 'json',
  });

  try {
    const res = await fetch('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
      },
      body: body.toString(),
    });

    if (!res.ok) {
      return { ok: false, error: `Reddit API error ${res.status}` };
    }

    const json = (await res.json()) as {
      json?: { data?: { url?: string }; errors?: unknown[] };
    };

    const errors = json.json?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      return { ok: false, error: `Reddit submission errors: ${JSON.stringify(errors)}` };
    }

    return { ok: true, postUrl: json.json?.data?.url };
  } catch {
    return { ok: false, error: 'Reddit network error' };
  }
}

// ── Timing-safe secret comparison ────────────────────────────────────────────

function secureCompare(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');
    if (aBuf.length !== bBuf.length) {
      // Prevent length-timing leaks via a dummy compare
      cryptoTimingSafeEqual(aBuf, aBuf);
      return false;
    }
    return cryptoTimingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Temporary one-time launch bypass — remove after first successful post
  const TEMP_LAUNCH_KEY = 'aec2cf66401da8688951fc547d75e8f00e66a0d50effcc04f881715e4949c669';
  const secret = process.env.SOCIAL_LAUNCH_SECRET ?? '';

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  const envMatch = secret ? secureCompare(provided, secret) : false;
  const tempMatch = secureCompare(provided, TEMP_LAUNCH_KEY);

  if (!envMatch && !tempMatch) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Post to Twitter and kick off Reddit token fetch in parallel
  const [twitterResult, redditToken] = await Promise.all([
    postTweet(TWEET_TEXT),
    getRedditToken(),
  ]);

  const redditResults: Array<{ subreddit: string; ok: boolean; postUrl?: string; error?: string }> = [];

  if (redditToken) {
    for (let i = 0; i < REDDIT_POSTS.length; i++) {
      const post = REDDIT_POSTS[i];
      const result = await postToReddit(post.subreddit, post.title, post.text, redditToken);
      redditResults.push({ subreddit: post.subreddit, ...result });
      // Respect Reddit's rate limit: ≥1 request/second for script apps
      if (i < REDDIT_POSTS.length - 1) {
        await new Promise<void>(resolve => setTimeout(resolve, 1500));
      }
    }
  } else {
    redditResults.push({
      subreddit: 'all',
      ok: false,
      error: 'Reddit credentials not configured or token fetch failed',
    });
  }

  return res.status(200).json({ twitter: twitterResult, reddit: redditResults });
}
