# SaaS roadmap (owner decision 2026-10-27)

The app is no longer an internal tool: it becomes a **worldwide SaaS for businesses that sell events**
(bands and performers, event tech/AV, event photo/video, event agencies, catering, venues).
Positioning: *"From inquiry to paid crew — for businesses that sell events."*
Instaglamour becomes the first customer organization.

## Owner decisions
| Topic | Decision |
|---|---|
| Core concept | **Event** replaces Gig (the sold, dated job). Offer stays the sales stage and converts into an Event. |
| Sign-in | **Email + password** (password reset, verification). Google sign-in may stay as an option later. |
| Order | **Phase 1: rename Gig → Event.** Phase 2: multi-company foundation. |
| Billing | Later — first invited pilot companies free; subscriptions when 3–5 pilots use it. |
| Hosting | Worldwide app; provider decided later (ask the owner before choosing). |

## Phases
1. **Rename Gig → Event** (contract "Rename Gig → Event"). Data kept; old seed/import files still load.
2. **Multi-company foundation:** Organization; every record belongs to one organization (tenant isolation on every query + tests); users with email + password, invitations, roles (owner/admin/member); per-organization settings that are hard-coded today (company name, logo, Spotify/playlist link, allowed sign-in rules, default fees, currency, time zone, language); public pages (offer, freelancer) branded per organization.
3. **Configurable vocabulary:** organization's own crew roles (not only musician roles), event types, terminology.
4. **SaaS operations:** signup for pilots, admin console, backups, monitoring, GDPR/privacy tooling, deployment.
5. **Billing:** subscriptions and trials.

## Data protection
BR-090 still applies: no real customer or business data in the repository. With multiple organizations, tenant isolation becomes a security requirement, tested for every endpoint.
