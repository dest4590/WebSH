# WebSH: Subscription Plans & Monetization Model

This document defines the tiered pricing structure for WebSH, focusing on feature differentiation, infrastructure allocation, and usage limits.

---

## 🟢 1. Starter Plan (Free)

**Focus:** Individual entry-level users and hobbyists.

- **Price:** $0 / month
- **Infrastructure:** Routed to standard nodes (e.g., Oracle Free Tier, ~30mbps).
- **Storage:** Local-only (IndexedDB). No cloud synchronization.
- **Concurrent Sessions:** Max 2 active SSH connections.
- **Snippets:** Local-only, limit of 5 saved command snippets.
- **Session Persistence:** 15-minute idle timeout.
- **Support:** Community-based / Documentation.

## 🔵 2. Pro Plan (Developer)

**Focus:** Power users, freelancers, and professional developers.

- **Price:** $5 / month (or $40 / year)
- **Infrastructure:** Priority access to Premium High-Speed Nodes (e.g., Kyiv Node, 300mbps, low latency).
- **Cloud Sync (E2EE):** Full cross-device synchronization of server lists, settings, and snippets using End-to-End Encryption.
- **Concurrent Sessions:** Unlimited active SSH connections.
- **Snippets:** Unlimited snippets with cloud sync.
- **Extended Persistence:** No aggressive idle timeouts; sessions stay active for up to 24 hours.
- **Early Access:** First to use new beta features (e.g., mobile-optimized terminal).

---

## 🎁 Special: Early Bird Lifetime

- **Price:** $25 (One-time payment)
- **Target:** First 100 supporters.
- **Benefit:** Permanent access to all "Pro" features for life.

---

## 📊 Feature Comparison Matrix

| Feature           | Starter (Free)    | Pro ($5/mo)       |
| :---------------- | :---------------- | :---------------- |
| **Price**         | $0                | $5 / mo           |
| **Network Speed** | Standard (30mbps) | Premium (300mbps) |
| **Sync (E2EE)**   | ❌ No             | ✅ Yes            |
| **Max Sessions**  | 2                 | Unlimited         |
| **Max Snippets**  | 5                 | Unlimited         |
| **Idle Timeout**  | 15 min            | 24 hours          |

---

## 🔑 Key Monetization Drivers (Paywalls)

1. **Convenience:** Cloud Sync is the primary reason to upgrade to Pro.
2. **Performance:** Low-latency nodes (Kyiv) serve as a major value for professional work.
3. **Productivity:** Unlimited snippets and sessions for heavy multitaskers.
