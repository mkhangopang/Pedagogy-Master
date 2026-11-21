# Security Summary

**Reviewed Files**: 48
**Issues Resolved**: 11

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Unauthenticated Admin Controls | `app/api/ai-status/route.ts` | 15 | Provider status and grid-reset (`POST /api/ai-status`) did not verify an admin session, allowing anyone to inspect provider configuration or reset circuit breakers. | High | Fixed | Added Bearer token verification and admin role enforcement on both `GET` and `POST`, and updated `components/ProviderStatusBar.tsx` to include the admin session token. |
| System Prompt & Schema Exposure | `app/api/brain/get/route.ts` | 11 | Any signed-in teacher could read `master_prompt` and `blueprint_sql` from the privileged admin client. | Medium | Fixed | Restricted `GET /api/brain/get` to verified `app_admin` accounts and scoped `app/page.tsx` so standard educator accounts do not request it. |
| Webhook Plan Escalation & Signature Parsing | `app/api/webhooks/lemon-squeezy/route.ts` | 13 | Missing `LS_VARIANT_PRO` / `LS_VARIANT_ENTERPRISE` env variables mapped empty `variant_id` keys to `'enterprise'`, and missing `event_id` collided idempotency checks. | Critical | Fixed | Built variant mapping only from non-empty env values, enforced 64-character hex HMAC signatures, required non-empty `event_id`, and guarded `subscription_cancelled`/`subscription_expired` updates against empty emails. |
| Auth Redirect Hijack | `app/auth/callback/route.ts` | 14 | The `next` query parameter was passed directly to `new URL(next, origin)`, allowing protocol-relative `//evil.com` redirects that leak session tokens in the URL fragment. | High | Fixed | Added `sanitizeRedirectPath()` to allow only same-origin relative paths starting with a single `/` and stripped unsafe `next` parameters on fallback redirects. |
| HTML / Script Rendering in Curriculum Text | `lib/math-renderer.ts` | 75 | Raw HTML tags inside Markdown and `trust: true` in KaTeX allowed inline HTML attributes or `javascript:` links to render inside chat messages and SLO cards. | High | Fixed | Disabled `trust` in KaTeX (`trust: false`), configured the Markdown renderer to escape raw HTML tags cleanly, and restricted link/image targets to `http:`, `https:`, `mailto:`, `#`, or `/`. |
| Unsafe PDF Header Interpolation & Source URLs | `lib/export/artifact-exporter.ts`, `components/chat/MessageItem.tsx` | 621 | PDF export header metadata interpolated tool/document/user strings into `innerHTML`, and `MessageItem` rendered unvalidated `source.uri` links with `new URL()` that could throw on malformed URLs. | Medium | Fixed | HTML-escaped header strings before PDF rendering and validated `source.uri` strictly for `http:` / `https:` protocols without throwing. |
| Untrusted LaTeX Commands | `lib/markdown-renderer.ts` | 60 | KaTeX `trust: true` permitted untrusted links/attributes inside rendered equations. | Medium | Fixed | Set `trust: false` on both block and inline KaTeX calls while keeping full STEM equation fidelity. |
| Cron Auth & Broken Digest Query | `app/api/cron/digest/route.ts`, `app/api/cron/reap-stale-jobs/route.ts` | 10 | Empty/unset `CRON_SECRET` could weaken header comparison, `digest` passed a JS query builder instead of excluded values, and teacher/tip strings were interpolated unescaped into email HTML. | High | Fixed | Enforced fail-closed constant-time digest verification (`CRON_SECRET`), replaced the broken subquery with clean set-based SLO filtering, and HTML-escaped email template values. |
| Pagination Bounds Crash | `app/api/explore/route.ts` | 13 | Non-numeric or negative `?page=` parameters caused `NaN` or negative offsets in `.range()`, crashing the public explorer endpoint. | Medium | Fixed | Clamped `page` to `1..1000` with finite integer parsing and capped filter/search query lengths. |
| Document Status Ownership & Payload Size | `app/api/docs/status/[documentId]/route.ts` | 24 | Polling did not validate UUID format or explicit document ownership and returned megabytes of `extracted_text` on every 2-second poll. | Medium | Fixed | Added UUID validation, `getUser` + owner/public/admin checks, and returned `extracted_text` only when `?includeText=1` is requested by `DocumentReader`. |
| Predictable Share Identifiers | `app/api/share/create/route.ts` | 56 | Used `Math.random()` for public share IDs and lacked length caps on `title` / `content`. | Low | Fixed | Switched to Node `crypto.randomBytes()` for 12-character share tokens and bounded input sizes. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| API Keys & Environment Secrets | `lib/env-server.ts` | Server-only resolvers ensure AI provider keys are read strictly on the server and never bundled into client code. |
| Per-User Quota & Capacity Controls | `lib/rate-limit/free-tier-guard.ts`, `lib/translate/quota.ts`, `middleware.ts` | Enforces per-route request throttling at the edge alongside daily/monthly free-tier and shared-capacity quotas. |
| Password Recovery & Sign-Up | `app/api/auth/reset-password/route.ts`, `app/api/auth/signup/route.ts` | Sanitizes redirect origins, masks recovery delivery outcomes, and formats provider errors cleanly. |
| B2B Partner API Access | `lib/auth/api-guard.ts` | Hashes partner `X-API-Key` credentials with SHA-256 and verifies enterprise/admin entitlements before serving `/api/v1/*`. |

---

## PoC Verification

### Unauthenticated AI Grid Control (`/api/ai-status`)

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Sign-In and Role Check |
| Impact | High |
| Affected File | `app/api/ai-status/route.ts:38` |
| Test Scenario | `POST /api/ai-status` with body `{"action":"reset"}` and no `Authorization` header (and with a teacher-role JWT). |

#### How It Was Fixed
Added `verifyAdminRequest()` requiring a valid Supabase Bearer token and confirming `checkAdmin()` before executing `GET` status inspection or `POST` circuit-breaker resets.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Unauthenticated `POST` arrives at `POST /api/ai-status` | Enters `verifyAdminRequest(req)` |
| 2 | `authHeader` is empty or missing (`app/api/ai-status/route.ts:18-21`) | Returns HTTP `401 Unauthorized` immediately |
| 3 | Teacher JWT resolves `user`, `checkAdmin()` evaluates false (`app/api/ai-status/route.ts:29-31`) | Returns HTTP `403 Admin access required` |

#### Conclusion
**Fix Verified** - Neither anonymous callers nor standard teacher accounts can read internal provider state or reset AI grid circuit breakers.

---

### Empty Env Variant Privilege Escalation (`/api/webhooks/lemon-squeezy`)

#### Summary
| Field | Value |
|---|---|
| Issue Type | Flawed Entitlement Mapping |
| Impact | Critical |
| Affected File | `app/api/webhooks/lemon-squeezy/route.ts:13` |
| Test Scenario | Signed `subscription_created` webhook with `attributes.variant_id: ""` when `LS_VARIANT_PRO` and `LS_VARIANT_ENTERPRISE` are unset. |

#### How It Was Fixed
Constructed `getVariantToPlanMap()` dynamically only from trimmed non-empty variant ID environment variables and ignored empty `variant_id` payloads.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Signed webhook JSON with `variant_id: ""` enters `POST` | Passes signature verification and event ID check |
| 2 | `getVariantToPlanMap()` returns `{}` because env vars are unset (`route.ts:13-20`) | `planName` stays `undefined` |
| 3 | `if (planConfig && userEmail)` evaluates false (`route.ts:89`) | Database profile is not upgraded |

#### Conclusion
**Fix Verified** - Unconfigured or blank variant IDs can never grant paid plan entitlements.

---

### Protocol-Relative Open Redirect in OAuth Callback (`/auth/callback`)

#### Summary
| Field | Value |
|---|---|
| Issue Type | Unvalidated Redirect Destination |
| Impact | High |
| Affected File | `app/auth/callback/route.ts:9` |
| Test Scenario | `GET /auth/callback?next=//evil.example.com/phish` |

#### How It Was Fixed
Implemented `sanitizeRedirectPath()` rejecting protocol-relative prefixes (`//`, `/\\`) and verifying the resolved origin remains local before constructing the redirect URL and stripping unsafe `next` parameters in fallbacks.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `GET` receives `next=//evil.example.com/phish` | Passed into `sanitizeRedirectPath()` |
| 2 | `trimmed.startsWith('//')` triggers (`app/auth/callback/route.ts:12`) | Resets destination to `'/'` and strips unsafe `next` param |
| 3 | Redirect builds URL against request `origin` (`route.ts:47`, `route.ts:105`) | Redirect stays on `pedagogy-master.vercel.app/` |

#### Conclusion
**Fix Verified** - External domains in `next` are stripped so tokens in redirect URLs remain strictly on the app's own origin.

---

### Raw HTML & Script Injection in Rendered Curriculum Text (`lib/math-renderer.ts`)

#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsanitized HTML Rendering |
| Impact | High |
| Affected File | `lib/math-renderer.ts:83` |
| Test Scenario | `renderSTEM('<img src=x onerror=alert(1)> <script>alert(1)</script> [bad](javascript:alert(1)) **Bold** $\\frac{1}{2}$')` |

#### How It Was Fixed
Configured the Markdown renderer to HTML-escape untrusted raw HTML blocks, disabled KaTeX `trust`, and filtered out unsafe `javascript:` link targets while preserving valid Markdown formatting and LaTeX rendering.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Payload enters `renderSTEM()` | Math tokens parsed with KaTeX (`trust: false`) |
| 2 | `marked` renderer handles `<img ...>` / `<script>` via `html()` (`math-renderer.ts:110-116`) | Escaped as `&lt;img ...&gt;` / `&lt;script&gt;` |
| 3 | `[bad](javascript:alert(1))` hits `link()` (`math-renderer.ts:117-124`) | `isSafeLinkHref` returns false; rendered as plain escaped text `bad` |

#### Conclusion
**Fix Verified** - Embedded script tags, inline event handlers, and `javascript:` links are neutralized while STEM equations and bold Markdown still render accurately.
