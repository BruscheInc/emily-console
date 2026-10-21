# Buzzin — version history

Every upload to the emily-console repo is one version. The number shows in the app next to the "Buzzin" name
(top-left) and in the Railway boot log ("📨 Buzzin v3.0.0 on :8080"), so you can always tell which build is live.

## 4.97.2
- Campaign editor header now reads "Campaigns / campaign name", like flows. Click the name to rename it.

## 4.97.1
Polish, part 2.
- **Help desk ticket list:** the subject comes first, followed by a small message-count badge and a faint ticket number. Before, the long ID came first. On phones, the order, order-status and tag columns are hidden so subjects and customers have room, and buttons don't wrap onto three lines.
- **Ticket view:** shows "Larkspur Baby" / "Larkspur Baby Outlet" and the sending address instead of the codes lb / lbo.
- **Marketing:** technical sync logs are tucked behind a "Technical log" toggle, and KPI cards sit two per row on phones.

## 4.97.0
Polish, part 1: one design system across Buzzin, plus your own social icons.
- **Shared look:** a single stylesheet (bz-ui.css) gives the help desk and Marketing the same buttons, inputs, dropdowns, tables, pills, menus, toasts, focus rings, scrollbars and motion. Reduced-motion settings are respected.
- **Marketing:** every page now sits on the same white sheet as the Klaviyo-style pages, with a cleaner top bar and left menu. Pages show a loading skeleton while they open. If a page fails, you get a clear message with a Try again button. Each browser tab is named after its page.
- **On phones**, Marketing has a menu button. Before, the left menu simply disappeared.
- Profiles table headers now say Email address / Email consent / Text consent; before, "Email" appeared twice.
- **Social links in emails:** every icon can use your own image (Use my own → upload or pick from the library). **Save to brand kit** makes those icons the default for every email; Buzzin's icons are used only where you haven't set one.

## 4.96.0
Flow builder: Actions panel and Klaviyo-style step details.
- **Actions panel:** opens with the flow. Messages (Email, Text message), Data (Property update, List update, Coupon code, Internal alert, Create ticket, Webhook) and Logic (Time delay, Conditional split, A/B split, Wait until). Drag an action onto a + in the flow, or click it and then click a +. Close the panel to see the whole flow, and reopen it from the Actions button.
- **Email details:** email name and status, performance, subject and preview text, the template with a live desktop or mobile preview (Edit opens it, ⤢ shows it full size), Settings (skip recently emailed profiles, UTM tracking on or off), and additional filters for who gets this email.
- **Text message details:** name and status, performance, content shown as a text bubble with Edit, Smart Sending, UTM tracking, a note on quiet hours, and additional filters.
- **Time delay details:** set the delay, optionally "until a specific time of day" (the person's time zone or store time), and optionally "on specific days of the week". Cards read "Wait 14 days, until 10:00 AM".
- Message cards show the step's own name, like "Welcome Email".

## 4.95.1
- Flow canvas: each split now has a connecting line. A line comes down from the split, runs across, and drops into each branch, with blue "Yes" and grey "No" labels like Klaviyo, so you can see where every path goes. A/B splits and "wait until" steps get the same lines.

## 4.95.0
Flow builder laid out like Klaviyo.
- **Top bar:** Flows / flow name (click to rename), status, a ⋮ menu (Edit details, status, Trigger settings, Clone, Copy ID, Archive, Delete), and buttons for analytics on steps, people in the flow, Preview, Save and **Review and turn on** (or **Turn off**).
- **One floating panel** on the left of the canvas, like Klaviyo. Click the Trigger card for its settings, or any step for its details. Close it to see the whole flow.
- **Step analytics:** email and text steps show a Performance box (last 7 / 30 / 90 / 365 days) with Recipients, Open rate, Click rate, Placed order (revenue and orders), Unsubscribe rate and Bounce rate. Their cards show open, click and revenue right on the canvas; the chart button hides or shows those numbers.
- **Conditional splits** use Klaviyo's condition builder: pick a dimension (what someone has done or not done, properties about someone, location, list, segment, can or cannot receive marketing, sizes bought, customer service), then the details. Conditions are joined by AND, and each one can have OR options. The same builder is used for segments and for a flow's entry and exit rules.
- Fix: send counts in reports were too high when one send had both an open and a click.

## 4.94.0
Flows laid out like Klaviyo.
- **Flows list:** search, a Status filter and a Metric period (7 / 30 / 90 / 365 days). Each row shows the flow name with its trigger underneath, Type (email / text icons), Status, Last updated, Revenue and Revenue per recipient. Every row has a ⋮ menu: Edit details, Clone, Copy ID, Archive, Delete. Tick boxes archive or delete several at once.
- **Options:** show archived flows (and restore them), or re-import from Klaviyo. **Create flow** (top right) starts a blank flow or one from a starter.
- **Archive vs Delete:** Archive turns a flow off and hides it, and you can restore it. Delete removes the flow for good, and anyone in it leaves.
- **Flow canvas:** drag the background to move around, scroll to pan, pinch or ⌘/Ctrl + scroll to zoom. Zoom buttons (+ / − / fit to screen) sit in the corner. Clicking a "Joins" link centers that step.

## 4.93.0
Email templates page laid out like Klaviyo.
- Cards with a live preview of each email, its name and the date it was last edited. Each card has a ⋮ menu: Edit, Rename, Clone, Preview (full-size) and Delete.
- Search, a Type filter (From Klaviyo / Made in Buzzin), sorting (Edited most recently / Name) and a Grid / List switch.
- The **Create** button (top right) starts a blank email or one from a starter.

## 4.92.0
Coupon codes stay tidy in Shopify.
- **One Shopify discount per offer.** Each discount holds all of that offer's codes, for example "Buzzin · 10% off entire order · valid 7 days". Shopify's Discounts page shows one line per offer, not one line per person. Shopify applies "one use" and "one per customer" to each code inside the discount.
- **Days valid are enforced by removing the code.** When a person's days are up, Buzzin removes their code from the discount, so it stops working at checkout. This is checked every 30 minutes.
- Ready codes are added to the discount 25 at a time, so a person still gets theirs instantly.

## 4.91.1
- Ready-made codes no longer go to waste. They wait in the pool for up to 45 days, and when someone gets one, Buzzin sets its real end date in Shopify in the background, so a 7-day code is good for 7 days from when they get it.

## 4.91.0
Coupon blocks create Shopify's 4 discount types, instantly.
- **Choose what the coupon does** on the coupon block (Discount section), with the same choices as Shopify's "Create discount": **Amount off order**, **Amount off products** (pick collections or products), **Buy X get Y** (minimum quantity or amount, what they get, free / % off / $ off each, max uses per order) and **Free shipping** (countries, exclude rates over $X). Also minimum purchase, combinations, days valid and code prefix. Or switch to "Same code for everyone" and type an existing code.
- **Unique code per person**, single use and one per customer. Each coupon block has its own offer, so one email can carry, for example, a 10% code and a free-shipping code.
- **No waiting.** Buzzin keeps 25 ready-made codes in Shopify for every offer in use and tops them up in the background, so a code is there the moment an email sends or a form shows its success step. Codes get ready as soon as you save an email with a coupon or set a form live.
- An "Auto-apply link" button on the coupon block fills in a link (/discount/your-code) that puts the code in the cart.

## 4.90.2
- "Welcome Email (Klaviyo)" was edited in Buzzin, so the automatic re-copy left it alone. Now only the blocks that held Klaviyo's coupon tag get the code back, and the rest of your edits stay.
- Any Klaviyo coupon tag still left in an email or link shows the person's code when it's sent.

## 4.90.1
Tests feel like the live message.
- Test emails and texts to an address on the Internal test list use that person's real profile: their first name, real links, and their own working single-use code, created in Shopify like a live send. The same code comes back on each test until it's used or expires.
- Addresses that aren't on the test list still get a sample code.

## 4.90.0
Unique coupon codes in every email and text.
- **One code per person.** When an email or text uses a coupon and the person has no usable code, Buzzin makes one just for them at send time: a single-use Shopify discount, one per customer. A code is reused while it's valid and unused; once it's used or expired, the next message gets a new one. This works in flows and campaigns, including welcome emails for people who joined without a sign-up form.
- **Settings → Coupon codes in emails & texts:** percent off (default 10%), days valid (default 7) and code prefix (default WELCOME).
- **Klaviyo emails:** Klaviyo's `{% coupon_code %}` tag was being dropped when the emails were copied, so "Welcome Email (Klaviyo)" showed no code and its link had none. It now becomes the person's own code, in the text and in links. Copies nobody has edited are re-copied automatically.
- Tests and previews show a sample code (never created in Shopify) instead of a blank.

## 4.89.0
Lists & segments and Campaigns pages laid out like Klaviyo, with easy deleting.
- **Lists & segments** is now one page: search, type filter, stars, member counts and created dates. Every row has a ⋮ menu (Update definition / View members, Edit name, Clone, Star, Delete), and tick boxes let you delete several at once. Before deleting, Buzzin tells you which forms, flows, campaigns or segments still use it. Deleted lists and segments are hidden, not erased. The Shopify Merged Newsletter list can't be deleted.
- **Create** on that page makes a list, a blank segment, or a segment Emily builds from a description.
- **Campaigns** page: Create campaign button top right, List / Calendar switch, search with Status and Channels filters, and the audience under each campaign name. Every row has a ⋮ menu (Edit or View report, Rename, Clone, Delete), and tick boxes let you delete several at once.
- Fix: Outlet segments, campaigns and flows now reach the whole Brusche audience. Since the profile merge, they were still limited to Outlet-only profiles, which no longer exist.

## 4.88.0
Sign-up forms: Targeting & display behavior laid out like Klaviyo.
- **Targeting tab:** Audience (all visitors, not existing Buzzin profiles, existing profiles only, not subscribers, or lists & segments); URLs with on/off switches and * wild cards (full links or paths); Location with "show in" and "don't show in" country pickers; UTM parameters (save them on the profile when someone signs up, and show only when the link's UTM rules match).
- **Display tab:** Display priority, Timing (based on rules / immediately / custom trigger only, with switches for exit, delay, scroll and pages), Frequency (show again after N days; don't show again once submitted or a go-to-URL button was clicked), Devices, Click outside form to close (desktop and mobile separately), and a Custom trigger code to open the form from your own button.
- Klaviyo's "Don't show to existing Klaviyo profiles" rule now carries over as "Don't show to existing Buzzin profiles".

## 4.87.0
Sign-up forms: Klaviyo-style button settings, and one list with every contact.
- **Choose where people go.** Click a Submit / Continue button: pick the **List to submit** (or keep the form's list), what happens **After submit** (next step, a chosen step, close, or a URL), and **Submit hidden fields** (profile properties saved on submit, e.g. Source = Spring popup).
- **Button text styling** like Klaviyo: font, size, bold / italic / underline / strikethrough, letter spacing and color.
- **Klaviyo selection look.** A selected block gets a blue outline and label, with the tools in a vertical strip on its left.
- **Shopify Merged Newsletter** list: holds every Brusche contact (LB and LBO), and every new contact joins it automatically. The Klaviyo copy of that list is reused when there is one.

## 4.86.0
Sign-up forms: everything left to match Klaviyo, plus copy & paste.
- **Type on the form.** Click a text block, click again (or double-click) and type right on the canvas; a B / I / U / link bar appears on the block. Double-click a button to rename it.
- **Side-by-side blocks.** Drag a block onto the left or right edge of another to put them in one row (up to 3), set each one's width, and choose whether the row stacks on phones.
- **Mobile design.** Each block can show on desktop & mobile, desktop only or mobile only. Click a block in the Mobile canvas (or pick "Mobile only") to change its padding, alignment and text size just for phones.
- **New blocks:** Spin-to-win (slices with % off and chances; the prize is picked on the server and a single-use code at that % is made), Sign-up counter (live number of sign-ups), Reviews (rotating customer quotes).
- **Copy & paste blocks.** ⌘C / ⌘V (or Copy, and Paste in Add blocks) between steps and forms; "Copy to steps…" puts an identical copy on the steps you pick, in the same position. ⌘D duplicates.
- **Side image panel like Klaviyo's:** preview with file name, size and dimensions; Crop (free, 1:1, 4:5, 3:4, 9:16, 16:9); Replace; delete; alt text; Cover / Contain with a focus-point grid; background color. Klaviyo's "medium" side image is now a true 50/50 split.
- **A/B testing:** flask icon in the left rail or ⋮ → Create A/B test. Up to 4 versions, traffic split, views / sign-ups / rate / revenue per version, end the test keeping the winner. Each visitor always sees the same version.
- **Publish or schedule:** publish now, or set a start and optional end time; the form turns on and off by itself. Scheduled / Ended show in the list.
- **Targeting:** only show in / hide in countries (from the visitor's internet address), only show to / hide from lists and segments, and a custom JavaScript rule (admins).
- **Comments** on a form, **Ask Emily** (describe a change to the step; undo works), and the "buttons inherit form defaults" tip.
- **Preview on website** now shows the exact form you're editing, Drafts included, right away. Sign-ups made in a preview are marked as previews and never create real discount codes.
- **Both stores:** Create form asks Larkspur Baby or Outlet (when "Both stores" is picked), the list shows the store, and ⋮ → Copy to Outlet / Copy to Larkspur Baby.
- Klaviyo copies: images are copied into Buzzin's own image library (Klaviyo is cancelled), rows, desktop/mobile-only blocks, cover/focus, the US-only rule and spin-to-win come across.
- Fix: double-clicking a button that wasn't selected yet lost what you typed.

## 4.84.4
- Emily can change the email on an order. When a customer asks (typo at checkout, old address), she stages an email change for one-click approval that updates the order in Shopify and ShipStation, so order and shipping emails reach the right inbox — instead of leaving a to-do for the team (ticket 9000000642).

## 4.85.3
- Form editor: click the side photo to change it. Hover shows "Change image"; the Side image panel has Upload / Library, image address, position (left, right, top, none), width, "Use on every step" and Remove.

## 4.85.2
- Fix: the form ⋮ menu opens as a dropdown right under the button (it showed as plain buttons at the bottom of the page). Closes on click outside, scroll or Esc.

## 4.85.1
- Klaviyo copies use Klaviyo's step names (Email Opt-In, Success) and their real images, including the side photo.

## 4.85.0
- **Sign-up forms list looks and works like Klaviyo's**: Name (with the list it feeds), Type, Status, Submitted, Submit rate (red / amber / green flag), Total revenue; search, Status and Form type filters; a ⋮ menu on each form with Edit, Analytics, Rename, Clone, Publish / Unpublish and Delete.
- **Form analytics** (⋮ → Analytics, or click the Submitted number): submit rate, submitted (emails / phones), viewed, total revenue and orders after signing up, revenue per view, text sign-up rate, and a views vs. submissions chart for 7 / 30 / 90 / 365 days or all time.

## 4.84.3
- Klaviyo form copy keeps the **image split** (form on one side, photo on the other). If the photo can't be downloaded, the editor shows an "Add side image" box in its place; click it to add the photo. Buzzin also tries Klaviyo's storefront copy of the form to get the real images.

## 4.84.2
- Klaviyo form copy: "all pages" rules no longer flagged; import notes say exactly which images to re-add (Klaviyo's API doesn't provide form images).

## 4.84.1
- Klaviyo form copy: page rules (URL patterns) and utm_source links now carry over; image errors and unsupported display rules are logged clearly. The two copies are refreshed once, unless someone already edited them.

## 4.84.0
- **Sign-up form editor laid out 1:1 like Klaviyo's.**
  - Full-screen editor: exit, form name, saved check, Draft / Preview only / Live, **Preview on website**, **Publish**. Changes save automatically (and with Cmd/Ctrl+S).
  - Left icon rail: **Add blocks**, **Styles**, **Targeting & behaviors**. The panel collapses.
  - **Add blocks** has Basic and Universal tabs, with Integrations (Coupon), Elements (Text, Button, Image, Countdown timer, Spacer, Divider, HTML) and Input fields (Email input, Phone number, Text input, Radio button, Checkboxes, Dropdown, Date). Drag a tile onto the form or click it. Email and phone grey out when the step already has one.
  - Floating step bar: undo / redo, Teaser ⋮, each step with a drag handle and ⋮ menu (settings, rename, duplicate, move, make it the success step, delete), + Step, Success, view switch (desktop + mobile, desktop, mobile) and Try it.
  - The canvas shows the form on its own like Klaviyo, Desktop and Mobile side by side, with zoom (+, −, fit). Click a block to edit it; the selected block has move, duplicate and delete buttons; drag blocks to reorder. Delete and Esc work on the keyboard.
  - Universal blocks: save any block and reuse it in any form.
  - Coupon settings live on the Coupon block; the sign-up list lives in Targeting & behaviors (Submissions).
  - Phone field has a country picker (US / Canada).
- **Copy forms from Klaviyo.** Buzzin copies every Klaviyo sign-up form (each A/B variant too) as a Draft: steps, blocks, side image, styles, fonts, buttons, teaser and display rules. Klaviyo isn't changed. Anything that couldn't come over is listed under "Copied from Klaviyo" in Targeting & behaviors. It runs once by itself after this update, and again any time from the "Copy forms from Klaviyo" button (it only adds forms not already here).

## 4.83.1
- **Sign-up consent is to Brusche Inc.** New text and email consent wording names "Brusche Inc. and its brands, including Larkspur Baby", so one sign-up covers every Brusche brand. Forms still using the old store-name wording are switched automatically; custom wording is left alone. Each sign-up keeps the exact wording the person agreed to.
- Unsubscribe pages say the unsubscribe covers every Brusche Inc. brand.

## 4.83.0
- **Sign-up form builder rebuilt to mirror Klaviyo's.**
  - **Blocks** on every step: Text (rich text: headings, bold, italic, underline, lists, links, color), Image, Button, Email, Phone number, Text input, Checkboxes, Radio buttons, Dropdown, Date, Coupon, Countdown timer, Spacer, Divider, HTML. Each block has padding, alignment and background.
  - **Canvas**: click a block to edit it, drag blocks to reorder, duplicate, move, delete. Step tabs over the canvas (Teaser, each step, Success, + Step). Edit / Try it, desktop / mobile.
  - **Buttons** do what Klaviyo's do: submit form, go to next step, go to a step, close form, go to URL, copy coupon code; button or text-link look; per-button colors.
  - **Styles**: Popup, Flyout (4 corners), Full page, Embed, Banner (top/bottom); width, min height, animation; background color/image; border, corner radius, shadow; padding; overlay color and opacity; close button style, size, color, outside placement; text, Heading 1, Heading 2 fonts (incl. Google fonts), sizes, weights, colors; input fields; buttons; mobile bottom sheet, width, text scale, padding.
  - **Behaviors**: show right away, after X seconds, after scrolling X%, on exit intent, after X pages; show again X days after closing; auto-close the success step; teaser before/after/both with its own text, position and colors.
  - **Targeting**: device, new/returning visitors, hide from people who signed up, utm_source, page include/exclude, priority.
  - Email and phone can be on the same step. The SMS step is skipped for people who already get texts. The phone block always shows the text consent wording with an unchecked box.
  - Existing forms convert automatically to the new layout, on the store too.
- Segments: the store column is gone (one Brusche audience).

## 4.82.1
- Fix: the **Size-up due** segment hadn't counted since Oct 10. A last order with no recognizable size saved an empty size value that broke the count; those are cleaned up and can't happen again.

## 4.82.0
- **Profiles are Brusche only.** No Larkspur Baby / Outlet field on profiles, lists or the import anymore: the Profiles, Lists and Overview pages always show the whole Brusche audience, and every profile is part of it (merge and import move everyone over).
- Import no longer asks which store a file is from. Upload all the customer exports together; order totals from each file are added up per customer, and tags from every file are combined.

## 4.81.0
- **One Brusche profile per customer.** Customers belong to Brusche, not to one store: the same email is one profile whether they shopped Larkspur Baby, the Outlet, or both. A profile's store is now its home brand (Larkspur Baby if they shopped both) and "Shopped" shows every brand.
- New **Marketing → Merge & import** page (admins):
  1. **Back up**: copies every profile, consent record, event, list, segment and send table before anything changes (`mk_bak_<time>_*`).
  2. **Merge duplicate profiles**: same email → one profile. The strictest consent wins (an unsubscribe or bounce in either store stays). Orders and spend from both stores are added up. A no-email profile folds into the one profile that has its phone. The same phone on different emails is never merged; download the list to review. Old unsubscribe and preference links keep working.
  3. **Import Shopify customer files** (CSV): names, address, tags, order totals and the survey answers (child's size and gender, adult size, DFW, ratings, feedback). Shows the counts before you press Import. Email "yes" only fills in someone with no consent record; it never overrides an unsubscribe.
- **Text consent is never taken from the files.** It comes only from Shopify's own SMS consent record or a Buzzin sign-up/keyword. Email subscribers who can't get texts are marked as SMS candidates and put on the **SMS candidates (email subscribers)** list, to invite with a join-texts email.
- New profiles from any source now land on the existing profile when the email matches, in either store. A phone number only matches a profile when no email says it's someone else.

## 4.80.0
- New email editor, built 1:1 on Klaviyo's own template format (sections → columns → blocks, with Klaviyo's field names).
  - Left side: **Add content** (Blocks · Pre-built · Universal) and **Styles** (the whole email: backgrounds, width, border, Normal text, Heading 1–4, links, mobile).
  - Blocks: Text, Image, Split, Button, Header/link bar, Drop shadow, Divider, Social links, Spacer, Product, Coupon, Table, Review quote, Video, HTML, Countdown. Layout: Columns (11 column layouts) and Section.
  - Click a block to select it: Styles + Display tabs, and a side toolbar (move, duplicate, save as universal, Ask Emily, comment, delete). Drag blocks and sections anywhere; drag image edges to resize.
  - Text is typed straight onto the email, with a formatting bar (Normal/H1–H4, font, size, bold, italic, underline, color, highlight, align, lists, links, personalization).
  - Image settings match Klaviyo: crop, replace, alt text, link, width/height with lock, alignment, Fill column, Fill column on mobile, image area padding/background/border/corner radius, block background, block padding, Full width on mobile. All padding 0 + Fill column = flush, edge-to-edge image.
  - Display tab on every block and section: All devices / Desktop only / Mobile only, show/hide logic (builder or Klaviyo-style code), content repeat.
  - Undo/redo, desktop/phone view, Preview (filled in for a sample person), universal content that updates everywhere it's used.
- Klaviyo templates are re-read with their drag-and-drop layout (read-only) and open as real blocks. Runs once by itself after this deploy; "Re-import from Klaviyo" runs it again. Templates already edited in Buzzin aren't overwritten.
- Social icons in four styles (color, black, grey, white) are hosted by Buzzin as PNGs so every inbox shows them.

## 4.79.2
- Refunds for out-of-stock items never put the item back in stock (it isn't on the shelf, so restocking would make it sellable again). The refund card says "No restock (out of stock)".

## 4.79.1
- Refunds work again. The refund preview sent Shopify the wrong type for "refund shipping" (Shopify wants true/false), so every refund — Emily's refund card and the Refund button on an order — failed before anything was refunded (ticket 9000000616).
- Approving Emily's draft is blocked when an action on that ticket just failed (e.g. the reply says "we're processing your refund" but the refund errored). Retry the action, or edit the reply.

## 4.79.0
- Returns: warehouse check-in is per item. Each item on a return has a count box and **Accept**; **Accept all** checks in the rest at once. Each item keeps its own date and who checked it in (shown on the return and on Returned items). When the last item is checked in, the return counts as accepted and the refund runs for what was received.

## 4.78.1
- Returns: searching on the Returns page now also finds imported Loop returns (marked "Loop"). The Loop returns page opens on All instead of only "Needs a decision", so open Loop returns (label made / on the way) are visible right away.

## 4.78.0
- Returns: refunds follow what the warehouse received. When a return is accepted at the warehouse with fewer items than expected, only the received items are refunded (less the label fee) and the Shopify return is closed for the rest. "Refund now" on a checked-in return does the same.
- New setting (Returns → Settings): **Wait for the warehouse to accept it, then refund only the items received** — holds the automatic refund at "Delivered" until someone checks the package in. Off by default.

## 4.77.0
- Returns: **Accept at warehouse** on every return. Staff count what came back (qty per item + a note); the date and who accepted it are saved. If tracking hadn't caught up (or it's a Loop label), accepting marks it delivered and the normal auto refund runs; if anything is short, it goes to Needs attention instead and Slack gets a note.
- New **Returned items** page (Returns & claims): one line per returned product with when it was sent back, delivered and accepted at the warehouse; filters by status, store, dates and SKU; totals by product; CSV export. The menu count shows returns delivered but not checked in yet.

## 4.76.0
- Emily reads discounts live from Shopify (Larkspur Baby). In the website chat and on email she checks the code a customer mentions: a near-miss like HAPPYHOLIDAY comes back as the real code (happyholidays) with a link that applies it at checkout, plus what it covers (e.g. only the Holiday collection), end date, minimum, and whether it combines. Expired or unknown codes get a clear answer.
- She never reveals one-time codes, her own goodwill codes, or test / 100%-off codes, never lists codes nobody asked about, and never suggests the military code unless asked for it.
- Larkspur Baby Outlet has no discounts of any kind: Emily won't offer or propose a code for the Outlet, and the chat says so.

## 4.75.1
- Rules: Emily only gives the military code (thankyoumilitary, Larkspur Baby only) when a customer explicitly asks for a military discount — never when someone asks about discounts in general.

## 4.75.0
- Menu: Buzzin opens with every group collapsed except Inbox (and the group for the page you're on).
- Rules: the military discount code thankyoumilitary is for Larkspur Baby only — not the Outlet.

## 4.74.0
- Website chat now answers from Emily's full rulebook — free shipping, local pickup, discounts, returns, the Outlet — instead of only the FAQ page, so it gives real answers ("free shipping on Larkspur Baby orders of $75+, applied automatically") rather than "check our FAQ".
- Website chat knows both stores. It links shoppers to the other store when asked, and when something isn't sold on the store they're on but is on the other one (e.g. dresses at the Outlet), it says so and links it.
- When the chat can't answer, it no longer tells shoppers to email us. An email box appears under its reply; the shopper leaves their email and a ticket is created with the whole chat attached (one ticket per chat — later questions are added to it). Typing an email into the chat works too.
- Rules: Larkspur Baby Outlet has no free shipping (Larkspur Baby: free on US orders of $75+, no code). Military discount code thankyoumilitary.
- Rules: the old Loop return links in Emily's saved rules now point to returns.larkspurbaby.com / returns.larkspurbabyoutlet.com.

## 4.73.0
- Emily: replacement orders can now ship to a different address. Before, a replacement always went to the address on the order it was based on — so when that order had gone to the wrong address, the replacement went there too, and the right address only ended up in the note (ticket 9000000517). Emily now passes the correct address, and the card's "Ship to" line shows it.
- Emily: when she proposes a new replacement for the same order on a ticket, the older card is retired, so only one can be applied.
- **Emily's replies** (Analytics → Emily's replies): one page for everything Emily said without a person in the loop. *Website chat* lists every chat conversation from both stores, kept in full — click one to read the whole transcript, with the order she looked up and the ticket it was handed to. *Auto-sent & auto-closed* lists every email she sent on her own and every ticket she closed, with what the customer wrote, what Emily sent, why it closed, and whether the customer wrote back after. Counts for the last 30 days on top; filter by store and search.
- Claude connector: can also read website chats and Emily's automatic replies.
- Tickets: the ticket number shows in the ticket list and next to the customer's name on an open ticket (click it to copy). Searching a ticket number finds that ticket.

## 4.72.1
- Address change ready: when PUBLIC_URL changes (buzzin.bruscheinc.com), Buzzin subscribes Amazon's email and texting reports at the new address on startup. While both addresses are subscribed, duplicate events are handled once.
## 4.72.0
- **Claude connector.** Buzzin can now be added to Claude as a custom connector, so Claude can open Buzzin tickets directly: the conversation, every draft Emily wrote, the actions she staged (replacements, address changes, refunds) and the ticket history, plus Emily's policies. Claude can add internal notes; it cannot email customers, approve actions or change orders. Off until **BUZZIN_MCP_TOKEN** is set in Railway. Connector URL: `https://<buzzin-host>/mcp/<BUZZIN_MCP_TOKEN>`.

## 4.71.0
- Ticket lists: checkboxes on every row plus select-all for the page. Tick tickets and use **Close selected** (or **Reopen selected** on Closed / All) to change them together.

## 4.70.0
- Tickets: **Attach** button in the reply box. Add images, labels or PDFs (up to 15 MB each, 20 MB per reply); they show as chips you can remove and go out with the next reply — your typed reply or Emily's approved draft. Return labels from Emily's actions show in the same list.

## 4.69.3
- Loop returns have their own page in the left menu (Returns & claims → **Loop returns**), with its own tiles, filters and count; Import from Loop moved there. The Returns page shows only Buzzin returns.

## 4.69.2
- Loop import: fixed "Query cost is 1058" — the Shopify lookup is now three small queries.
- Returns: imported Loop returns have their own **From Loop** tab (needs-attention first) and are left out of the other tabs, tiles and money totals. Tracking and the CSV export still include them.

## 4.69.1
- Returns: at startup, when USPS keys are set, Buzzin tests USPS tracking and logs whether it works ("📮 USPS tracking: …").

## 4.69.0
- Returns: **Import from Loop** (Returns → Quick actions, admins). Upload Loop's ASN report .xlsx files; Buzzin reads only the returns still open, checks each against its Shopify return, previews, then imports. Labels not yet dropped off and packages on their way back are tracked like new returns (14-day transit rule, auto refund on delivery, quiet close after the drop-off window). Packages Loop marked delivered long ago but never refunded go to Needs attention. Exchanges, expired labels and returns already closed in Shopify are skipped. No customer emails.
- Returns can now be tracked by tracking number (labels not bought in our ShipStation account) through USPS's tracking API — needs USPS_CLIENT_ID / USPS_CLIENT_SECRET.

## 4.68.4
- Emily: removed the old Loop return links from her base instructions; they now point to returns.larkspurbaby.com and returns.larkspurbabyoutlet.com.

## 4.68.3
- Texting: when Amazon approves the toll-free number, Buzzin turns on replies and the STOP/HELP/JOIN wording for it by itself (checked every 3 hours and whenever the Texting page loads). No need to click Re-run setup.

## 4.68.2
- Texting page: "Check again" button when Amazon refuses a request, so you can retry after adding permissions without reloading.

## 4.68.1
- Tracked links in texts and emails, the open pixel, and the unsubscribe/preferences links now use the store's own domain (https://returns.larkspurbaby.com/l/… and the Outlet's) instead of the Railway address. Carriers filter texts whose links point at a domain that isn't the sender's, and mailbox providers trust matching domains more.

## 4.68.0
- **Texting through Amazon (AWS End User Messaging SMS).** Texts send from your Amazon toll-free number using the same Amazon login as email. The Texting page shows the number, its registration status (in review, approved, needs changes), sandbox or production, and the monthly limit. Checked every 3 hours.
- One button connects replies and delivery reports: two-way texting goes to Buzzin, so STOP/HELP/JOIN change consent and any other reply becomes a ticket, and each text is marked delivered or failed. Buzzin's STOP/HELP/JOIN wording is copied onto the number so Amazon's automatic replies match, and again whenever the wording is saved.
- Texts only go out once the number is active, the registration is approved, Amazon has lifted the sandbox, and the store's text switch is on. Before that, test texts go to verified test numbers only.

## 4.67.0
- **Sign-up forms: separate, unchecked text-message consent checkbox** (required by carriers and Amazon's toll-free registration). The phone step shows the consent wording next to an unchecked box with Terms and Privacy links; a phone number is only accepted when the box is ticked, and the phone step stays optional ("No thanks"). The server refuses a phone sign-up without the tick, and the consent record notes it.
- Consent wording now starts "By checking this box…"; existing forms on the old default wording were updated.

## 4.66.0
- **Amazon SES connected to Buzzin.** Marketing emails send through SES from hello@larkspurbaby.com (and the Outlet's address), with one-click unsubscribe headers (List-Unsubscribe / List-Unsubscribe-Post) that Gmail and Yahoo require for bulk mail.
- **Bounce & complaint reports.** One button on Domain & DNS sets up Amazon's reporting (configuration set → SNS → Buzzin). Permanent bounces and spam complaints mark the address "stopped" right away, so it's never emailed again unless the person signs up again through a form. Deliveries are recorded too. Only messages signed by Amazon are accepted.
- Domain & DNS shows SES status: production access, each store's sending domain (DKIM, bounce address) and whether reports are connected. Checked every 6 hours.
- Test emails to the internal test list go out once the domain is verified. Everything else still needs SES production access and the store's sending switch turned on.
- Needs AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY and AWS_SES_REGION (us-east-2) in Railway; the page shows the exact IAM policy to use.

## 4.65.2
- Domain & DNS: Shopify's IPv6 record is labeled, and the record list gets more room on smaller screens.

## 4.65.1
- Domain & DNS works with GoDaddy's new Personal Access Tokens (GODADDY_PAT in Railway). An older key + secret still works too.

## 4.65.0
- **Marketing → Domain & DNS (admins).** Reads each store's GoDaddy DNS records and labels what each one is for (Shopify store, Shopify emails, Google email, Amazon SES, returns portal, unknown). Adds records you approve: paste Amazon's rows or upload its .csv, or tick a ready-made set (SES bounce address on "send", Google SPF). Shows exactly what will change first, and needs a second click to apply.
- It only ever adds. It skips records that are already there and refuses anything that would clash (a second DMARC or SPF record, a CNAME on a name that's in use, an MX on the main domain). Every change is logged and posted to Slack. "Is it live?" checks the public DNS.
- Needs GODADDY_API_KEY and GODADDY_API_SECRET (a Production key from developer.godaddy.com) in Railway.

## 4.64.0
- Marketing emails send from **hello@larkspurbaby.com** (and hello@larkspurbabyoutlet.com), the addresses customers already know, instead of hello@mail.… Replies still go to the same inbox.

## 4.63.0
- **Chat widget on phones: page scrolls again, chat stays still.** Undid the 4.62 page freeze. The open chat is now pinned to the screen by the browser itself (no repositioning while the page scrolls), and its height is set once when it opens, so it no longer twitches when iPhone Safari's toolbar shrinks or grows. The old repositioning is only used when the page is zoomed, wider than the screen, or the keyboard is up.

## 4.62.0
- **Chat widget on phones: no more jumping.** While the chat is open on a phone, the store page behind it is frozen, so swiping the dimmed area or the chat no longer scrolls the page. iPhone Safari's toolbar stays put and the chat sheet doesn't twitch. Closing the chat puts the page back exactly where the customer left it.

## 4.61.0
- Chat launcher bubble is now Larkspur blue (#242F3F) on both stores.

## 4.60.0
- **Chat widget: new launcher icon.** A filled speech bubble with three dots on a soft, light round button. Both stores switched to it (light button, soft teal bubble, 64px). It's also in Chat Studio's icon picker as "dots", and the colors can be changed there like any other icon.

## 4.59.0
- **Returns: refund when a return is lost on the way back.** Once tracking shows USPS accepted the package, Buzzin records that date. If it still isn't delivered back 14 days later, the return is approved and refunded automatically (same refund rules and label fee as a delivered return). The days are editable in Returns → Settings (0 turns it off). If the refund fails, the return goes to Needs attention.
- **Returns: $7.99 fallback label fee.** When a live label quote isn't available, the portal shows $7.99 and that's the most the customer is charged (if the real label ends up cheaper, they pay the lower amount, same as today).

## 4.58.0
- **Marketing, phase 7 — analytics.** New Analytics page (7 days to 12 months, per store or both): store revenue and the part credited to an email or text click, revenue by day, flows vs campaigns vs email vs texts, top-earning campaigns and flows, email health (bounces, spam complaints, unsubscribes against the Gmail/Yahoo limits), new subscribers by day, sign-up form rates, and repeat-purchase cohorts by first-order month.
- Tracking ready for when sending starts: every link becomes a short Buzzin link that records the click and adds utm tags for Shopify; emails get an open pixel. Apple Mail's automatic opens and link-scanner clicks are recorded but marked as machine and left out of open rates, A/B winners and resend-to-non-openers.
- Clicks feed segments and flows ("clicked an email in the last 30 days"), and revenue credit uses the windows in Settings (email 5 days, text 1 day by default).

## 4.57.0
- **Marketing, phase 6 — texting.** New Texting page per store: the name every text starts with, the opt-out line (must mention STOP), editable replies for STOP / HELP / JOIN, optional cost per segment for estimates, a text tester with the segment counter, and a log of every reply.
- "Try a reply": pretend a test-list number texted in, to see the keyword reply, the consent change, or the Buzzin ticket it opens.
- Texting providers (Twilio, Telnyx) are ready to plug in: signed webhooks for incoming texts and delivery updates. The webhook refuses everything until a provider's keys are set and its number is approved. Nothing can be texted yet.

## 4.56.0
- **Marketing, phase 5 — segments and campaigns.** Segments page: build a group with the same rule editor flows use (things they did, profile details, consent, lists, sizes bought, open tickets/claims/returns), see the live count and who's in it, or describe it in plain words and Emily builds it. Recounted every 20 minutes.
- Campaigns: email or text to any mix of lists and segments, with exclusions; people with an open ticket, claim or recent return left out by default; consent required. Live audience count, email preview, text segment counter.
- Timing: right away, a set time, or a set hour in each person's time zone. Smart sending. A/B test 2–4 subject lines, emails or texts on a test group, winner (by opens or clicks) goes to the rest. Resend to people who didn't open, with a new subject.
- Non-admins send a campaign for approval (Slack heads-up); admins approve or schedule. Calendar view of everything scheduled and sent. Copy, unschedule, stop.
- If sending is off when a campaign's time comes, it waits up to 6 hours, then goes back to Draft with a note — it never goes out late. Sending is still off everywhere.

## 4.55.0
- **Marketing, phase 4 — flows.** Flow builder with a step-by-step canvas: emails, texts, waits (with "until 10 AM" and weekdays, in the customer's time zone), wait-for-something, yes/no splits, A/B splits, update profile, add/remove from list, single-use coupon, alert the team, create a Buzzin ticket, webhook. Any step can point at a step that already exists, so paths join and a shared email is written once.
- Starts when someone joins a list, does something (started checkout, placed order, viewed a product, clicked an email…), enters a segment, or a date on their profile comes around (baby's date + 90 days, birthday). Entry rules, exit rules checked before every step, and "only once / once every N days / every time".
- Each email or text step is Draft, Test (internal list only) or Live. Draft/Test/Live/Paused for the whole flow; people already inside keep the version they started on.
- Simulate any real customer to see the exact path and timing without sending; People view to see who's inside and add someone by hand.
- Klaviyo's flows converted to Buzzin drafts (triggers, filters, splits, delays, emails), with duplicate paths merged.
- Segments engine behind the scenes (used by flows now; the Segments page comes next) and text-message basics: segment counter, STOP/HELP/JOIN keywords, replies become tickets.
- Still nothing sends: every send is held until an approved sender is connected.

## 4.54.0
- **Marketing, phase 3 — sign-up forms.** Form Studio: popup, flyout, full-screen-on-phones, banner and embedded forms with steps (email → phone with the required text-consent wording → questions like baby's due date → success with the code), answer-based branching, design, timing (seconds, scroll, exit intent), who sees it (device, new/returning, never to subscribers, days after closing, ad traffic only), pages, priority, teaser tab, and a single-use code per person.
- Forms ride on the script already on the store theme. Draft = Studio only; Preview = only with `?buzzin_form=preview` in the store URL; Live = everyone (admin only). Real Shopify codes are created only for Live forms. Nothing is live.
- Sign-ups record consent with the exact wording shown, join the chosen list, and start any flow that list triggers.
- Optional "Record store activity" (product views, add to cart) per store, off by default.

## 4.53.0
- **Marketing, phase 2 — email.** Email templates built from blocks (logo, heading, text, image, button, products, their cart/viewed items, coupon, countdown, columns, divider, spacer, social, footer, HTML, reusable blocks), any block shown only to certain people, live desktop/phone/dark-mode preview, Emily writes subject lines and copy, image library.
- Brand kits per store (logo, colors, fonts with safe fallbacks, buttons, sender, address, social links); changing one updates every template.
- Klaviyo's 22 templates imported as editable HTML, with Klaviyo tags translated ({% unsubscribe %} and friends).
- Unsubscribe and email-preference pages with one-click unsubscribe; every email gets a footer with the address and unsubscribe link.
- Test sends go through the sending lock: held unless the address is on the internal test list and a sender is connected.

## 4.52.0
- **Marketing, phase 1 — contacts and consent.** New Marketing page (link in the left menu): one profile per person per store, merged from the Klaviyo copy and both Shopify stores (customers and orders since 2023), with email and text consent, a full consent history, engagement tiers, sizes last bought, lists, and that person's customer-service tickets. People Klaviyo "suppressed" to save on billing keep their consent and start as lapsed.
- Sending switches and an internal test list. Nothing can be sent: the switches refuse to turn on until an email sender or texting number is connected and approved.

## 4.51.0
- Klaviyo profiles saved into Buzzin (read-only): every profile with its email and SMS consent, properties and location, plus list and segment memberships. Resumes where it stopped after a restart. Done first because the cancelled Klaviyo account may stop answering.

## 4.50.2
- Klaviyo import: also reads the names of Klaviyo's events (Placed Order, Opened Email…), read-only, so imported flow splits can be shown in plain words.

## 4.50.1
- Klaviyo import: prints each imported flow step by step in the server log once, read from Buzzin's own copy, so the Buzzin versions can be matched exactly.

## 4.50.0
- Klaviyo import (read-only): Buzzin pulls every Klaviyo flow with its full definition (trigger, splits, waits, emails, texts), the email templates those flows use, lists, segments and sign-up forms, so the marketing features can be rebuilt from the real setup. Runs once when KLAVIYO_API_KEY is added; admins can re-run it. Buzzin never changes anything in Klaviyo.

## 4.49.6
- Chat header picture: the exact navy flower from the store's header logo, cut out on its own (served from Buzzin), replacing the wrong logo file.

## 4.49.5
- Chat header picture is the Larkspur flower only (not the full wordmark), and the green "online" dot now sits on the edge of the circle, fully visible.

## 4.49.4
- Chat on phones: the button, greeting and sheet are placed by the part of the page you can actually see, so they can't end up off-screen when the store page is wider than the phone (iPhone does this when something on the page overflows).
- Add ?buzzin_chat=debug to a store URL to see an on-screen status box (loaded, settings, where the button is) — for troubleshooting on a phone.

## 4.49.3
- Chat: "Start over" (link under the message box, shown once a chat has started) clears the conversation, any looked-up order and the portal, and shows the welcome and shortcuts again.

## 4.49.2
- Fix: the chat didn't appear on the live sites. The store theme hides empty <div>s ("div:empty { display: none }"), and the chat's container looks empty from outside. It now uses its own element that the theme can't hide.

## 4.49.1
- The website chat hides the old Gorgias chat bubble while it's showing, so customers only see one chat (Chat Studio → Where it shows → "Hide other chat widgets", on by default).

## 4.49.0
- The returns portal now runs inside the website chat — no new page. Every portal link in the chat opens it in place (with "← Back to chat"): the header "Track or return" button, the AI's buttons ("Start a return", "Edit or cancel my order", "Report a defective item", "Package Protection claim", "Package problem / something else"), and the action buttons on a looked-up order card. It jumps straight to the right option after the customer confirms their checkout email, and the order number is filled in when they've already looked it up in the chat. The chat window widens a little on desktop while the portal is open; on phones it stays in the bottom sheet.
- Portal "embed" mode (?embed=1): just the form, no page header, footer or background; outside links open in a new tab. The portal can be framed only by the store websites.

## 4.48.0
- Shopping assistant in the website chat. Buzzin reads every active product on each store (description, fabric and features, price and sale price, sizes in stock, rating) plus the store's pages, and turns each product's size-chart image into text once. It refreshes a few minutes after start and every 6 hours (Chat Studio → AI helper → "Update now").
- The chat finds the products that match each question (and the product the shopper is looking at), recommends sizes from the real size chart, and shows up to 3 product cards (photo, price / sale price, sizes in stock, View). With no direct match it suggests popular in-stock items.
- New default shortcuts: "Help me pick a size", "Find a gift"; new welcome line. Toggle: Chat Studio → AI helper → Shopping assistant.
- Email Emily gets the same product knowledge (product_info tool) for product, sizing and fabric questions.
- Fix: order-lookup form and product cards now show when the AI asks for them.

## 4.47.0
- Chat order lookup: customers enter their order number + billing ZIP (shipping ZIP if the order has no billing address) and get an order card — status, items, tracking with the latest scan, delivery date, and what they can do next (edit / cancel window, return-by date, defect or Package Protection claim) with a link to the portal. After that the AI can answer follow-ups about that order ("when will it arrive?"). Read-only: no email, street address or payment details, and no changes from chat.
- When someone asks about their order, the AI shows the lookup form instead of saying it can't see orders. New shortcut type "Order lookup" (default: "Track my order").
- Security: a wrong number or ZIP gets the same "don't match" message (it never says whether the order exists); 5 wrong tries lock lookup for that chat, and there's a per-device hourly limit. Toggle: Chat Studio → AI helper → Order lookup.

## 4.46.2
- Browser tab icons: Email Studio, Chat widget and Portal Studio now show the Buzzin bee (icon links versioned so browsers drop the old cached icon); the studio title bars use the bee too.

## 4.46.1
- Chat on phones now opens as a sheet from the bottom (82% tall, page dimmed behind it, tap outside to close) instead of covering the whole screen. Full screen is still an option (Chat button → "On phones, the chat opens as"), and the sheet height is adjustable.
- Header button in the chat window ("Track or return" → returns portal by default; label and link editable).
- New default shortcut: "How do I pick the right size?".

## 4.46.0
- Website chat widget for Larkspur Baby and the Outlet. A chat bubble on the store website with an AI helper that only guides: it answers from the FAQ page and the return / claim rules and sends people to the right place (mostly the returns portal and the exact option to pick). It can't see orders and never promises refunds, credits, replacements or exceptions. "Email our team" turns the chat into a Buzzin ticket (tag "chat") with the conversation attached, and Emily drafts the reply.
- Chat Studio (Content → Website chat): customise everything per store with a live desktop / mobile preview — button icon (or your own image), text, colors, size, corners, position and gaps, greeting pop-up and auto-open, window size, font, every color, header title / picture, all wording, shortcut buttons, the links the AI may show, the "Email our team" form, AI tone, extra knowledge and instructions, message limit, pages to hide / show on, and custom CSS. Read every conversation. "Add to website" puts one line in the live theme; nothing shows until "Show the chat on the website" is on. "Preview on the live site" shows it only to you.

## 4.45.1
- No double payouts from old cards: when a ticket is redrafted, or a newer draft is sent, any action still waiting from an older draft (e.g. a $24.99 credit next to the corrected $22.74 one) is retired. Its Slack card says "Replaced by a newer draft", and Apply on an old card does nothing. Existing leftovers were cleaned up once.

## 4.45.0
- Store credit now includes sales tax, the same as returns and refunds. Emily's store-credit tool takes the order + items (and a percent, e.g. 50%) and prices them at what the customer actually paid — after discounts, plus that item's tax — instead of Emily typing an amount. The Slack card shows the math (e.g. "1× Pajamas $22.74 = $21.00 + $1.74 tax"). Order lookups now show each item's paid price, tax and total.
- Claims: the claim value (what store credit and refunds pay) now includes the items' sales tax. Open claims filed before this get their tax added automatically; staff see "incl. $X tax". The portal's claim estimate includes tax too.

## 4.44.7
- FAQs give customers without Package Protection their time limits: report "marked delivered" or "arrived damaged" within 5 days of delivery (7 days with Package Protection); "hasn't arrived" opens 14 days after shipping for everyone. Outcomes stay unwritten ("our team will review it"). Every 7-day limit is labeled as the Package Protection limit. The lost/stolen answer now covers packages still in transit / not arrived, marked delivered, and damaged. Emily will ask in Slack before publishing.

## 4.44.6
- FAQ facts: every answer about a late, lost or damaged package names the exact portal option ("My package hasn't arrived", etc.).

## 4.44.5
- FAQs explain the portal's "My package hasn't arrived" option (and the other shipping options) wherever it applies — delayed orders and lost packages: when it opens (14 days after shipping), and where it is (under "Package Protection claim", or "Other" for orders without it). No outcomes are written down for orders without Package Protection.

## 4.44.4
- FAQs no longer describe anything for orders without Package Protection (no windows, no carrier-claim steps, no refund rules) — those are handled case by case. Emily removes that wording and only points to "Other" in the portal. She'll ask in Slack before publishing.

## 4.44.3
- FAQ tone: mom-friendly — clear, warm and empathetic. No internal words ("tagged", tag names, system names). "What can't be returned?" now says items marked Final Sale and no longer mentions Package Protection. Emily will ask in Slack before publishing.

## 4.44.2
- FAQ "What if my order is delayed?": Emily's facts now spell out when a delay becomes a claim (14 days after shipping with no delivery), which portal option to pick with and without Package Protection, and that the portal shows the date the claim opens if it's too early. She'll ask in Slack before publishing.

## 4.44.1
- FAQ formatting fix: the store theme shows numbered lists as "1TH, 2TH…" and hides bullets. Lists in FAQ answers are now written as plain numbered lines (1., 2.) and • bullets, Emily no longer uses lists, and every live answer that still has one is sent for approval as a formatting-only fix (same words).

## 4.44.0
- Claims go live: every claim and order edit made during testing is hidden from Claims & edits (lists, tab counts, Home). Nothing is deleted. The screen shows "Showing claims from …", and admins have a "Clear claims" button to do it again.

## 4.43.1
- FAQ facts: photo limits (at least 1, up to 8) and a plain "defective vs. arrived damaged" explanation with both windows side by side; clearer edit vs. cancel wording. Emily will ask in Slack before publishing.

## 4.43.0
- Website FAQs, full coverage: Emily now knows every limit and step Buzzin runs — return window (from delivery), what you need, the steps, label and weight-based fee, drop-off deadline and reminder, refunds (timing, methods, what's refunded), cancelling a return, what can't be returned, defective items (window, photos, keep the item, options), Package Protection claims (hasn't arrived, marked delivered, arrived damaged), orders without PP, and editing or cancelling an order.
- She makes sure each of these has a friendly, plain answer with the real numbers in bold and short numbered steps, and can add a NEW question when nothing on the page covers a topic. New questions show in Buzzin → Content → Website FAQs (question and answer editable) and in the Slack card. Nothing is published until someone approves.

## 4.42.0
- Return label fee is now based on weight: the fee is the real price of the prepaid label for the package (packaging + each item's weight). The returns portal gets a live ShipStation quote once the customer picks items and confirms their address, shows it as "Return shipping label · Based on your package weight", and updates the refund totals. Changing the address re-quotes before they can confirm.
- The customer is never charged more than the price they were shown (signed quote). If a live quote can't be fetched, the flat fee is used as the fallback.
- Returns → Settings: "Return label fee" choice — Based on weight (default) or Flat fee. Goodwill "label fee" exceptions and the store-credit rule work the same way.
- Emily's policy text says the fee is weight-based and shown in the portal (never a fixed amount). The FAQ facts changed too, so Emily will post LB and LBO FAQ updates to Slack for approval — nothing is published until you click Apply.

## 4.41.0
- Portal first: when a customer asks for something the self-serve portal does (change a size or address, cancel before shipping, start a return, defective item, Package Protection or delivery claim), Emily replies with the exact option to pick and the brand's portal link, sends it, and closes the ticket (it reopens if they reply). Every one posts a "Sent automatically · ticket closed" card in Slack. Not used when the customer is upset, outside the window, needs an exception, or the portal didn't work for them — those still go to approval. A portal reply that someone approves by hand also closes the ticket. Toggle: Settings → Emily → "Send portal answers and close the ticket" (on).

## 4.40.2
- Emily's FAQ check: room for longer answers (the first run cut off mid-reply) and a clearer log line if her reply can't be read.

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
