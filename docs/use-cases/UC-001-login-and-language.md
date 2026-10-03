# UC-001: Sign in, sign out, choose language

- **Status:** Review
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** — (no access control today)
- **Business rules:** BR-070

## Goal
Only partners can use the system, with their company Google accounts, in Finnish or English.

## Trigger
A partner opens the app.

## Preconditions
- The partner's Google account is in `AUTH_ALLOWED_DOMAIN` and registered as a partner (local seed).

## Main flow
1. Not signed in → sign-in page with **Sign in with Google** (browser language, FI or EN).
2. Partner signs in with Google.
3. Server verifies the Google token: domain = `AUTH_ALLOWED_DOMAIN` and email is a registered partner (BR-070).
4. Session starts; the year page (UC-022) opens in the partner's language.

## Alternative flows
- **A1 – Change language** from the menu; saved per partner.
- **A2 – Sign out**.
- **A3 – Session expires** after 30 days of inactivity.

## Error flows
- **E1 – Wrong domain** → "Use your Instaglamour Google account."
- **E2 – Not a partner** → "You don't have access."
- **E3 – Google sign-in fails/cancelled** → back to sign-in with a message.

## Postconditions
- Active session, or none after sign-out.

## Acceptance criteria
- [ ] AC-1: A registered partner in the allowed domain signs in and sees the year page in their language.
- [ ] AC-2: Other-domain accounts are denied; the check is server-side on the verified token.
- [ ] AC-3: Allowed-domain accounts that are not partners are denied.
- [ ] AC-4: Without a session every page shows sign-in and every API returns 401.
- [ ] AC-5: The domain comes from `AUTH_ALLOWED_DOMAIN`; nothing is hard-coded.
- [ ] AC-6: A dev-only login exists for local development and is off unless enabled in `.env`.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
