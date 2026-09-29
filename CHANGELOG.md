# Helpdesk — version history

Every upload to the emily-console repo is one version. The number shows in the app next to the "Helpdesk" name
(top-left) and in the Railway boot log ("📨 Helpdesk v3.0.0 on :8080"), so you can always tell which build is live.

## v3.9 — Sep 29, 2026
- **Tickets views now filter properly.** Every incoming email is classified on arrival — bulk-mail headers
  (List-Unsubscribe, Precedence: bulk), robot senders (noreply/notifications), social networks, vendors and
  platforms (PayPal, Apple, carriers, Shopify admin notices), marketing subjects — and tagged automated /
  newsletter / social / vendor, which keeps it out of LB/LBO Tickets and away from Emily. A reply from a personal
  mailbox is never filtered. The whole backlog is classified once on first boot; Settings has
  "Re-filter notifications & newsletters" to run it again.
- **Shopify contact-form messages** ("New customer message on …") now carry the real customer's name and
  email, so replies go to the customer instead of Shopify's mailer.
- Ticket header: "Not a customer" hides a ticket from the Tickets views; "This is a customer" brings a
  filtered one back (and Emily will handle it).

## v3.8 — Sep 29, 2026
- **New mark.** A speech bubble with a heart — the conversation, handled with care — in the sidebar, browser tab
  and home-screen icon.
- Stuck packages only considers orders placed on or after Sep 1, 2026 (STUCK_SINCE); anything older is never added.

## v3.7 — Sep 29, 2026
- **Stuck packages tab.** Scans both Shopify stores every 6 hours (and on "Check now") for shipped orders whose
  delivery status is still "Tracking added" — a tracking number exists but the carrier has never scanned it — for
  4+ days (STUCK_DAYS). Lists order, customer, tracking link, days since tracking was added, Shopify status, with
  Email customer (pre-written note, opens a ticket from the brand mailbox), Contacted, Resolved, Ignore. A package
  drops off automatically once Shopify sees it move or get delivered. Count shows in the sidebar.
- **Logo.** Helpdesk has its own mark (inbox tray with a letter dropping in) in the sidebar, the browser tab, and the
  home-screen icon; the tab title shows the pending-ticket count.

## v3.6 — Sep 28, 2026  (v3.5 skipped — its automated returns were dropped; returns stay with a person)
- **"This reply commits you to" list.** If a draft promises something Emily has no tool for — a manual return
  label, shipping a missing item — it's listed under the draft with Done / Won't do buttons, and marking it
  leaves a note on the ticket. Returns and return labels are always handled by a person this way.
- Customer profile: store credit is fetched separately so a missing scope can't blank the whole profile; Shopify
  errors now show on the card instead of a silent "no customer".
- Replies can carry attachments (groundwork; nothing uses it yet).
- Pickup-hours cleanup widened to catch any old pickup wording (windows, call ahead, by appointment).

## v3.4 — Sep 28, 2026
- **Local pickup rule updated.** Mon–Fri 8:30am–2:00pm, no call needed, 701 E Plano Pkwy Suite 103, Plano TX 75074 —
  look for the Larkspur logo door and ring the bell. The old "10–12 and 2–3 windows" line is removed from Emily's
  rules and playbook on first boot; the change is saved as a new policy version so it shows in Settings history.
- Rule changes can now ship with a version (policy patches) instead of being retyped in Settings.

## v3.3 — Sep 28, 2026
- **Emily's proposed actions show up in the app.** When Emily stages a discount code, store credit, replacement,
  address change, cancellation or refund alongside a draft, the draft card now lists it under "Emily also
  proposed", ticked by default. Approve & send applies the ticked actions first and then sends; each one also has
  Apply now / Dismiss. Applying from the app updates the matching Slack card so it can't be applied twice.
- **The discount code actually reaches the customer.** Emily now writes `{{DISCOUNT_CODE}}` in her draft; it is
  replaced with the real, freshly created code on approval. If a draft mentions a code without the placeholder,
  a "Your code is …" line is added before the sign-off. A reply that still contains the placeholder is refused
  until the discount is applied — so a customer can never receive a promise of a code that doesn't exist.
- Generated discount codes are unique even when several are created in the same second.

## v3.2 — Sep 28, 2026
- **No more twin tickets.** The same email used to open one ticket via the Gorgias import and another via the
  Gmail connection. Both paths now look for the conversation first (by the email's Message-ID, or the same
  sender + subject within three minutes) and attach to it. A one-time sweep on first boot merges the duplicates
  already stored — messages, notes, Emily drafts, actions and tags all end up on the older ticket — and Settings
  has a "Merge duplicate tickets" button to re-run it any time.

## v3.1 — Sep 28, 2026
- **Gmail rate limit fixed.** A first sync or re-scan no longer pulls thousands of messages in one burst: messages
  already stored are skipped, at most 120 new ones are fetched per poll (the rest follow on the next polls, shown
  as "catching up — N more"), and a Gmail quota error pauses that mailbox for two minutes instead of retrying
  the same burst every 45 seconds.
- **One Google client per mailbox.** `GOOGLE_OAUTH_CLIENTS` now carries both projects (brusche-helpdesk for
  larkspurbabyoutlet.com, skilled-acolyte for larkspurbaby.com) so each mailbox signs in through its own
  Workspace's project. Google sign-in errors now come back with a plain-English explanation of what to fix.

## v3 — Sep 28, 2026
- **Order tools in the app.** Every ticket's sidebar now has an Orders panel with the order's items, totals, address,
  tracking and ShipStation status, plus four actions: **Update address** (writes Shopify + ShipStation),
  **Cancel order** (Shopify + ShipStation, optional full refund and restock), **Refund** (everything, specific items,
  or a dollar amount — to the original payment), and **Replacement** (no-charge copy with free shipping, optional
  new address). Each action asks for confirmation, is logged as an internal note on the ticket and in Emily's
  action history, and posts a one-line record to Slack.
- **Customer profile, Gorgias-style.** Lifetime value, order count and store-credit balance across both stores,
  customer-since date, per-store purchase summary with tags and an "Open in Shopify" link, recent orders (click one
  to load it into the Orders panel), and the customer's past tickets.
- **Emily can propose cancellations and refunds** (`shopify_propose_cancel`, `shopify_propose_refund`) — staged for
  approval in Slack like her other actions. Her customer_history now includes lifetime value and recent orders.
- Version number in the sidebar and boot log; `/api/version`.

## v2.2 — Sep 28, 2026
- Emily only sweeps mail that arrived after she went live in the Helpdesk (no more re-posting the whole backlog on
  every deploy); out-of-stock cards no longer re-post on restart.

## v2.1 — Sep 28, 2026
- Quoted replies ("On … wrote:", "Original Message", ">" lines, Outlook headers) are hidden behind "Show quoted
  text" on every message; `(mailto:…)` leftovers removed. Emily reads only the new part of each message too.

## v2 — Sep 28, 2026
- Emily (Slack bot) and the console merged into one app: **Helpdesk** is the app, **Emily** is the agent.
- Gorgias-style inbox: views and mailboxes in the left sidebar with counts, ticket table (subject + preview, tags,
  customer, last message), 20 per page, Pending / Sent / Closed / Collabs / All.
- Emily drafts appear in the ticket with Approve / Edit / Redraft / Skip; approvals from Slack and the app share
  one path. Persisted staged actions, policy editor with history, activity log.

## v1 — earlier
- Console: Gorgias import, Gmail send/receive per mailbox, LB/LBO views, OOS view, reply/note/assign/spam.
