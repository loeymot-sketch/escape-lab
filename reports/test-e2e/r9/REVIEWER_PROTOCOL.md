# Reviewer Protocol — 12 defect categories

Every adversarial supervisor agent reads this BEFORE scoring artifacts. It is the
contract between the GStack team and the adversarial team — without it, defect
counts drift across reviewers.

## Artifact quartet (per visual state)

For every screenshot, the GStack spec emits 4 sibling files:

```
tests/e2e/__screenshots__/test-e2e-<wave>/<state>.png         ← visual (multimodal)
tests/e2e/__screenshots__/test-e2e-<wave>/<state>.dom.html    ← await page.content()
tests/e2e/__screenshots__/test-e2e-<wave>/<state>.console.json ← console + pageerror sink
tests/e2e/__screenshots__/test-e2e-<wave>/<state>.network.json ← responses status>=400 OR duration>2000ms
```

Adversarial agents must inspect **all four** before declaring a state clean.

## 12 defect categories

| # | Category | Detection rule | Severity |
|---|---|---|---|
| 1 | **i18n leak** | DOM contains visible text matching regex `^[a-z]+(\.[a-z_]+){1,4}$` (e.g. `label.add_to_cart`, `kiosk.confirmation.title`, `button.menu`). False positives: code blocks, monospace fonts on diagnostic pages. | **P1** |
| 2 | **Text truncation without tooltip** | element with `text-overflow: ellipsis` AND `scrollWidth > clientWidth + 2` AND no `title` attr / sibling tooltip. Visual: visible "..." or hyphenation cut. | **P2** (P1 if cuts a critical word like a button label) |
| 3 | **Element overlap (clickable)** | bounding-box intersection of two `role=button` / `<a>` / `[onclick]` elements where one is fully contained in the other or >50% overlapped | **P1** |
| 4 | **Color contrast WCAG AA** | foreground/background ratio < 4.5:1 (3:1 for ≥18px bold). Use axe-core if available. | **P2** |
| 5 | **Empty-state quality** | empty list/grid contains zero of: illustration `<img>`, copy ≥20 chars, primary CTA `<button>` / `<a>` | **P2** |
| 6 | **Silent error** | `network.json` contains 4xx/5xx response AND DOM has no `[role=alert]` / `.toast` / `.alert-*` visible | **P0** |
| 7 | **Loading state missing** | `network.json` request duration > 2000ms AND no `.spinner` / `.skeleton` / `[aria-busy=true]` rendered during that window | **P2** |
| 8 | **Aria/keyboard** | live region missing on dynamic-status containers (`role=status` or `aria-live`); missing `:focus-visible` on buttons; non-button click handlers; icon-only button without `aria-label` | **P2** (P1 if it blocks a primary task path for screen-reader users) |
| 9 | **Console error** | `console.json` contains entry with `level=error` whose stack does not include `vendor.js` / `pusher` / dev-only websockets noise | **P1** |
| 10 | **Unexpected 4xx/5xx** | `network.json` status ≥ 400 not in expected-allowlist (auth-redirect 401 on logout, 422 on validation form-state, 304 noop) | **P0** |
| 11 | **Numeric integrity** | observable mismatch: cart total ≠ Σ(line × qty); receipt total ≠ payment-modal total; tax line ≠ price-mode expectation; same fact differs across N surfaces | **P0** |
| 12 | **Visual hash drift** | unexpected pixel diff vs. last-known-good baseline; flag only > 5% pixel delta on a non-animated region | **P3** |

## Severity meaning

| Sev | Meaning | Loop blocking? |
|-----|---------|----------------|
| **P0** | Production-breaking (data wrong, silent failure, fiscal/security risk) | YES — must be 0 to declare green |
| **P1** | User-visible defect (i18n leak, console error, button overlap, missing aria on critical path) | YES — must be 0 to declare green |
| P2 | UX-quality issue (truncation, contrast, weak empty-state) | NO — list in report, do not loop |
| P3 | Cosmetic (pixel drift, minor antialias) | NO — info only |

## Allowlist (what NOT to flag)

| Source | Why allowlisted |
|---|---|
| `wss://` ERR_CONNECTION_REFUSED in dev | Pusher / WebSockets server not running locally is expected |
| `csp-report 204` | Browser CSP-report endpoint, normal in dev |
| `401` on `/api/auth/logout` | Logout redirect, not a silent error |
| `422` on form validation submission | Expected validation feedback |
| `304` on cache revalidation | Browser cache hit, not an error |
| `vendor.js` console errors | Third-party noise, not application code |

## Output schema (strict)

```json
{
  "wave": "B",
  "round": 1,
  "states_reviewed": 10,
  "findings": [
    {
      "id": "B-001",
      "state_artifact": "test-e2e-B/03-pos-after-pay.png",
      "category": "numeric_integrity",
      "severity": "P0",
      "evidence": "Receipt modal shows MONTANT TOTAL '2.00€' but tracker card data-testid=\"tracker-order-248\" displays '0,00 €'",
      "fix_hint": "PosOrdersTrackerComponent.vue line ~210 binding to wrong field; should be order.total_amount_price"
    }
  ],
  "summary": {
    "P0": 1, "P1": 2, "P2": 5, "P3": 0,
    "open_P0": 1, "open_P1": 2, "open_P2": 5, "open_P3": 0
  },
  "round_to_round_closures": {
    "B-001": "FAIL", "B-002": "PASS"
  },
  "verdict": "RED"
}
```

## Reviewer mindset

You are an adversarial QA. The owner asked you to find:
- Hidden problems (silent failures, indirect bugs)
- Visual problems (cut text, overlapping buttons, misaligned elements, palette drift)
- Data sync issues (KDS not updating, stock cascade missed)
- Anything that would embarrass the product in front of a paying customer

Be skeptical. A spec passing means the happy path renders — that's the floor, not
the ceiling. Hunt for what the test author missed. The GStack team has already
self-checked; your value is finding what they didn't think to check.
