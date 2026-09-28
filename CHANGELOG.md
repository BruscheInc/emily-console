# Helpdesk — version history

Every upload to the emily-console repo is one version. The number shows in the app next to the "Helpdesk" name
(top-left) and in the Railway boot log ("📨 Helpdesk v3.0.0 on :8080"), so you can always tell which build is live.

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
