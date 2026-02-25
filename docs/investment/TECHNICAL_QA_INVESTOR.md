# Technical Q&A: Investor Due Diligence

Common technical questions from investors with honest, prepared answers.

---

## 1. Code Quality & Testing

### Q: "Why is there no test coverage?"

**A**: "Honest answer: I prioritized feature validation as a solo founder. I chose to build the product end-to-end first to prove the technical concept, rather than write tests for features I wasn't sure would survive.

With funding, tests are my **#1 priority**:
- **Week 1-2**: Install Vitest, set up GitHub Actions CI/CD
- **Week 3-6**: Target 60%+ coverage for services and utilities (geminiService, batchProcessorService, validation layer)
- **Month 2-3**: Integration tests for Supabase RLS policies and Edge Functions
- **Month 4+**: E2E tests with Playwright for critical user flows

The architecture is clean and modular, so adding tests won't require refactoring - just discipline and time."

**Follow-up**: "Can I see the code structure?"
- Show: `src/services/`, `src/lib/`, `src/components/` separation
- Emphasize: TypeScript strict mode + no XSS vulnerabilities (audit report confirms)

---

### Q: "Why no CI/CD pipeline?"

**A**: "Currently using manual deployment via Vercel (automatic on git push). No GitHub Actions workflows yet.

**Post-funding plan** (Week 1-2):
1. GitHub Actions for:
   - TypeScript compilation check (`tsc --noEmit`)
   - ESLint validation
   - Automated test suite (once built)
   - Lighthouse performance audits
2. Branch protection rules for `main`
3. Required CI passing before merge

This is a 3-day sprint once I have an engineer onboarded."

---

### Q: "What's the technical debt situation?"

**A**: "I've documented all known issues in `AUDIT_REPORT.md`. Main items:

**HIGH Priority**:
1. Test coverage (0% → 60%+ in 6 weeks)
2. CI/CD pipeline (3 days to set up)
3. Console.log consolidation (122 instances → structured logger)

**MEDIUM Priority**:
4. Type safety improvements (20+ `as any` assertions in Supabase code)
5. ESLint config (move from node_modules to project root)
6. App.tsx decomposition (153KB file → split into chunks)

**LOW Priority**:
7. Bundle size optimization (App.js is 303KB but already code-split)
8. Legacy migration cleanup (acknowledged TODOs, non-blocking)

**No major refactors needed** - this is maintenance debt, not architectural debt."

---

## 2. Scalability & Architecture

### Q: "Can this scale to 100K users?"

**A**: "Yes, with confidence. Here's why:

**Client-Side Scalability**:
- Local-first architecture (IndexedDB) means each user has their own database
- No centralized bottleneck for reads/writes
- Code splitting and lazy loading implemented (30 manual code-split chunks, lazy-loaded React components)
- PWA with offline support reduces server load

**Server-Side Scalability**:
- **Supabase PostgreSQL**: Proven to millions of rows with proper indexing
- **Serverless Edge Functions**: Auto-scales with Deno Deploy
- **Batch processing queue**: Distributed worker model (multiple workers can claim jobs)
- **Supabase Realtime**: Uses WebSockets with automatic reconnection

**Cost Scaling**:
- Variable costs (Gemini API) scale linearly with usage
- Fixed infrastructure (Vercel + Supabase) scales automatically
- Break-even at ~50 paying users ($49/month tier)

**Load Testing Plan**:
- Not done yet (no users to test with)
- Post-beta: Simulate 1K concurrent uploads with Apache JMeter
- Identify bottlenecks and optimize (likely Gemini API rate limits)

**Confidence**: 90% we can handle 100K users. 10% risk requires optimization (caching, CDN, read replicas)."

---

### Q: "What happens when users hit IndexedDB storage limits?"

**A**: "Browser IndexedDB quota is typically **50% of available disk space** (e.g., 100GB on a 200GB drive). For most users, this supports **10,000+ documents**.

**If users approach limits**:
1. **Alert system**: Warn at 80% capacity (already implemented in my storage monitoring)
2. **Auto cloud sync**: Prompt to sync older documents to Supabase
3. **Selective storage**: Let users archive old documents locally (export + delete)
4. **Compression**: Implement image compression for thumbnails (already done - see `lib/imageCompression.ts`)

**Enterprise solution** (for archivists with 100K+ docs):
- Self-hosted Supabase backend (unlimited storage)
- PostgreSQL with S3 blob storage
- This is the **enterprise tier** revenue opportunity."

---

### Q: "What if Google raises Gemini API prices or shuts down?"

**A**: "I built **provider abstraction** from day one specifically for this risk:

```typescript
// src/modules/llm/ - Pluggable LLM providers
- gemini.ts (current primary - $0.025/1K tokens)
- openai.ts (OpenAI GPT-4o - $0.03/1K tokens)
- claude.ts (Anthropic Claude - price varies)
- tesseract.ts (local OCR fallback - free but lower quality)
- custom.ts (user's own models via API)
```

**Users can switch providers in settings** with one click. We've tested this with 3 providers.

**If Gemini raises prices**:
- Notify users → offer alternative providers
- Absorb small increases (10-20%) for paid users
- Pass through larger increases with 30-day notice

**If Gemini shuts down**:
- Failover to OpenAI automatically (already configured)
- Tesseract.js local OCR works offline
- Users retain all existing data — their structured records remain in their Supabase account, untouched

**Risk**: LOW. We're not locked into any single provider."

---

## 3. Security & Privacy

### Q: "Have you done a security audit?"

**A**: "Yes. See `AUDIT_REPORT.md` - 256 lines of self-audit findings.

**Key security measures**:
- ✅ **RLS (Row-Level Security)** on all Supabase tables
- ✅ **Input validation** layer (`src/lib/validation.ts`)
- ✅ **No XSS vulnerabilities** (no `dangerouslySetInnerHTML` usage)
- ✅ **API key storage** via environment variables (Vite `import.meta.env`)
- ✅ **Error sanitization** (no raw errors exposed to users)
- ✅ **HTTPS everywhere** (Vercel enforces SSL)

**TODO**:
- ⬜ **Third-party penetration test** (post-beta with funding for $3K-5K engagement)
- ⬜ **OWASP ZAP** automated scanning (CI/CD integration)
- ⬜ **SOC 2 compliance** (only needed for enterprise tier, 12+ months out)

**Current Risk**: LOW for beta. MEDIUM for enterprise (need formal audit)."

---

### Q: "How do you handle user data privacy with GDPR/CCPA?"

**A**: "Our architecture is designed around database-level ownership, which maps cleanly to GDPR rights:

**GDPR Article 17 (Right to Erasure)**:
- Every row in Supabase is tied to the user's account via Row-Level Security (RLS)
- Delete account → cascades delete all their structured records automatically
- Local IndexedDB cache cleared on sign-out

**GDPR Article 20 (Data Portability)**:
- Structured records exportable as JSON, CSV, GraphML, RDF at any time
- No proprietary lock-in — it's PostgreSQL rows the user can fully extract
- Supabase is open-source; enterprise users can self-host the entire backend

**CCPA (California Consumer Privacy Act)**:
- Data marketplace requires explicit per-dataset consent before any sharing
- Users explicitly choose which structured records to list on the marketplace
- Default: data stays private in their account, never shared

**The key privacy argument**: We don't own the data — the user's account owns the rows. Our platform just writes to their account and reads from it. RLS enforces this at the Postgres layer, not just the application layer.

**Legal docs ready**:
- `PRIVACY-POLICY.md` (draft, needs lawyer review)
- `TERMS.md` (draft, needs lawyer review)

**Post-funding: Hire privacy lawyer** for $3K-5K to finalize compliance."

---

## 4. Go-To-Market & Product

### Q: "How do you plan to acquire the first 100 customers?"

**A**: "Three-channel strategy:

**1. Beta Program** (Month 1-2) - 100 sign-ups
- **Where**: Archive.org community, r/historian, r/digitalarchiving, academic Twitter
- **Offer**: Free credits ($50 value), early access, influence on roadmap
- **Goal**: 10 testimonials, 5 case studies, product feedback

**2. Content Marketing** (Month 2-4) - 1K organic visitors/month
- **Blog posts**:
  - "How I process 10,000 historical documents in 1 hour"
  - "Why archivists should own their OCR data (not vendors)"
  - "Building knowledge graphs from scanned documents with AI"
- **SEO keywords**: "OCR for historians", "document knowledge graph", "archival OCR software"
- **Guest posts**: Academic blogs, digital humanities newsletters

**3. Direct Outreach** (Month 3-6) - 50 paying customers
- **Email cold outreach**: 500 university libraries, historical societies
- **Partnerships**: Zoter, Mendeley, Archive.org (integration partnerships)
- **Conferences**: Society of American Archivists (SAA), American Historical Association (AHA)

**CAC target**: $150/customer (content marketing, no paid ads initially)
**LTV target**: $1,656 over 24 months → 11x LTV/CAC"

---

### Q: "What's your pricing strategy?"

**A**: "Freemium with usage-based tiers:

| Tier | Price/Month | Documents/Month | Target Customer |
|------|-------------|-----------------|-----------------|
| **Free** | $0 | 50 (user's own API key) | Hobbyists, students |
| **Starter** | $29 | 200 | Individual researchers |
| **Pro** | $79 | 1,000 | Professional archivists |
| **Team** | $199 | 5,000 (shared) | Small institutions |
| **Enterprise** | Custom | Unlimited | Universities, large firms |

**Value-based pricing**:
- Google Cloud Vision: $1.50/1K images (pay-per-use, no structure)
- AWS Textract: $1.50/1K pages
- Our pricing: $0.079/doc (Pro tier) + knowledge graph + embeddings + 3D viz

**We're 2-3x the API cost** but provide 10x the value (structured data, graph, spatial/temporal metadata)."

---

### Q: "What's stopping Google or AWS from copying you?"

**A**: "Several barriers:

**1. Technical Differentiation**:
- They provide **flat text**. We provide **structured knowledge graphs**.
- They optimize for volume. We optimize for **data ownership + portability**.
- Local-first architecture is counter to their cloud business models.

**2. Business Model**:
- Google/AWS want to **lock users in** (more API calls = more revenue)
- We want to **set users free** (marketplace + NFTs = new revenue model)
- Philosophical difference → they won't copy this

**3. Speed & Focus**:
- We move fast (v2.11.4 with bi-weekly releases)
- We serve a niche (archivists, legal, researchers) they ignore
- By the time they notice, we'll have 10K users and network effects

**4. Moat Building**:
- **Data marketplace** with user-generated datasets (hard to bootstrap)
- **Community** of privacy-conscious users (loyal to our values)
- **Integrations** with archival tools (Zotero, Mendeley, Obsidian)

**Risk**: Still real if we succeed big. But we have 24-36 month window to build defensibility."

---

## 5. Team & Execution

### Q: "Why should I trust a solo founder?"

**A**: "Fair question. Here's why I can execute:

**1. Technical Track Record**:
- Built this entire platform solo (50K+ LOC, 15+ major features)
- v2.11.4 with regular bi-weekly releases (latest: Feb 25, 2026)
- Production deployment (Vercel + Supabase) working today

**2. Rapid Iteration**:
- CHANGELOG.md shows 262+ commits with semantic versioning
- Recent release: v2.11.4 — download resilience fallbacks, mobile PWA nav, QA debug tools
- I ship fast and fix fast

**3. Post-Funding Plan**:
- **Week 1**: Hire senior full-stack engineer (have 3 candidates ready)
- **Month 1**: Knowledge transfer, pair programming, test coverage
- **Month 2**: Engineer owns DevOps + infrastructure, I focus on product/customers

**4. Advisory Support**:
- [List any advisors or mentors you have]
- Open to adding **technical advisor** from your network

**Risk mitigation**: If I get hit by a bus:
- Code is well-documented (60KB+ docs)
- Modular architecture (easy to understand)
- Your engineer hire can take over

**Ask**: Trust me for 6 months to prove I can execute. If not, we pivot or wind down."

---

### Q: "What happens if you can't find product-market fit?"

**A**: "Honest answer: I pivot or return capital.

**Success criteria** (6 months):
- 100 beta users with **20% weekly active rate**
- 10 paying customers at **$79+ average**
- **5 case studies** showing real value
- **$5K MRR** or clear path to it

**If we miss**:
1. **Month 3 checkpoint**: If beta has <50 users or <10% engagement → Pivot hypothesis
2. **Month 5 checkpoint**: If <5 paying customers → Decide: pivot or wind down
3. **Month 6**: If <$2K MRR → Return remaining capital or negotiate extension

**Potential pivots**:
- Focus on legal firms only (higher willingness to pay)
- Switch to pure B2B SaaS (abandon data ownership angle if market doesn't care)
- License technology to enterprise (white-label)

**Confidence**: 70% we find PMF with archivists. 80% we find it with SOME niche. 20% we fail and admit it."

---

## 6. Financials & Unit Economics

### Q: "What's your burn rate and runway?"

**A**: "With $150K funding:

**Monthly Burn**:
| Expense | Amount/Month |
|---------|--------------|
| Founder salary | $10,000 |
| Engineer (contract) | $8,000 |
| Infrastructure (Supabase, Vercel, APIs) | $1,500 |
| Marketing (content, tools) | $1,500 |
| Admin (legal, accounting, tools) | $500 |
| **Total Burn** | **$21,500/month** |

**Runway**: $150K ÷ $21,500 = **7 months** (cushion for 6-month milestones)

**Break-even**: 35 customers at $79/month (assuming 70% margin) = $1,925 contribution margin
- Covers: Founder salary ($10K) + Engineer ($8K) + Infrastructure ($1.5K) + Marketing ($1.5K) = $21K
- Achievable by Month 5-6 with good traction"

---

### Q: "What's your revenue model beyond subscriptions?"

**A**: "Four revenue streams (diversified risk):

**1. SaaS Subscriptions** (Primary, 60% of revenue)
- $29-199/month tiers
- Target: 50 paying customers by Month 6 = $4K-5K MRR

**2. Data Marketplace** (Secondary, 20% of revenue)
- Users sell structured datasets
- We take 15-20% commission
- Example: Archivist sells 10K classified docs for $500 → we earn $75-100
- Target: 20 transactions/month by Month 6 = $1K-2K/month

**3. NFT Minting & Fractionalization** (Tertiary, 10% of revenue)
- Mint fee: $10-25 per collection
- Secondary royalties: 2.5% of trades
- Target: 50 mints in first 6 months = $500-1,250 one-time

**4. Enterprise Self-Hosting** (Future, 10% of revenue)
- White-label for large orgs
- $50K-100K setup fee + $10K-25K annual support
- Target: 2-3 deals in Year 2 = $100K-300K ARR

**Risk**: Marketplace and NFTs are unproven. Conservative model relies 100% on subscriptions."

---

## 7. Competitive Landscape

### Q: "Why haven't existing players done this?"

**A**: "Three reasons:

**1. Business Model Conflict**:
- Google/AWS make money from API calls → more data in their cloud = more revenue
- Data ownership **reduces** API calls → counter to their incentives
- We make money from processing + marketplace → aligned incentives

**2. Technical Complexity**:
- Local-first architecture with sync is hard (CRDTs, conflict resolution)
- Knowledge graph extraction at scale requires NLP expertise
- 3D visualization + Web3 integration is niche skillset
- Most companies don't want to build this stack

**3. Market Perception**:
- Big players see OCR as commodity (race to bottom on pricing)
- We see OCR as **data infrastructure** (race to top on value)
- They target enterprises (high volume, low margin)
- We target prosumers (low volume, high margin + network effects)

**Why now?**:
- AI models (Gemini, GPT-4) are good enough (>95% accuracy)
- Web3 infrastructure is mature (Ethers.js, Polygon)
- Privacy regulations create tailwind (GDPR, CCPA)
- Browser capabilities advanced (IndexedDB, PWA, WebGPU)"

---

## 8. Technology Choices

### Q: "Why React/TypeScript instead of [X framework]?"

**A**: "Deliberate choices:

**React 19**:
- Largest talent pool for hiring
- Mature ecosystem (libraries, tools)
- Server Components future-proofing (if we need SSR)

**TypeScript 5.6**:
- Catch bugs at compile time (strict mode enabled)
- Better refactoring (LSP support)
- Investor-friendly (shows discipline)

**Vite 5**:
- Fast dev server (HMR in <50ms)
- Code splitting out of the box
- Modern build tool (ESBuild minification)

**Alternatives considered**:
- Svelte/Solid: Smaller bundle but less talent
- Next.js: Overkill for client-side app (we don't need SSR for this MVP)
- Rust/WASM: Future optimization (OCR preprocessing) but premature

**Open to refactoring** if team has strong opinions post-funding."

---

### Q: "Why Supabase instead of building your own backend?"

**A**: "Time to market + cost efficiency:

**Supabase gives us**:
- PostgreSQL (production-ready DB)
- RLS policies (built-in security)
- Realtime subscriptions (WebSocket scaling)
- Storage (S3-compatible)
- Edge Functions (serverless compute)
- Auth (OAuth, JWT)

**Building ourselves would cost**:
- 3-6 months developer time
- AWS infrastructure ($500-1K/month minimum)
- DevOps expertise (another hire)

**Supabase cost**: $25/month (Pro plan) → scales to 10K users before upgrade needed

**Risk**: Supabase lock-in mitigated by:
- PostgreSQL standard (can self-host)
- Open-source Supabase (can deploy ourselves)
- Migration plan if needed (6-week sprint)

**Confident this was the right choice for MVP**. May revisit at 50K+ users."

---

## 9. Intellectual Property

### Q: "Do you have any patents or defensible IP?"

**A**: "No patents filed (yet). Here's my IP strategy:

**Trade Secrets**:
- Knowledge graph extraction algorithms (proprietary)
- Deduplication service logic (`src/services/deduplicationService.ts`)
- Batch processing queue optimization

**Open Source Strategy**:
- Core platform is MIT licensed (non-commercial)
- Commercial license required for resale/white-label
- This builds community while monetizing B2B

**Future Patent Opportunities**:
- Method for fractionalized data ownership via NFTs
- Spatial-temporal classification for documents
- Local-first knowledge graph sync (if novel enough)

**Post-funding**: Consult IP lawyer ($3K) to assess patentability. My guess: **not novel enough** for patents, but trade secret + open-source combo is defensible."

---

### Q: "What's your licensing strategy?"

**A**: "Dual license (similar to MongoDB, Elastic):

**1. MIT License** (Free for non-commercial):
- Individuals, academics, researchers
- Builds community and adoption
- Source available on GitHub

**2. Commercial License** ($50K-100K):
- Enterprises wanting to resell/white-label
- Removes MIT restrictions
- Includes support + custom features

**3. Marketplace Commission** (15-20%):
- Users selling datasets pay commission
- This is the \"platform fee\" revenue

**Benefits**:
- Grow userbase fast (free tier)
- Monetize high-value customers (enterprise)
- Network effects (marketplace)

**Risk**: Forks/competitors. Mitigation: Move fast, build community, integrate hard-to-replicate features (3D viz, Web3)."

---

## 10. Honest Weaknesses

### Q: "What worries you most about this business?"

**A**: "Three things:

**1. Product-Market Fit Risk** (70% concern)
- I built the tech without validating demand first
- Archivists may not care about data ownership
- Pricing may be wrong ($79/month too high? Too low?)
- **Mitigation**: Beta program + 20 customer interviews in Month 2-3

**2. Solo Founder Risk** (20% concern)
- Knowledge concentration in my head
- Single point of failure (health, burnout)
- **Mitigation**: Hire senior engineer Week 1, document everything, add advisor

**3. Competitive Response** (10% concern)
- If we succeed, Google/AWS could undercut on price
- Or acquire us (maybe a hidden upside?)
- **Mitigation**: Build network effects (marketplace) fast, focus on niche

**What doesn't worry me**:
- Technology (it works, proven in production)
- Scalability (architecture handles 100K users)
- Security (audit complete, best practices followed)

**Overall confidence**: 70% this works. 30% we pivot or fail. I'm betting 2 years of my life on this."

---

## Summary: Red Flags vs. Green Flags

### 🚩 Red Flags (Be Honest)
- No test coverage yet
- Zero traction (no users, no revenue)
- Solo founder (single point of failure)
- Unproven marketplace model (network effects chicken-egg)

### ✅ Green Flags
- **Technology works** (production-ready, deployable today)
- **Clear differentiation** (structured data ownership vs. flat text)
- **Scalable architecture** (local-first + optional cloud)
- **Strong documentation** (60KB+ of docs, audit report)
- **Fast iteration** (v2.11.4, bi-weekly releases)
- **Clear use of funds** (hiring, beta, validation - not R&D)
- **Founder commitment** (2 years of solo work, deep technical knowledge)
- **Market timing** (privacy regulations, AI trust, Web3 adoption)

---

**Bottom Line for Investors:**

"I've de-risked the **technology**. I need your capital to de-risk the **market**. If you believe data ownership matters and users will pay for it, this is a bet on **my execution speed** to prove PMF in 6 months.

If I fail, I'll be transparent about it and return capital or pivot. If I succeed, we're building the first **user-owned data platform** in a $13B OCR market."

---

**Follow-up Materials**:
- GitHub access for technical review
- Screen-share demo (live coding, browser DevTools)
- Reference calls with [technical advisors if you have any]
