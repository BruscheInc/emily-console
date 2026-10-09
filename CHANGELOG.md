# Buzzin — version history

Every upload to the emily-console repo is one version. The number shows in the app next to the "Buzzin" name
(top-left) and in the Railway boot log ("📨 Buzzin v3.0.0 on :8080"), so you can always tell which build is live.

## 4.40.1
- Local pickup orders: once the order is marked picked up (fulfilled) it counts as delivered on that day, so returns and defective-item claims open (return window and defect window run from pickup). Before pickup, only Edit / Cancel and "Something else" show. Shipping-only options (Package Protection, hasn't arrived, marked delivered, damaged in shipping) are off for pickup orders with a clear reason.

## 4.40.0
- Emily watches the website FAQ page: every day and right after Returns settings change she compares it with Buzzin (Loop links, the old claim-center link, drop-off days, how to report defects and damage, label fee, store-credit bonus, order edits). When something is out of date she rewrites those answers and asks for approval — a card in Slack #cs-approvals (Apply / Dismiss) and "FAQ changes waiting for approval" on Home. Nothing is published until someone approves (Apply in Slack, or Publish in Buzzin → Content → Website FAQs, where her suggested wording can be edited first). Policy calls like sale items only come back as notes.

## 4.39.0
- Website FAQs (sidebar → Content → Website FAQs, admins): shows each store's live FAQ page question by question, from the live theme. "Ask Emily to check" compares every answer with what Buzzin actually runs (return window, drop-off days, label fee, store-credit bonus, refund timing, defect and Package Protection claims, order edits, the returns portal link) and suggests rewrites with a reason for each, plus a list of policy calls for you. Review and edit side by side, then Publish writes only the answers you kept; Undo puts the page back. Publishing needs the Emily app's write_themes permission.

## 4.38.1
- Sidebar: Settings and your account stay pinned at the bottom (and the logo at the top); only the menu in between scrolls. Same on the narrow icon-only sidebar.

## 4.38.0
- Fresh look: warm off-white background, white work area, near-black primary buttons with soft shadows, outlined secondary buttons, honey-yellow highlights for the page you're on, focus rings and selection, rounder cards and modals, calmer table lines, and the Figtree typeface. Charts use ink and honey. Email Studio and Portal Studio match.

## 4.37.1
- The old app name is gone from the code and the app: Emily's tool names, email sender labels, the return "source" for staff-started returns (now "staff"), the package name, the offline cache name, and a one-time update of stored text (internal notes, Activity log, Emily's actions and policies, returns and claims history).

## 4.37.0
- New name: **Buzzin**, everywhere staff see it (app title, sidebar, browser tab, home-screen app, Email Studio, Portal Studio, Slack/Emily messages, logs). Customers see nothing new.
- New minimalist bee logo (yellow bee on near-black, with buzz lines) for the favicon, app icons and sidebar.

## 4.36.0
- Test customers: Returns → Settings → Claims has a "Test customers" list (default jimmy@bruscheinc.com). Claims from these emails are judged with a blank history: no past claims, returns, tickets, credits or reused-photo flag go to the AI reviewer, and the "too many approved claims" auto-approve limit is skipped. Emily's customer-history lookup also returns nothing for them, so test runs never shape how she treats the account.

## 4.35.2
- Portal size changes now always send Shopify's own "Order edited" email (the built-in notification, with the pay link when the total goes up), not only when the customer owes more. The Buzzin "Order updated" email from 4.35.1 is removed. Email map updated: "Order edited (Shopify)".

## 4.35.1
- New Buzzin email "Order updated": sent to the customer right after they change a size or the shipping address in the portal — lists what changed, the new address, and a line about paying the difference or the refund when the total changed. Threaded into a Buzzin ticket. Editable in Email Studio (Order edits). Before this, an edit with no price change sent no email at all.

## 4.35.0
- New sidebar, Klaviyo-style categories with Gorgias-style inbox counts: Search (⌘K), Home, Inbox, Mailboxes, Shipments, Returns & claims, Content, Analytics, then Settings and your account at the bottom. Groups open/close (remembered), show a total when closed, and the group with the page you're on always opens. Line icons; on narrow screens it collapses to an icon rail.
- Home page: "Welcome, {name}", a Needs attention list (tickets waiting, returns with problems, claims to review, out of stock, never scanned, not delivered 15+ days — each with Open), Inbox at a glance tiles, and a 30-day Returns summary (returns started, refunded, store credit, label spend, fees, days to refund, top reasons) vs the previous period. Home is the default page.
- Content group links Customer emails (Email Studio) and both portal designs; Returns & claims includes Order exceptions and both portals.

## 4.34.1
- Email Studio opens on an Email map: every customer email grouped by Returns / Claims / Order edits / All emails, showing what triggers it, who sends it (Buzzin or Shopify), and a dot on ones you've edited. Click any email to jump straight to its editor. Switch with "🗺 Email map" / "✏️ Edit" at the top. Day numbers follow Returns → Settings.

## 4.34.0
- Email Studio (/email-studio, Buzzin → Returns → ✉️ Customer emails or ✉️ Emails on a portal card): every customer email from returns, claims and order edits on one page, each with its own editor and a live preview (desktop / mobile), test send, save, discard and reset to default. Per store.
- Every email is marked with who sends it: Buzzin (edit here) or Shopify (edited in Shopify Admin → Settings → Notifications — listed for reference with the Shopify template name). Filter by sender.
- Claim emails (received, message received, approved — replacement / store credit / refund, denied, quick question) are now branded like the return emails and editable. Footer is its own item and applies to every Buzzin email.
- Saved wording goes live right away (no Portal Studio publish needed). Logo, colors and button shape still come from Portal Studio. Email wording already edited in Portal Studio moved over automatically; the Emails section there now links to Email Studio.

## 4.33.1
- "Print label and packing slip" and label links now use the store's branded domain (returns.larkspurbaby.com / returns.larkspurbabyoutlet.com) when branded links are on, instead of Buzzin's Railway address. Applies to the confirmation page and the return emails.

## 4.33.0
- Order exceptions (goodwill): Buzzin → Returns → ✨ Order exceptions (or ✨ Exception on a ticket's order panel). Pick an order, tick the rules it skips, add an optional end date and a note. Waivable: return window, final sale, return label fee, drop-off deadline, defect claim window, missing/damaged window, 14-day hasn't-arrived wait (and last day), marked-delivered wait, post-office check, Package Protection (treated as if the order had it — shipping claims only), edit window.
- Applies right away in the portal and Buzzin. Exceptions are logged on the return / claim history, shown as a chip on returns and in the claim details, and passed to the AI reviewer so waived rules aren't held against the customer. Removing or expiring one restores the normal rules immediately. Every add/remove is in the Activity log.

## 4.32.1
- Returns → Settings: every time limit in one "Time limits" section with plain labels (return window, drop-off deadline and reminder, edit window, defect window, hasn't-arrived open day and new last day, marked-delivered wait, attempted-delivery lock, PP / no-PP damaged & marked-delivered windows). New: last day to file "hasn't arrived" (0 = no limit) and the post-office lock length.

## 4.32.0
- Branded return emails, sent from the store's support mailbox and threaded into a Buzzin ticket: "Return submitted" (print label + packing slip button, view-your-return link, items, refund summary, how-to-ship steps), "Drop-off reminder" (day 21) and "Return closed" (day 29). Logo, colors and button shape come from the portal theme.
- Portal Studio → Emails: edit every line (subject, heading, message, button, steps, footer), preview each email with unsaved changes, and send a test to yourself.
- Portal returns no longer trigger Shopify's label email (ours replaces it); if ours fails to send, Shopify's goes out instead. Returns started from Buzzin still use Shopify's. Setting: own_return_email.

## 4.31.0
- New return confirmation page (Loop-style, two columns): label card with "Print label and packing slip" (one PDF: the label, then a 4x6 packing slip), drop-off deadline, tracking link and how-to-ship steps; items to pack with photos; cancel return (until the package is scanned); customer information; return summary with item subtotal, tax, label fee and estimated refund / store credit; a 2-question feedback survey; other returns from the same order; contact.
- The page has its own link (…?r=…) so customers can come back to it; the drop-off reminder email links to it.
- Feedback shows on the return in Buzzin → Returns.

## 4.30.3
- Attempted delivery: instead of a 24-hour wait, the customer is asked "Have you contacted your local post office?" Yes → they can file (goes to staff review). No → they're asked to contact the post office and the claim is locked for 30 minutes.

## 4.30.2
- Claims fix: ShipStation status SP ("Delivered to the collection location" — locker or post office) counts as delivered. A not-delivered answer only blocks a claim when it's newer than the delivered scan.

## 4.30.1
- Claims fix: ShipStation often returns "unknown" for label tracking, which blocked "marked delivered" claims even when the package was delivered. "Unknown" no longer counts as an answer, and Shopify's carrier-fed delivered scan now confirms delivery — unless ShipStation or USPS says it isn't delivered.

## 4.30.0
- Returns: customers have 28 days to drop off. If tracking shows no carrier scan by day 21 they get a reminder email with the label link; on day 29 the label is voided in ShipStation, the return is closed and they're emailed.
- Attempted delivery (not returned to sender): "My package hasn't arrived" tells the customer to check with their local post office and opens 24 hours after the attempt; those claims go to staff review. Return-to-sender packages can't be claimed as lost.
- Replacements are only offered (and approved) when the variant has more than 3 in stock; otherwise store credit.
- Removed "it will be approved automatically" from the waiting message.
- "Marked delivered" and "arrived damaged" claims: 7 days after delivery with Package Protection, 5 days without.

## 4.29.0
- Windows now run from the DELIVERY date (verified tracking, not the ship date): returns 7 days, defect and arrived-damaged claims 30 days, "marked delivered but I didn't get it" 5 days. Set once on deploy; adjustable in Returns → Settings.
- The policy note at the bottom now reads 7 days (it uses the return window).
- FAQs link at the bottom of each portal (larkspurbaby.com / larkspurbabyoutlet.com /pages/faqs).
- Orders with Package Protection: the Other tab only offers "Something else" and points shipping problems to the Package Protection claim tab, whatever the order status.

## 4.28.1
- Delivered orders with Package Protection: the Other tab offers only "Something else" (shipping problems go through the Package Protection tab).
- "My package hasn't arrived" stays selectable while a package is in transit — including "Accepted" or not yet scanned. Before 14 days it shows the date the claim opens; from day 14 it's approved automatically. Needs at least one carrier source (ShipStation or USPS) to confirm it isn't delivered.
- AI review for defective and damaged claims now also weighs the customer's past returns (items and reasons) and earlier claims, and checks the photos match the reason given.

## 4.28.0
- Portal tabs follow the order: not shipped → Edit or cancel + Other (message only); shipped, in transit → Start a return and Defective greyed; delivered → everything.
- Edit or cancel: stays available until the order ships. Cancel (full refund) any time before shipping; size changes (in-stock sizes only) and address changes within 15 minutes. Adding items and quantity changes removed.
- Package Protection claim: "My package hasn't arrived", "My package was marked delivered, but I didn't get it", "My package arrived damaged" (missing items removed). Damaged and marked-delivered greyed until delivered.
- "Package not delivered" tab is now "Other": the same three options plus "Something else" (message + optional photos → Buzzin ticket). Without Package Protection: hasn't arrived and damaged work like PP; marked delivered → carrier claim steps.
- Hasn't arrived is days-based: opens 14 days after shipping if verified tracking still isn't delivered (setting).
- Auto-approval: hasn't arrived (14-day rule), marked delivered (AI on history), damaged and defective (AI checks photos are genuine) approve automatically when every check passes — value limit, AI confidence, no more than N approved claims per customer in 12 months, no reused/stock photos. Otherwise the claim waits in Claims with the reason. All limits in Returns → Settings.
- Return reasons: Too small, Too large, Didn't like the fit, Color or print wasn't as expected, Fabric or material wasn't as expected, Item arrived damaged or defective, Received the wrong item, Changed my mind, Arrived too late, Other (requires a note).
- Package Protection now shows greyed out in the return list ("Package Protection isn't returnable").
- Emily's policy: 14+ days not delivered → replacement or store credit for everyone; marked delivered without PP → carrier claim.

## 4.27.0
- Claims: tracking is now verified across independent sources before a lost or not-delivered claim can open — Shopify's fulfillment tracking (when Shopify follows the number), ShipStation's carrier tracking, and USPS directly for USPS packages (needs USPS_CLIENT_ID / USPS_CLIENT_SECRET from developers.usps.com). At least two sources must answer. Any source saying delivered blocks "hasn't arrived"; "marked delivered" needs a carrier source (ShipStation or USPS) to confirm delivery. If sources can't be reached the claim stays closed and the customer is asked to email. Staff see each source's answer on the claim.

## 4.26.2
- Claims fix: the Package Protection line's own no-tracking fulfillment was treated as a package that never moved, so delivered orders showed "still moving". Cancelled fulfillments, PP-only fulfillments, and untracked fulfillments (when a tracked one exists) are now ignored.

## 4.26.1
- Returns portal fix: after the first lookup, the reason list showed Shopify's full library (with no ids), so Continue never enabled. Customers now always get the six reasons.

## 4.26.0
- Returns portal: after looking up an order, customers pick what they need — Edit my order, Start a return, Defective item, Package Protection claim, or Package not delivered. Options that don't apply are shown greyed out with the reason.
- Package Protection is never returnable (hidden from the return list and refused by the server).
- Edit my order: within 15 minutes of purchase and before it ships, customers change the shipping name/address, swap sizes (discount kept), change quantities, remove items, or add in-stock items. Extra cost → Shopify emails a pay link and the order is tagged portal-edit-unpaid; lower total → the difference is refunded. Logged in Claims → Order edits and Slack.
- Defective item: pick items, describe the problem, upload photos (resized in the browser). AI reviews photos, timing and the customer's history (earlier claims, returns, credits, reused photos) and gives staff an approve / deny / needs-info opinion. Customer keeps the item. Options: replacement, store credit, or refund (refund only without Package Protection).
- Package Protection claim: live tracking decides when a claim can be filed — "hasn't arrived" once tracking hasn't moved for 5 days, "marked delivered" 24 hours after the delivery scan; damaged (photos required) and missing items too. Replacement or store credit only. Covers just the items in the affected shipment.
- Package not delivered without Package Protection: carrier claim steps and links, no credit. Emily's policy updated to match (the 50% goodwill credit now applies only to missing items).
- New Buzzin → Claims queue: photos, tracking, AI opinion, customer history; Approve (replacement order, store credit or refund, capped at the claim value, locked against double clicks), Deny, Ask customer, Re-run AI. Every claim opens a ticket and emails the customer at each step. Claimed items can't also be returned or claimed twice.
- Settings: edit window, claim window, stall days, delivered-wait hours, and the Package Protection line-item match.

## 4.25.0
- Returns screen redesigned as a command center: a card per portal (branded address, live status, Open portal / Copy link / Customize buttons), quick actions, clickable stat tiles (open, needs attention, refunded, label spend, cancelled, all), and a cleaner filter bar.

## 4.24.1
- Returns: LB and LBO return portal buttons in the sidebar, on the Returns screen and on Return analytics.

## 4.24.0
- Returns: new Return analytics dashboard (sidebar → Return analytics). Today / 7 days / 30 days / month to date / year to date / custom range, per store or both, each compared with the previous period. Shows returns, return rate (vs Shopify orders), value returned, refunds, store credit, label spend vs fees, days to refund, open returns; daily/weekly/monthly trend; reasons with change vs the prior period; fit problems by product and size; a product × reason grid; most-returned products; store, refund-choice and source splits; repeat returners; customer notes; and a filterable list of returns, with CSV export.
- Returns: label spend, refunds and fees now only count real returns since the last stats reset (testing before Oct 7, 2026 is left out). Voided labels on cancelled returns no longer count toward spend. Admins can reset stats from the dashboard.

## 4.23.1
- Returns: return numbers now use the original order number plus a count — LB191494-R1, then LB191494-R2 if the same order is returned again. Replaces the running LB-R1001 style numbers.

## 4.23.0
- Returns: branded portal addresses — returns.larkspurbaby.com and returns.larkspurbabyoutlet.com open that store's portal directly and show nothing else from Buzzin. New Settings switch "Use branded links" makes Emily and Buzzin use them once DNS is live.

## 4.22.10
- Returns: customers now pick from six reasons only (wrong item, damaged, bad experience, didn't fit, found something else, didn't like it). The list is editable in Returns → Settings. Each maps to Shopify's closest standard reason, and the exact wording is saved as the return's reason note.

## v4.22.9 — Oct 7, 2026
- Each return's history now says whether it was linked to the original ShipStation order (and which), or why not
  (no tracking number on the order, no ShipStation label with that tracking number, lookup error). Same detail in the log.

## v4.22.8 — Oct 7, 2026
- **Return labels are tied to the original ShipStation order.** Buzzin finds the order's original shipping
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
  right now — email us" message; the exact cause goes to Buzzin log.
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
- **+ New ticket.** Start an email conversation with a customer from Buzzin. Pick the store (Larkspur Baby or
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
- **Logo.** Buzzin has its own mark (inbox tray with a letter dropping in) in the sidebar, the browser tab, and the
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
- **One Google client per mailbox.** `GOOGLE_OAUTH_CLIENTS` now carries both projects (brusche-buzzin for
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
- Emily only sweeps mail that arrived after she went live in Buzzin (no more re-posting the whole backlog on
  every deploy); out-of-stock cards no longer re-post on restart.

## v2.1 — Sep 28, 2026
- Quoted replies ("On … wrote:", "Original Message", ">" lines, Outlook headers) are hidden behind "Show quoted
  text" on every message; `(mailto:…)` leftovers removed. Emily reads only the new part of each message too.

## v2 — Sep 28, 2026
- Emily (Slack bot) and the console merged into one app: **Buzzin** is the app, **Emily** is the agent.
- Gorgias-style inbox: views and mailboxes in the left sidebar with counts, ticket table (subject + preview, tags,
  customer, last message), 20 per page, Pending / Sent / Closed / Collabs / All.
- Emily drafts appear in the ticket with Approve / Edit / Redraft / Skip; approvals from Slack and the app share
  one path. Persisted staged actions, policy editor with history, activity log.

## v1 — earlier
- Console: Gorgias import, Gmail send/receive per mailbox, LB/LBO views, OOS view, reply/note/assign/spam.
