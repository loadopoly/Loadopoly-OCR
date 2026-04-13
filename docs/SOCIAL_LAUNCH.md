# GeoGraph OCR — Social Media Launch Guide

## Quick Start

**Deploy first, then post.** Confirm the Vercel preview URL renders the OG image before triggering the launch endpoint.

---

## Step 1 — Set up credentials

### Twitter / X  (OAuth 1.0a — no redirect URI needed)

> **IMPORTANT:** You need the **OAuth 1.0a** keys, NOT the OAuth 2.0 Client ID/Secret.
> The OAuth 2.0 credentials (Client ID starting with `Q2pmc...`) are for a different flow and won't work here.

1. Go to [developer.twitter.com](https://developer.twitter.com) and sign in with your GeoGraph account.
2. Create a new **Project** → **App** (Free tier is enough for read/write if posting from your own account).
3. Under **App Settings → User authentication settings**:
   - Enable **OAuth 1.0a**
   - App permissions: **Read and Write**
   - Type of app: **Web App, Automated App or Bot**
   - Callback / Redirect URI: `https://geographocrnode.vercel.app/` *(required by the form — not used in server-side posting)*
4. Go to **Keys and Tokens** tab (NOT the OAuth 2.0 section):
   - Copy **API Key** → `TWITTER_API_KEY` (starts with something like `xai...`)
   - Copy **API Key Secret** → `TWITTER_API_SECRET`
   - Under *Access Token and Secret*, click **Generate** (make sure it says "Read and Write") → copy both:
     - `TWITTER_ACCESS_TOKEN`
     - `TWITTER_ACCESS_TOKEN_SECRET`

### Reddit (OAuth2 "script" type — password grant)

> **IMPORTANT:** You MUST select **"script"** as the app type, NOT "installed app" or "web app".
> If you already created it as "installed app", delete it and recreate with "script" selected.
> The password grant flow only works with "script" type apps.

1. Go to [reddit.com/prefs/apps](https://reddit.com/prefs/apps) and click **Create another app…**
2. Fill in:
   - **Name:** `GeoGraphOCR`
   - **Type:** select **script** ← THIS IS CRITICAL
   - **Redirect URI:** `https://geographocrnode.vercel.app/auth/callback` *(required field, but the password grant never redirects to it)*
3. Click **Create app**. You'll see:
   - The 14-character ID under your app name → `REDDIT_CLIENT_ID`
   - The **secret** field → `REDDIT_CLIENT_SECRET`
4. Set remaining vars to your Reddit posting account:
   - `REDDIT_USERNAME` — your Reddit username (no `u/`)
   - `REDDIT_PASSWORD` — your Reddit account password
   - `REDDIT_USER_AGENT` — e.g. `GeoGraphOCR/1.0 by u/yourhandle`

> **Note:** Reddit "script" apps are for bots running as the developer's own account. Keep credentials secure and never commit them to git.

---

## Step 2 — Set Vercel environment variables

In the **Vercel Dashboard → Project → Settings → Environment Variables**, add all keys for **Production** and **Preview** environments:

| Variable | Where to get it |
|---|---|
| `SOCIAL_LAUNCH_SECRET` | Generate: `openssl rand -hex 32` |
| `TWITTER_API_KEY` | Twitter developer portal |
| `TWITTER_API_SECRET` | Twitter developer portal |
| `TWITTER_ACCESS_TOKEN` | Twitter developer portal |
| `TWITTER_ACCESS_TOKEN_SECRET` | Twitter developer portal |
| `REDDIT_CLIENT_ID` | reddit.com/prefs/apps |
| `REDDIT_CLIENT_SECRET` | reddit.com/prefs/apps |
| `REDDIT_USERNAME` | Your Reddit account username |
| `REDDIT_PASSWORD` | Your Reddit account password |
| `REDDIT_USER_AGENT` | e.g. `GeoGraphOCR/1.0 by u/yourhandle` |

---

## Step 3 — Validate the OG image

Before posting, confirm link preview metadata is correct:

- **Open Graph Debugger (opengraph.xyz):** https://www.opengraph.xyz/ — paste `https://geographocrnode.vercel.app/` and check the preview
- **Twitter Card Validator:** https://cards-dev.twitter.com/validator — paste the URL and verify the `summary_large_image` card renders

---

## Step 4 — Trigger the launch endpoint

```bash
curl -X POST https://geographocrnode.vercel.app/api/social/launch \
  -H "Authorization: Bearer YOUR_SOCIAL_LAUNCH_SECRET" \
  -H "Content-Type: application/json"
```

**Expected successful response:**
```json
{
  "twitter": { "ok": true, "tweetId": "1234567890123456789" },
  "reddit": [
    { "subreddit": "MachineLearning", "ok": true, "postUrl": "https://www.reddit.com/r/MachineLearning/comments/..." },
    { "subreddit": "datasets", "ok": true, "postUrl": "https://www.reddit.com/r/datasets/comments/..." },
    { "subreddit": "digitalhumanities", "ok": true, "postUrl": "https://www.reddit.com/r/digitalhumanities/comments/..." }
  ]
}
```

**If you get errors**, check the specific `error` field — it will say "credentials not configured" or give an API status code.

---

## Step 5 — Hacker News (manual submission only)

Hacker News has no public write API. Submit manually at: **https://news.ycombinator.com/submit**

### Show HN Title

```
Show HN: GeoGraph OCR – turn historical documents into knowledge graphs (free)
```

### Show HN Body

```
I built GeoGraph OCR to solve a problem I kept running into: archival collections spend decades
digitizing items, but the output is unstructured flat catalogs. The Smithsonian has 11M digitized
artifacts but you still can't ask "who built this building?" or "what else did they design?"

GeoGraph OCR turns any photo of a document, artifact, sign, or building into:
- Extracted text + named entities (people, places, dates, organizations)
- GPS coordinates and temporal classification (era/decade)
- A cross-document knowledge graph showing relationships across your whole collection
- Structured records in your own Supabase database (Row-Level Security, no vendor lock-in)

It works offline too with Bluetooth AR glasses (Xreal, RayNeo, Vuzix) for field scanning.

Free tier: 5 scans, no sign-up required. BYOK (Bring Your Own Gemini Key) for unlimited.

URL: https://geographocrnode.vercel.app

Happy to answer technical questions about the OCR pipeline or knowledge graph architecture.
```

**Tips for HN:**
- Post on a weekday between 9–11am US Eastern for best visibility
- Be responsive to comments in the first 2 hours
- Don't vote on your own post

---

## Tweet Copy (3-tweet thread)

### Tweet 1 — Hook

```
🧠 Archives spend decades digitizing collections.

The Smithsonian has 11M digitized artifacts. But you still can't ask "who built this building?" or "what else did they design?"

We built something to fix that. 🧵
```

### Tweet 2 — Product

```
GeoGraph OCR turns any document photo into:

✅ Extracted text + named entities
🗺️ GPS coordinates + temporal classification
🔗 Cross-document knowledge graph
📦 Your own database (Supabase RLS)

Powered by Gemini 2.5 Flash. 40 hours → 5 minutes.

Free beta → https://geographocrnode.vercel.app
No sign-up required.
```

### Tweet 3 — Audience + hashtags

```
Built for:
📚 Digital humanities researchers
🏛️ Archivists & librarians
🌳 Genealogists
🗺️ Local historians

Also: the structured output is LLM training-data ready.

Try free (5 scans, no account) → https://geographocrnode.vercel.app

#DigitalHumanities #AI #OpenData #Archivists #MachineLearning #LLM
```

---

## Reddit Post Copy

The posts are embedded directly in `api/social/launch.ts` and posted automatically by the endpoint. The subreddits and content are:

| Subreddit | Angle |
|---|---|
| `r/MachineLearning` | LLM training data, structured historical corpus, OCR→KG pipeline |
| `r/datasets` | Structured dataset generation, relational records from flat catalogs |
| `r/digitalhumanities` | Archival workflows, metadata fields, field scanning with AR glasses |

To customize post content before launch, edit the `REDDIT_POSTS` array in `api/social/launch.ts`.

---

## Troubleshooting

| Error | Fix |
|---|---|
| `Twitter API error 401` | Regenerate access token in developer portal; ensure app has Read+Write permissions |
| `Twitter API error 403` | App is read-only — update permissions in User Authentication Settings, regenerate tokens |
| `Reddit credentials not configured` | Verify all 5 Reddit env vars are set in Vercel Dashboard |
| `Reddit API error 403` | Your Reddit account may be too new or have low karma for the target subreddit |
| `Reddit submission errors: [["RATELIMIT"...]]` | Wait 10 minutes and retry — Reddit limits new posts per time window |
| OG image not showing in Twitter Card Validator | Ensure Vercel deployment is done and `/og-image.svg` returns HTTP 200 with `Content-Type: image/svg+xml` |
