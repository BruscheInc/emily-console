# Helpdesk — version history

Every upload to the emily-console repo is one version. The number shows in the app next to the "Helpdesk" name
(top-left) and in the Railway boot log ("📨 Helpdesk v3.0.0 on :8080"), so you can always tell which build is live.

## 4.23.1
- Returns: return numbers now use the original order number plus a count — LB191494-R1, then LB191494-R2 if the same order is returned again. Replaces the running LB-R1001 style numbers.

## 4.23.0
- Returns: branded portal addresses — returns.larkspurbaby.com and returns.larkspurbabyoutlet.com open that store's portal directly and show nothing else from the Helpdesk. New Settings switch "Use branded links" makes Emily and the Helpdesk use them once DNS is live.

## 4.22.10
- Returns: customers now pick from six reasons only (wrong item, damaged, bad experience, didn't fit, found something else, didn't like it). The list is editable in Returns → Settings. Each maps to Shopify's closest standard reason, and the exact wording is saved as the return's reason note.

## v4.22.9 — Oct 7, 2026
- Each return's history now says whether it was linked to the original ShipStation order (and which), or why not
  (no tracking number on the order, no ShipStation label with that tracking number, lookup error). Same detail in the log.

## v4.22.8 — Oct 7, 2026
- **Return labels are tied to the original ShipStation order.** Helpdesk finds the order's original shipping
  label by its tracking number, links the return label to it, and uses that shipment's store and order number —
  the same way ShipStation's own returns are linked. This replaces matching the store by name, which ShipStation
  didn't connect to the order ("store not active"). If the original label can't be found, it falls back as before.

## v4.22.7 — Oct 7, 2026
- **Test mode no longer buys anything.** It gets ShipStation's price quote for the label, shows a clearly marked
  sample label, and doesn't email the customer. (Buying then voiding didn't work: ShipStation refused the void.)
- When ShipStation refuses to void a label (Cancel return), the return's history now says why.

## v4.22.6 — Oct 7, 2026
- Fixed: ShipStation rejected the item price format, so v4.22.5 labels fell back to "plain" (no store, no tag).
  Prices are now sent the way ShipStation expects, and if the item list is ever rejected only that part is
  dropped — the store, order number and tag stay.

## v4.22.5 — Oct 7, 2026
- **Return labels are filed properly in ShipStation → Returns:** under the brand's store (LB / LBO in the left
  list), with the Shopify order number in the Order # column (instead of "SEAuto-…"), the customer's email, the
  items being returned (name, size, SKU, price), a "Return" tag, and an internal note with the RMA and reasons.
  The store is matched by name automatically; it can be picked by hand in Returns → Settings.
- If ShipStation ever rejects those filing details, the label is retried with just the essentials, so a return is
  never lost over them.

## v4.22.4 — Oct 7, 2026
- **Test mode works with return labels.** ShipStation doesn't offer test *return* labels ("Test return labels are
  not supported"), so test mode now buys a real label and voids it straight away — no charge, and the PDF still
  opens so the whole flow can be checked. Test returns are skipped by the tracking check, so they are never
  refunded automatically.
- When a label can't be created, the real reason now goes to the Activity log and the CS Slack channel (customers
  still see the friendly message).

## v4.22.3 — Oct 7, 2026
- **Moving around the returns portal:** a Back button on every step after the first, a Start over button, a
  "Start another return" button on the last page, and "← Back to Larkspur Baby / Outlet" under the card.
  The phone's back gesture and the browser Back button now go back one step instead of leaving the page;
  going back after a finished return starts a fresh one (no double returns).
- **Clicking the logo starts over** instead of jumping to the store home page. Changeable in Portal Studio →
  Logo & brand → "Clicking the logo" (starts over / goes to the shop / does nothing). All the new button
  wording is editable under Wording → Navigation.

## v4.22.2 — Oct 7, 2026
- The return label "from" address fills in by itself from where the order shipped. Local-pickup orders (no shipping
  address) use the billing address, then the customer's saved address. Customers can still edit it.

## v4.22.1 — Oct 7, 2026
- The returns portal no longer shows raw Shopify errors to customers. They see a plain "we can't look up orders
  right now — email us" message; the exact cause goes to the Helpdesk log.
- Staff screens name every Shopify permission returns need when one is missing, and the boot log now checks them:
  read_returns, write_returns, read_merchant_managed_fulfillment_orders, read_assigned_fulfillment_orders,
  read_third_party_fulfillment_orders, read_store_credit_account_transactions, read_inventory (plus the order,
  customer, product and store-credit scopes Emily already has).

## v4.22 — Oct 7, 2026
- **Portal Studio** (Returns → 🎨 Customize portal, or `/returns-studio`). Edit how each returns portal looks, with a
  live preview on desktop, tablet and phone, for every page (find order, items, refund, label):
  - Logo (upload, size for desktop and phone, inside the card / above it / in a top bar), tab icon.
  - Background: color, gradient or photo, a separate phone photo, focus point, fit, tint, blur.
  - Layout: centered, left, right or split screen; card width, padding, corners, shadow, border, see-through glass,
    full-screen card on phones, progress steps.
  - Colors for everything, with a readability check on each pair. 39 fonts, weights, sizes for desktop and phone,
    letter spacing, capitals. Button and field styles. Product photo size, prices, variants.
  - Top bar, announcement bar, footer text and links, every line of wording (with {store}, {order}, {days}…),
    browser tab title and search settings, custom CSS.
  - Quick styles, click-anything-in-the-preview to edit it, undo/redo, image library, autosaved drafts,
    publish with a change list, version history with preview and restore, re-import from Loop, copy from the
    other store, export/import.
- Both portals start with the look Loop had: same logo, favicon, background photo (LB), colors, Roboto font and the
  lookup-page text.
- Only admins can change the look; agents can view the studio.

## v4.21 — Oct 7, 2026
- **Returns, built in (replaces Loop).** Customers start a return at `/returns/lb` or `/returns/lbo`: order number +
  email, pick items and a reason, choose a refund to their card or store credit with a 15% bonus, and get a prepaid
  ShipStation label on the spot. Shopify emails them the label too. The flat label fee comes off the refund.
- **Refunds go out by themselves.** Tracking is checked every hour. When the package is delivered back to us, the
  refund (or store credit + bonus) is issued through Shopify's return, so it shows on the order. Labels never used are
  voided after 28 days.
- **Returns view** in the sidebar: every return from both stores, filters, history, Refund now / Cancel return,
  label spend and fees kept, CSV export. **Settings** (admins) holds the window, fee, bonus, carrier, return address,
  test-label switch and the go-live switch.
- **↩️ Start return** on a ticket's order panel. Creates the return and label; the label PDF is attached to your next
  reply. Emily can propose the same thing (return_propose) for approval when a customer can't use the portal.
- Emily keeps sending Loop links until you turn **Portal is live** on in Returns → Settings.
- Uses the existing SHIPSTATION_V2_KEY and the Emily Shopify apps. The apps need the **read_returns** and
  **write_returns** scopes (the boot log lists them if missing).

## v4.20 — Oct 7, 2026
- Order edits no longer fail when Emily's reason is long: the discount label Shopify stores is capped at its
  255-character limit (the full reason still goes in the order's staff note).

## v4.19 — Oct 7, 2026
- **"Try again" on a failed action.** When one of Emily's proposed actions failed (a missing Shopify permission,
  say), you can re-run it from the ticket once the cause is fixed, instead of asking her to redraft.

## v4.18 — Oct 7, 2026
- A missing Shopify permission now reads as a plain sentence ("the Emily Shopify app doesn't have the
  write_order_edits permission yet — add it in Shopify admin → … → Admin API scopes") instead of a JSON dump,
  and the boot log lists every scope each store's app is missing and what it's for.

## v4.17 — Oct 6, 2026
- **+ New ticket.** Start an email conversation with a customer from Helpdesk. Pick the store (Larkspur Baby or
  Larkspur Baby Outlet) — that's the mailbox it's sent from, so the customer sees the right brand and their reply
  lands back on this ticket. Optional customer name and order number.
- **Draft with Emily.** Type what you want to say in your own words; Emily looks up the order and customer, writes
  the professional email in the brand's voice (subject + message), and you review, edit and send. Everything is
  logged in the Activity log (ticket-created, emily-compose).
- **Replacement orders always carry a first and last name** on the shipping address (from the original order's
  address, or the customer's name), so ShipStation no longer errors on them. If no name can be found, Emily
  refuses to create the replacement and says why.

## v4.16 — Oct 5, 2026
- **Order numbers link to Shopify.** In the ticket list, the Orders panel header, and the customer profile's order
  history, the order number opens that order in the Shopify admin in a new tab (↗). The list link appears once the
  background status check has seen the order.

## v4.15 — Oct 5, 2026
- **Emily's suggestion box is a fixed size.** The header and the Approve / Edit / Redraft / Skip buttons stay put;
  only the draft text (with proposed actions and to-dos) scrolls inside the box.
- The red "needs your call" reason wraps onto multiple lines instead of running off the edge.

## v4.14 — Oct 5, 2026
- **Bigger reply box** (about 2.5× taller, and you can drag it taller still).
- **Emily's suggestion is now a tab at the bottom** next to "Reply to customer" and "Internal note", instead of a
  large card on top of the conversation. The tab shows a blue dot when a draft is waiting and opens on it
  automatically; Approve & send / Edit first / Redraft / Skip work exactly as before.

## v4.13 — Oct 5, 2026
- **Updates itself.** Each page knows which build it is; a minute after a new version deploys, open tabs reload on their own
  (if you're mid-reply, a small "v4.13 is ready — click to reload" banner shows instead). The page and the service worker are
  no longer cacheable, so a stale tab can't keep showing an old version.

## v4.12 — Oct 5, 2026
- **Order and Order status columns** in every ticket list, like Shopify's order page: the order the conversation is
  about (#LBO11008) and its payment + fulfillment pills (Paid · Unfulfilled / Fulfilled / Refunded / Cancelled,
  plus "edited" and the ShipStation hold state). Statuses come from a background cache refreshed every few
  hours; search finds tickets by order number; opening a ticket loads its order in the side panel.
- **Reopen puts a ticket back in Pending** until someone replies again.
- **Close returns you to the list** you came from instead of staying on the closed conversation.
- Sidebar shows the exact running version (v4.12), not just the major number.

## v4.11 — Oct 5, 2026
- **Out-of-stock pre-send check.** Before the email (or the 48-hour follow-up) goes out, the order is checked in
  Shopify: if the out-of-stock items were already removed/swapped, the amount refunded, or the order cancelled,
  nothing is sent and the case is marked "already handled" (Slack gets a one-line note). If the order changed but
  not every item is resolved, the email is held as "needs review" instead of sent.
- **Replacements are order edits.** New Emily action `shopify_propose_order_edit`: remove the out-of-stock line and
  add the chosen item on the customer's existing order; the added item is discounted so nothing extra is charged,
  and if it's cheaper the difference is refunded automatically. The old "create a replacement order" is now a
  last resort for shipped, lost/damaged packages only; Emily's rules say so.
- **Activity log.** Every action — replies, notes, status changes, Emily's drafts/sends/skips, proposed actions
  staged/applied/dismissed (from the app or Slack), order edits/refunds/cancellations/credits, shipment actions,
  out-of-stock emails and follow-ups, sign-ins, user and policy changes, scheduled scans — is recorded with the
  time and who did it. Sidebar → Records → Activity log (filter by person, type, or search); each ticket also
  shows its own History in the sidebar.
- **Out of stock view** shows each ticket's order status (open/on hold, shipped, edited, refunded, cancelled) and
  the case state (waiting on customer, followed up, bounced, already handled…).

## v4.10 — Oct 5, 2026
- **Bounces are handled.** A delivery-failure email is recognised (mailer-daemon / "Delivery has failed" /
  "Undeliverable"), the ticket is tagged "bounced" with a note giving the reason (mailbox full, address doesn't
  exist, blocked…), any out-of-stock case on that ticket is marked bounced so no 48-hour follow-up goes into a
  dead mailbox, and Slack gets an alert.
- Tickets opened by outbound emails (out-of-stock, stuck-package offers) carry the customer's name, not just
  the address.

## v4.9 — Oct 5, 2026
- **Out-of-stock emails from Stockroom send automatically** — no Slack approval step (OOS_AUTO_SEND=off restores
  the card). Slack gets an after-the-fact note with a link to the ticket.
- **48-hour follow-up**: if the customer hasn't replied to the out-of-stock email after 48 hours (OOS_FOLLOWUP_HOURS)
  and the ticket is still open, one follow-up goes out on the same thread listing the three options again.
- Outbound emails now carry their own Message-ID, so follow-ups and later replies thread correctly in the
  customer's mail client; a brand-new email no longer gets a "Re:" prefix.
- One email can cover several out-of-stock items on the same order (Stockroom v1.1 lets you tick them); the
  ticket note and Slack message list all of them.

## v4.8 — Sep 29, 2026
- No more blinking: the 30-second background refresh redraws the ticket table and the Shipments views only when
  something actually changed, never shows a "Checking…" placeholder, and waits if you have an action selected.

## v4.7 — Sep 29, 2026
- Never scanned: an acceptance scan no longer counts as movement. Only a real in-transit scan (or delivery)
  clears a package; "accepted, no movement since (N days)" stays on the list and says so. Packages closed on an
  acceptance scan by v4.6 are reopened automatically.

## v4.6 — Sep 29, 2026
- Carrier check falls back to ShipStation's "track this label" route (included with API access) when the
  track-any-number route is a plan add-on; the log reports which route works.

## v4.5 — Sep 29, 2026
- Shipments: the row actions are now one dropdown (Email customer / Open ticket, Check stock, Offer replacement,
  Offer credit +15%, Mark contacted, Mark resolved, Ignore / Reopen) with a Go button, instead of a wall of buttons.

## v4.4 — Sep 29, 2026
- Shipments: corrected explanation of why Shopify stays on "Tracking added" (it only follows Shopify Shipping labels;
  ShipStation doesn't push delivery events), and the carrier-check status/error now shows at the top of the view
  (e.g. ShipStation plan without the tracking API).

## v4.3 — Sep 29, 2026
- **Check stock** button on shipment rows: live availability for every line on the order, nothing drafted or sent.
  From the result you can jump to "Draft replacement offer" or "Draft credit offer" if you want to.

## v4.2 — Sep 29, 2026
- **Offers on stuck / undelivered packages.** Two buttons per row: **Replacement** runs a live stock check on every
  line of the order and drafts an offer to reship what's available (refunding what isn't, or offering refund/credit
  if nothing is); **Credit +15%** works out order total + 15% bonus and drafts the offer, with a checkbox to add the
  credit to the customer's Shopify account immediately. Both drafts are editable; sending opens a ticket from the
  brand mailbox and marks the row contacted.
- **Reliable delivery status.** Shopify only follows a shipment when the fulfillment names a carrier it recognises;
  ShipStation-created ones often say "Stamps.com"/"Other", so Shopify never checks and the status stays "Tracking
  added" even after delivery (#LB190443). Now every open row is cross-checked with the carrier through
  ShipStation's tracking API (needs SHIPSTATION_V2_KEY) — delivered packages close themselves and the row shows
  what the carrier says — and, with the write_fulfillments scope, the carrier name is corrected in Shopify so
  Shopify starts updating too. Rows flag "not followed by Shopify" when that's the situation.

## v4.1 — Sep 29, 2026
- **Shipments section** replaces "Stuck packages" with two views fed by the same 6-hour scan:
  **Never scanned** (label created, carrier never scanned it, 4+ days) and **Not delivered 15+ days** (order
  placed 15+ days ago and Shopify has no delivery on record, whether it's moving or not — with in-transit-since,
  estimated delivery and last-update dates, and a "never scanned" flag when it's in both). Both close themselves
  when Shopify records movement (never scanned) or delivery (both). Thresholds: STUCK_DAYS, UNDELIVERED_DAYS.

## v4.0 — Sep 29, 2026
- **User accounts.** Sign in with email + password. Admins add users from Settings → Users (name, email,
  password, role), reset passwords, deactivate/reactivate, and promote to admin; everyone can change their own
  password. Roles: admin (everything) and agent (works tickets, can't manage users). Sessions last 30 days and
  survive deploys; five wrong passwords lock that email/IP out for 15 minutes. The old access key still works
  as an admin fallback ("Use an access key instead" on the sign-in screen).
- Stuck packages now scans all orders from Jun 1, 2026 onward.

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
