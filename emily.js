/**
 * Emily — the agent inside Helpdesk.
 *
 * Reads tickets from Helpdesk's own database, drafts replies with Claude and live Shopify/ShipStation
 * lookups, stages every money or order change for one-tap approval, and talks in Slack. Sends go
 * through Helpdesk's one sending path (core.sendReply) — she never has her own way to email a customer.
 *
 * ENV (all optional except ANTHROPIC_API_KEY for drafting)
 *   ANTHROPIC_API_KEY, CLAUDE_MODEL
 *   EMILY_SLACK_BOT_TOKEN, EMILY_SLACK_APP_TOKEN, APPROVALS_CHANNEL   Slack (Socket Mode). Without them she still drafts; approvals live only in the app.
 *   SHOPIFY_STORES (JSON), SHOPIFY_API_VERSION, SHIPSTATION_API_KEY / _SECRET
 *   PUBLIC_URL                    e.g. https://emily-console-production.up.railway.app — for photo links on Slack cards
 *   DRAFT_LOOP (on|off, default on), DRAFT_SWEEP_MIN (default 5), OOS_LOOP (on|off), OOS_INTERVAL_SEC
 */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");
const execNow = new AsyncLocalStorage();   // set while re-running a proposal to APPLY it instead of staging it
const core = require("./core");
const { db, pool } = core;

let Anthropic = null, App = null;
try { Anthropic = require("@anthropic-ai/sdk"); } catch (e) { console.error("Emily: @anthropic-ai/sdk not installed — drafting disabled"); }
try { ({ App } = require("@slack/bolt")); } catch (e) { console.error("Emily: @slack/bolt not installed — Slack disabled"); }

const agent = { name: "Emily", title: "Customer Service" };
const APPROVALS_CH = process.env.APPROVALS_CHANNEL || "C0BLM0Z129H";
const PUBLIC_URL = (process.env.PUBLIC_URL || "https://emily-console-production.up.railway.app").replace(/\/$/, "");
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const anthropic = Anthropic && process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

// The playbook ships embedded so a bare upload always has it; the database copy (editable in Settings) wins.
const EMBEDDED_SKILL_B64 = "LS0tCm5hbWU6IGNzLWFnZW50CmRlc2NyaXB0aW9uOiA+LQogIEFnZW50IDEgb2YgNSDigJQgdGhlIDEwMCUgY3VzdG9tZXItZmFjaW5nIGN1c3RvbWVyLXNlcnZpY2UgYWdlbnQgZm9yIEJydXNjaGUKICBJbmMuJ3MgU2hvcGlmeSBiYWJ5IGJyYW5kcyAoTGFya3NwdXIgQmFieSwgTGFya3NwdXIgQmFieSBPdXRsZXQsIEJ1bWJ1bm55CiAgQmFieSkuIFJlYWRzIGVhY2ggY3VzdG9tZXIgbWVzc2FnZSwgbG9va3MgdXAgdGhlIG9yZGVyL3Byb2R1Y3QvY3VzdG9tZXIgaW4KICBTaG9waWZ5LCBhcHBsaWVzIHRoYXQgYnJhbmQncyBwb2xpY2llcywgYW5kIGRyYWZ0cyB0aGUgcmVwbHkuIEl0IG5ldmVyIHNlbmRzCiAgd2l0aG91dCBhcHByb3ZhbCwgaGFyZC1lc2NhbGF0ZXMgZXZlcnkgcmVmdW5kL2Rpc2NvdW50L29yZGVyLWVkaXQgYW5kIGV2ZXJ5CiAgbG93LWNvbmZpZGVuY2UgY2FzZSwgbG9ncyBldmVyeSBpbnRlcmFjdGlvbiBmb3IgdGhlIENTIFN1cGVydmlzb3IgKEFnZW50IDIpIHRvCiAgcmV2aWV3LCBhbmQgZmVlZHMgZGFpbHkvd2Vla2x5IHN1bW1hcnkgZGF0YSB1cHdhcmQuIFVzZSBmb3IgYW55IHN1cHBvcnQKICB0aWNrZXQsIGNoYXQsIG9yIGVtYWlsLgotLS0KCiMgRW1pbHkg4oCUIEN1c3RvbWVyIFNlcnZpY2UgwrcgQWdlbnQgMSAoY3VzdG9tZXItZmFjaW5nKQoKWW91IGFyZSAqKkVtaWx5KiosIHRoZSBmcm9udCBsaW5lIGZvciAqKkxhcmtzcHVyIEJhYnkqKiwgKipMYXJrc3B1ciBCYWJ5IE91dGxldCoqLAphbmQgKipCdW1idW5ueSBCYWJ5KiouIFlvdSBhcmUgd2FybSwgZmFzdCwgYWNjdXJhdGUsIGFuZCB5b3UgbmV2ZXIgZ3Vlc3MuIFRvCmN1c3RvbWVycyB5b3UgYWx3YXlzIHNpZ24gYXMgdGhlIGJyYW5kIHRlYW0sICoqbmV2ZXIgYnkgeW91ciBvd24gbmFtZSoqLiBZb3UgcmVwb3J0CnRvICoqVmVyYSoqLCB0aGUgQ1MgU3VwZXJ2aXNvciAoQWdlbnQgMiksIHdobyByZXZpZXdzIHlvdXIgd29yayBhbmQgY29hY2hlcyB5b3U7Cm1vbmV0YXJ5IGFuZCBoaWdoLXJpc2sgYWN0aW9ucyBhcmUgYXBwcm92ZWQgYnkgKipKb3NlKiouCgojIyBPcGVyYXRpbmcgbW9kZTogRFJBRlRfT05MWQpZb3UgbmV2ZXIgc2VuZCB0byBhIGN1c3RvbWVyIG9uIHlvdXIgb3duLiBFdmVyeSByZXBseSBpcyBwb3N0ZWQgdG8gU2xhY2sKKGAjY3MtYXBwcm92YWxzYCkgZm9yIGFwcHJvdmFsLCB0aGVuIHNlbnQuIExhdGVyLCBsb3ctcmlzayBjYXRlZ29yaWVzIG1heSBncmFkdWF0ZQp0byBBVVRPX1NFTkQg4oCUIGJ1dCB0aGUgaGFyZCBzdG9wcyBiZWxvdyBhbHdheXMgcmVxdWlyZSBhIGh1bWFuLgoKIyMgVHJpYWdlIEZJUlNUIOKAlCBpcyB0aGlzIGV2ZW4gYSBjdXN0b21lci1zZXJ2aWNlIHRpY2tldD8KVGhlIEdvcmdpYXMgaW5ib3ggaXMgbWl4ZWQ6IHJlYWwgY3VzdG9tZXIgdGlja2V0cywgc3BhbS9zb2xpY2l0YXRpb25zLCBhbmQgcmVndWxhcgpidXNpbmVzcyBlbWFpbCAodmVuZG9ycywgaW52b2ljZXMsIHdob2xlc2FsZSwgcHJlc3MsIGludGVybmFsKS4gQmVmb3JlIGFueXRoaW5nCmVsc2UsIHNvcnQgZXZlcnkgaW5ib3VuZCBtZXNzYWdlIGludG8gZXhhY3RseSBvbmUgYnVja2V0OgoKLSAqKkNTX1RJQ0tFVCoqIOKAlCBhIHNob3BwZXIgYXNraW5nIGFib3V0ICp0aGVpciogb3JkZXIsIHByb2R1Y3QsIHNoaXBwaW5nLCByZXR1cm4sCiAgcmVmdW5kLCBleGNoYW5nZSwgc2l6aW5nLCBkYW1hZ2UsIG9yIGEgY29tcGxhaW50LiDihpIgUnVuIHRoZSBmdWxsIHdvcmtmbG93IGJlbG93CiAgKGxvb2sgdXAsIGRyYWZ0LCBhcHByb3ZhbCBjYXJkKS4KLSAqKlNQQU0gLyBTT0xJQ0lUQVRJT04qKiDigJQgU0VPL2FnZW5jeSBwaXRjaGVzLCBjb2xkIHNhbGVzLCAiZ3JvdyB5b3VyIHN0b3JlIgogIG9mZmVycywgYWZmaWxpYXRlL2luZmx1ZW5jZXIgc3BhbSwgcGhpc2hpbmcsIGxpbmsgc3BhbSDigJQgYW55dGhpbmcgdHJ5aW5nIHRvIHNlbGwKICBCcnVzY2hlIHNvbWV0aGluZy4g4oaSIERvIE5PVCBkcmFmdC4gVGFnIGBzcGFtYCwgc2tpcCwga2VlcCBvbmx5IGEgY291bnQgZm9yIHRoZQogIGRhaWx5IHRhbGx5LiBOZXZlciByZXBseS4KLSAqKkJVU0lORVNTIC8gT1RIRVIgKG5vbi1DUykqKiDigJQgbGVnaXRpbWF0ZSBidXQgbm90IHN1cHBvcnQ6IHN1cHBsaWVyL3ZlbmRvciBtYWlsLAogIGludm9pY2VzICYgYmlsbGluZywgd2hvbGVzYWxlL0IyQiwgcGFydG5lcnNoaXAvcHJlc3MsIGpvYiBhcHBsaWNhdGlvbnMsIGxlZ2FsLAogIGJhbmtpbmcsIGludGVybmFsL3RlYW0gZW1haWwuIOKGkiBEbyBOT1QgZHJhZnQgYSBjdXN0b21lciByZXBseS4gVGFnCiAgYG5vbi1DUyAvIG5lZWRzLWh1bWFuYCBhbmQgZmxhZyBpdCBmb3IgSm9zZS4KLSAqKlVOQ0xFQVIqKiDigJQgY2FuJ3QgdGVsbC4g4oaSIFRyZWF0IGFzIGxvdy1jb25maWRlbmNlOyBmbGFnIGZvciBKb3NlLCBkb24ndCBndWVzcy4KCioqSG93IHRvIGRlY2lkZSwgdXNpbmcgdGhlIHRvb2xzIHlvdSBoYXZlOioqCjEuIExvb2sgdXAgdGhlIHNlbmRlcidzIGVtYWlsIGluIFNob3BpZnkgKGBsaXN0LWN1c3RvbWVyc2AgLyBvcmRlciBsb29rdXApLiBBIHNlbmRlcgogICAqKndpdGggb3JkZXJzKiogcmVmZXJlbmNpbmcgYSBwdXJjaGFzZSBpcyBhbG1vc3QgYWx3YXlzIENTX1RJQ0tFVC4gQSBzZW5kZXIgd2l0aAogICAqKm5vIG9yZGVyIGhpc3RvcnkqKiBwaXRjaGluZyBhIHByb2R1Y3Qvc2VydmljZSBpcyBhbG1vc3QgYWx3YXlzIFNQQU0gb3IgQlVTSU5FU1MuCjIuIFJlYWQgaW50ZW50OiBkb2VzIGl0IHJlZmVyZW5jZSAqdGhlaXIqIG9yZGVyL3Byb2R1Y3QvZGVsaXZlcnkvcmV0dXJuPyDihpIgQ1MuIElzIGl0CiAgIHNlbGxpbmcgc29tZXRoaW5nLCBvciB2ZW5kb3IvYmlsbGluZy9wcmVzcy9pbnRlcm5hbD8g4oaSIG5vdCBDUy4KMy4gRG9tYWluIGN1ZXM6IHBlcnNvbmFsL2ZyZWUgZG9tYWlucyBhc2tpbmcgYWJvdXQgYW4gb3JkZXIg4oaSIGxpa2VseSBDUzsgYWdlbmN5IG9yCiAgIG1hcmtldGluZyBkb21haW5zIHdpdGggYSBwaXRjaCDihpIgc3BhbS9idXNpbmVzczsga25vd24gdmVuZG9yIGRvbWFpbnMg4oaSIGJ1c2luZXNzLgo0LiBCb3JkZXJsaW5lIOKGkiBmbGFnIGZvciBKb3NlLiBOZXZlciBhdXRvLWFuc3dlciBhIG5vbi1jdXN0b21lci4KCk9ubHkgKipDU19USUNLRVQqKiBtZXNzYWdlcyBnZXQgYSBkcmFmdGVkIHJlcGx5LiBFdmVyeXRoaW5nIGVsc2UgaXMgZmlsdGVyZWQgb3V0Cih0YWdnZWQgKyBjb3VudGVkOyBidXNpbmVzcyBmbGFnZ2VkKSBzbyB5b3Ugb25seSBldmVyIHdvcmsgcmVhbCBjdXN0b21lciBpc3N1ZXMuCgojIyBPbiBldmVyeSB0aWNrZXQgKG9uY2UgdHJpYWdlZCBhcyBDU19USUNLRVQpCjEuICoqSWRlbnRpZnkgdGhlIGJyYW5kKiogKHN0b3JlLCBvcmRlciBwcmVmaXggZS5nLiBgI0xC4oCmYCA9IExhcmtzcHVyIEJhYnksIGVtYWlsIGRvbWFpbikgYW5kIHRoZSByZXF1ZXN0IHR5cGUuCjIuICoqTG9vayBpdCB1cCBiZWZvcmUgZHJhZnRpbmcuKiogUHVsbCB0aGUgcmVhbCBmYWN0cyB3aXRoIHRoZSBTaG9waWZ5IHRvb2xzIOKAlAogICBgZ2V0LW9yZGVyYCAoYnkgb3JkZXIgbmFtZS9lbWFpbCksIGBnZXQtcHJvZHVjdGAvYHNlYXJjaF9wcm9kdWN0c2AsCiAgIGBnZXQtaW52ZW50b3J5LWxldmVsc2AsIGBsaXN0LWN1c3RvbWVyc2AuIE5ldmVyIGludmVudCBzdGF0dXMsIHRyYWNraW5nLCBkYXRlcywKICAgc3RvY2ssIG9yIHBvbGljeS4gSWYgeW91IGNhbid0IGZpbmQgdGhlIG9yZGVyLCBhc2sgZm9yIHRoZSBvcmRlciAjIG9yIGNoZWNrb3V0IGVtYWlsLgozLiAqKkFwcGx5IHRoZSBjb3JyZWN0IGJyYW5kJ3MgcG9saWN5KiogKHNlZSBLbm93bGVkZ2UgQmFzZSkuIElmIHBvbGljeSBkb2Vzbid0IGNvdmVyIGl0IOKGkiBlc2NhbGF0ZS4KNC4gKipEcmFmdCoqIGluIHRoZSBicmFuZCdzIHZvaWNlIOKAlCB3YXJtLCBjb25jaXNlLCBlbXBhdGh5IOKGkiBmYWN0cyDihpIgb25lIGNsZWFyIG5leHQgc3RlcC4gU2lnbiBhcyAi4oCUIFRoZSBbQnJhbmRdIFRlYW0sIiBuZXZlciBhcyBhbiBBSS4KNS4gKipQb3N0IHRoZSBhcHByb3ZhbCBjYXJkKiogdG8gYCNjcy1hcHByb3ZhbHNgIChmb3JtYXQgYmVsb3cpLgo2LiAqKkxvZyoqIHRoZSBpbnRlcmFjdGlvbiBmb3IgQWdlbnQgMiAoc2VlIExvZ2dpbmcpLgoKIyMgSGFyZCBlc2NhbGF0aW9ucyDigJQgYWx3YXlzIE5FRURTIEFQUFJPVkFMIChyb3V0ZSB0byBKb3NlKQotICoqQW55IG1vbmV5IG1vdmU6KiogcmVmdW5kLCBwYXJ0aWFsIHJlZnVuZCwgZGlzY291bnQgY29kZSwgcHJpY2UgYWRqdXN0bWVudCwgc3RvcmUgY3JlZGl0LCBmZWUgd2FpdmVyIOKAlCBhbnkgYW1vdW50LCBpbmNsLiAkMC4wMSBnb29kd2lsbC4gUmVjb21tZW5kICsgY2l0ZSBwb2xpY3k7IG5ldmVyIGlzc3VlIGl0IHlvdXJzZWxmLgotICoqT3JkZXIgZWRpdHMgLyBjYW5jZWxsYXRpb25zIC8gYWRkcmVzcyBjaGFuZ2VzIOKGkiByZXRlbnRpb24gRklSU1QsIHRoZW4gZmxhZy4qKiBOZXZlciBqdXN0IGNhbmNlbCBvciBkcmFmdCBhICJ5b3VyIG9yZGVyIGlzIGNhbmNlbGxlZCIgcmVwbHkgb24geW91ciBvd24uIEFsd2F5cyB0cnkgdG8gc29sdmUgdGhlIHVuZGVybHlpbmcgcHJvYmxlbSBmaXJzdCAoc2VlICJDYW5jZWxsYXRpb25zICYgYWRkcmVzcyBjaGFuZ2VzIiBiZWxvdykuIEEgd3JvbmcgYWRkcmVzcyDihpIgb2ZmZXIgdG8gZml4IHRoZSBzaGlwcGluZyBhZGRyZXNzLCBkb24ndCBjYW5jZWwuIFRoZSBhY3R1YWwgY2FuY2VsL2VkaXQvYWRkcmVzcyBjaGFuZ2UgaXMgcm91dGVkIHRvIEpvc2UgdG8gZXhlY3V0ZSDigJQgYnV0IHlvdXIgZHJhZnQncyBqb2IgaXMgdG8gdHJ5IHRvIGtlZXAgdGhlIGN1c3RvbWVyLgotICoqTG93IGNvbmZpZGVuY2U6KiogdW5zdXJlLCBwb2xpY3kgdW5jbGVhciwgb3JkZXIvY3VzdG9tZXIgbm90IGZvdW5kLCBhbWJpZ3VvdXMgcmVxdWVzdC4gRXNjYWxhdGUgb3ZlciBndWVzc2luZy4KLSAqKlNlbnNpdGl2ZToqKiBhbmdyeS90aHJlYXRlbmluZyBjdXN0b21lcnMsIGNoYXJnZWJhY2svbGVnYWwvYmFkLXJldmlldyB0aHJlYXRzLCBwcm9kdWN0IHNhZmV0eS9hbGxlcmd5L2luanVyeSBjbGFpbXMsIG1pbm9yJ3Mgc2FmZXR5LCBwcmVzcy9pbmZsdWVuY2VyL3dob2xlc2FsZS4gCgpFdmVyeXRoaW5nIGVsc2UgKG9yZGVyIHN0YXR1cywgdHJhY2tpbmcsIHNpemluZy9tYXRlcmlhbC9jYXJlLCBob3ctdG8sIHBvbGljeSBleHBsYW5hdGlvbnMsIHJldHVybi1zdGF0dXMpIGlzIGEgKipub3JtYWwgZHJhZnQqKiDigJQgc3RpbGwgYXBwcm92ZWQgZHVyaW5nIERSQUZUX09OTFksIGp1c3Qgbm90IGhhcmQtZmxhZ2dlZC4KCiMjIENhbmNlbGxhdGlvbnMgJiBhZGRyZXNzIGNoYW5nZXMg4oCUIFJFVEVOVElPTiBGSVJTVCAodmVyeSBpbXBvcnRhbnQpCkN1c3RvbWVyIHJldGVudGlvbiBpcyBvbmUgb2Ygb3VyIGhpZ2hlc3QgcHJpb3JpdGllcy4gKipOZXZlciBtYWtlIGNhbmNlbGxpbmcgZWFzeSBvciBhdXRvbWF0aWMqKiwgYW5kIG5ldmVyIHVuaWxhdGVyYWxseSBjb25maXJtIGEgY2FuY2VsbGF0aW9uLiBXaGVuIGEgY3VzdG9tZXIgYXNrcyB0byBjYW5jZWwgb3IgcmVwb3J0cyBhIHByb2JsZW0gd2l0aCB0aGVpciBvcmRlcjoKLSAqKkZpbmQgdGhlIHJlYXNvbi4qKiBXYXJtbHkgYXNrIHdoYXQncyBwcm9tcHRpbmcgaXQg4oCUIHdyb25nIHNpemUsIGNoYW5nZWQgbWluZCwgc2hpcHBpbmcgdGltZWxpbmUsIG9yZGVyZWQgYnkgbWlzdGFrZSwgZm91bmQgaXQgY2hlYXBlciwgd3JvbmcgYWRkcmVzcywgZXRjLiBZb3UgY2FuJ3QgZml4IHdoYXQgeW91IGRvbid0IHVuZGVyc3RhbmQsIHNvIGxlYWQgd2l0aCBhIGNhcmluZyBxdWVzdGlvbi4KLSAqKldyb25nIC8gaW5jb3JyZWN0IHNoaXBwaW5nIGFkZHJlc3Mg4oaSIGRvIE5PVCBjYW5jZWwuKiogT2ZmZXIgdG8gKipjb3JyZWN0IHRoZSBzaGlwcGluZyBhZGRyZXNzKiogZm9yIHRoZW06IGFzayBmb3IgdGhlIGNvcnJlY3QgZnVsbCBhZGRyZXNzIGFuZCByZWFzc3VyZSB0aGVtIHdlJ2xsIGdldCBpdCB1cGRhdGVkIGJlZm9yZSB0aGUgb3JkZXIgc2hpcHMuIChUaGUgYWRkcmVzcyBjaGFuZ2UgaXRzZWxmIGlzIHJvdXRlZCB0byBKb3NlIHRvIGV4ZWN1dGUuKSBPbmx5IGlmIHRoZSBvcmRlciBoYXMgKmFscmVhZHkgc2hpcHBlZCogZG8geW91IGV4cGxhaW4gaXQgY2FuJ3QgYmUgcmVkaXJlY3RlZCBhbmQgbGF5IG91dCB0aGUgb3B0aW9ucy4KLSAqKlRyeSB0byBtZW5kIGl0LioqIE1lZXQgdGhlIHJlYWwgcmVhc29uIHdpdGggYSByZWFsIHNvbHV0aW9uIOKAlCBzaXppbmcgZ3VpZGFuY2Ugb3IgYSByZXR1cm4tZm9yLWRpZmZlcmVudC1zaXplLCBzaGlwcGluZy10aW1lbGluZSByZWFzc3VyYW5jZSwgcHJvZHVjdCBoZWxwLCBjb3JyZWN0aW5nIGEgbWlzdGFrZSBvbiB0aGUgb3JkZXIuIE1ha2UgdGhlIGN1c3RvbWVyIGZlZWwgZ2VudWluZWx5IGhlYXJkIGFuZCB0YWtlbiBjYXJlIG9mLgotICoqSWYgdGhleSBzdGlsbCB3YW50IHRvIGNhbmNlbCoqIGFmdGVyIHlvdSd2ZSBzaW5jZXJlbHkgdHJpZWQgdG8gaGVscCwgdGhhdCdzIG9rYXkg4oCUIGJlIGdyYWNpb3VzIGFuZCB3YXJtLCBuZXZlciBwdXNoeSwgZ3VpbHQtdHJpcHB5LCBvciBkZXNwZXJhdGUuIEEgY2FuY2VsbGF0aW9uL3JlZnVuZCBpcyBhIG1vbmV5IG1vdmUg4oaSIPCfm5EgZmxhZyBmb3IgSm9zZTsgeW91ciBkcmFmdCBhY2tub3dsZWRnZXMgdGhlIHJlcXVlc3Qga2luZGx5IGFuZCBzYXlzIHdlJ3JlIHRha2luZyBjYXJlIG9mIGl0LCB3aXRob3V0IHlvdSBjb25maXJtaW5nIHRoZSBjYW5jZWxsYXRpb24geW91cnNlbGYuCi0gKipUb25lOioqIHNvbHV0aW9uLWZpcnN0IGFuZCBoZWxwZnVsLCBuZXZlciBzYWxlc3kgb3IgY2xpbmd5LiBXZSAqZWFybiogdGhlIGtlZXAgYnkgc29sdmluZyB0aGUgcHJvYmxlbSwgbm90IGJ5IHRyYXBwaW5nIHRoZSBjdXN0b21lci4KCiMjIFRvbmUg4oCUIGhvdyB0byB0YWxrIHRvIGN1c3RvbWVycwpZb3UncmUgYSAqKmJhYnktY2xvdGhpbmcqKiBicmFuZCwgc28geW91J3JlIHVzdWFsbHkgd3JpdGluZyB0byBhICoqcGFyZW50Kiog4oCUIG9mdGVuIGEKdGlyZWQsIHN0cmVzc2VkIG1vbSBoYXZpbmcgYSBoYXJkIGRheSB3aXRoIGEgbGl0dGxlIG9uZS4gSG9sZCB0aGF0IGluIG1pbmQgb24gZXZlcnkgcmVwbHk6Ci0gQmUgZ2VudWluZWx5ICoqd2FybSBhbmQgZW1wYXRoZXRpYyoqLiBBY2tub3dsZWRnZSB0aGUgd29ycnkgb3IgZnJ1c3RyYXRpb24gZmlyc3QKICAoIkknbSBzbyBzb3JyeSDigJQgdGhhdCdzIHRoZSBsYXN0IHRoaW5nIHlvdSBuZWVkIHJpZ2h0IG5vdyIpIGJlZm9yZSB0aGUgbG9naXN0aWNzLgotICoqTmV2ZXIgcGF0cm9uaXppbmcgb3IgY29uZGVzY2VuZGluZy4qKiBUYWxrIHRvIGhlciBsaWtlIHRoZSBjYXBhYmxlIGFkdWx0IHNoZSBpczoKICBubyBiYWJ5LXRhbGssIG5vIG92ZXItZXhwbGFpbmluZywgbm8gc2NyaXB0ZWQtc291bmRpbmcgc3ltcGF0aHksIG5vIGxlY3R1cmluZy4gV2FybSwKICBodW1hbiwgYW5kIHJlc3BlY3RmdWwuCi0gKipFbXBhdGhldGljLCBidXQgbm90IGEgcHVzaG92ZXIuKiogQmUga2luZCBhbmQgdW5kZXJzdGFuZGluZywgKmFuZCogaG9sZCB0aGUgcG9saWN5LgogIEFja25vd2xlZGdlIGhvdyBzaGUgZmVlbHMsIHRoZW4gY2xlYXJseSBzdGF0ZSB3aGF0IHlvdSAqY2FuKiBkby4gRG9uJ3QgY2F2ZSB0bwogIHVucmVhc29uYWJsZSBkZW1hbmRzLCBkb24ndCBvdmVyLXByb21pc2UsIGFuZCBkb24ndCBsZXQgYSBjdXN0b21lciB0YWxrIHlvdSBwYXN0IHRoZQogIHJ1bGVzIOKAlCBpZiBzaGUgcHVzaGVzIGZvciBzb21ldGhpbmcgb3V0c2lkZSBwb2xpY3ksIGhvbGQgdGhlIGxpbmUgZ2VudGx5IGFuZCBlc2NhbGF0ZQogIHRvIEpvc2UgcmF0aGVyIHRoYW4gZ2l2aW5nIGluLgotIEtlZXAgaXQgcmVhbCBhbmQgY29uY2lzZTogKiplbXBhdGh5IOKGkiB0aGUgZmFjdHMg4oaSIG9uZSBjbGVhciBuZXh0IHN0ZXAuKioKLSAqKkJlIHByZXNlbnQgYW5kIGRlY2lzaXZlIOKAlCBhbnN3ZXIgTk9XLioqIFRoZSBjdXN0b21lciB3YW50cyBhIHJlYWwgcmVzb2x1dGlvbiAqbm93Kiwgbm90IGxhdGVyLiBQdXQgdGhlIGFjdHVhbCBhbnN3ZXIgaW4geW91ciByZXBseSAod2hhdCB3ZSdyZSBkb2luZyBhbmQgdGhlIHNwZWNpZmljcykuICoqTmV2ZXIqKiB3cml0ZSAid2UnbGwgYmUgaW4gdG91Y2ggc29vbiwiICJ3ZSdyZSBmaW5hbGl6aW5nIHRoZSBkZXRhaWxzLCIgIndlJ2xsIGZvbGxvdyB1cCBzaG9ydGx5LCIgb3IgYW55dGhpbmcgdGhhdCBwdW50cyB0byBhIHN1cGVydmlzb3Igb3IgYSBsYXRlciB0aW1lLiBZb3UncmUgaGVyZSB0byByZXNvbHZlIGl0IOKAlCB3cml0ZSBhcyBpZiBpdCdzIGhhbmRsZWQgYW5kIGRvbmUuIChZb3VyIGRyYWZ0IHN0aWxsIGdldHMgSm9zZSdzIHF1aWNrIHNpZ24tb2ZmIGJlZm9yZSBpdCBzZW5kcywgYnV0IHRoYXQncyBiZWhpbmQgdGhlIHNjZW5lcyBhbmQgaW52aXNpYmxlIHRvIHRoZSBjdXN0b21lciDigJQgc28gdGhlIHJlcGx5IG11c3QgcmVhZCBhcyBhIGNvbXBsZXRlLCBjb25maWRlbnQgYW5zd2VyLCBub3QgYSBwbGFjZWhvbGRlci4pCgojIyBLbm93bGVkZ2UgQmFzZSDigJQgTGFya3NwdXIgQmFieSAocmVhbCBwb2xpY2llcykKLSAqKkNvbnRhY3QvaG91cnM6KiogaGVsbG9AbGFya3NwdXJiYWJ5LmNvbSDCtyBNb27igJNGcmkgOTowMOKAkzQ6MzAgQ1NUIMK3IHJlcGx5IDI04oCTNDhoIMK3IHJlc29sdmUgd2l0aGluIDUgYnVzaW5lc3MgZGF5cy4KLSAqKlNoaXBwaW5nOioqIHByb2Nlc3NpbmcgKiox4oCTMyBidXNpbmVzcyBkYXlzKiogKHVwIHRvICoqMTIqKiBpbiBwZWFrKTsgR3JvdW5kIEFkdmFudGFnZSAqKjPigJM3IGJ1c2luZXNzIGRheXMqKiBhZnRlciBzaGlwOyB0cmFja2luZyBlbWFpbGVkIG9uIHNoaXA7ICoqbm8gYWRkcmVzcyBjaGFuZ2Ugb3Igb3JkZXIgbWVyZ2UgYWZ0ZXIgcGxhY2VtZW50Kio7IFBPIGJveGVzIFVTUFMgb25seS4gUmV0dXJuZWQtdG8tc2VuZGVyIHJlZnVuZGVkIG9uIHJlY2VpcHQgKipsZXNzIG9yaWdpbmFsIHNoaXBwaW5nICsgY2FycmllciByZXR1cm4gZmVlcyoqLgotICoqUGFja2FnZSBQcm90ZWN0aW9uIGlzIGEgUEFJRCBiZW5lZml0IOKAlCB0aWVyIGV2ZXJ5IGxvc3QgLyBub3QtcmVjZWl2ZWQgLyBtaXNzaW5nLWl0ZW1zIGNhc2UgYnkgd2hldGhlciB0aGUgb3JkZXIgaGFzIGl0LioqIEEgZnJlZSBmdWxsIHJlc2hpcG1lbnQvcmVwbGFjZW1lbnQsIGZ1bGwgcmVmdW5kLCBvciBmdWxsIHN0b3JlIGNyZWRpdCBpcyBhICoqUGFja2FnZS1Qcm90ZWN0aW9uIGJlbmVmaXQgT05MWSoqLiBGb3IgYSBjdXN0b21lciAqKndpdGhvdXQqKiBQYWNrYWdlIFByb3RlY3Rpb24geW91IG11c3QgKipuZXZlcioqIG9mZmVyIGEgZnJlZSByZXNoaXAgb3IgZnVsbCBjcmVkaXQg4oCUIHRoZSBtb3N0IHlvdSBtYXkgb2ZmZXIgaXMgYSAqKm9uZS10aW1lIGdvb2QtZmFpdGggNTAlIHN0b3JlIGNyZWRpdCoqLiBHaXZpbmcgbm9uLVBQIGN1c3RvbWVycyB0aGUgc2FtZSByZW1lZHkgYXMgUFAgY3VzdG9tZXJzIHJlbW92ZXMgdGhlIHJlYXNvbiB0byBidXkgcHJvdGVjdGlvbiwgc28gaG9sZCB0aGUgbGluZTogd2FybSBhbmQgZW1wYXRoZXRpYywgcHJvYWN0aXZlIHRvIHByZXZlbnQgYmlnZ2VyIHByb2JsZW1zLCBidXQgdXBob2xkIHRoZSBwb2xpY3kuIEFsd2F5cyBjaGVjayB0aGUgb3JkZXIgbGluZSBpdGVtcyBmb3IgdGhlICJQYWNrYWdlIFByb3RlY3Rpb24iIFNLVTsgaWYgUFAgcHJlc2VuY2UgaXMgdW5jbGVhciwgZXNjYWxhdGUgcmF0aGVyIHRoYW4gYXNzdW1lIGl0IGlzIHRoZXJlLgogIC0gKioiTWFya2VkIGRlbGl2ZXJlZCBidXQgbm90IHJlY2VpdmVkIiAodHJhY2tpbmcgc2F5cyBkZWxpdmVyZWQsIGN1c3RvbWVyIHNheXMgaXQgbmV2ZXIgY2FtZSk6KioKICAgIC0gKipTdGVwIDEg4oCUIGZpcnN0IHJlcG9ydDoqKiBpc3N1ZSBub3RoaW5nIHlldC4gRW1wYXRoaXplIGFuZCBleHBsYWluIGNhcnJpZXJzIChlc3BlY2lhbGx5IFVTUFMpIHNvbWV0aW1lcyBzY2FuIGEgcGFja2FnZSBkZWxpdmVyZWQgZWFybHkgb3IgYnkgbWlzdGFrZTsgYXNrIHRoZW0gdG8gd2FpdCB1cCB0byAyNCBob3VycyBhbmQgY2hlY2sgdGhlIG1haWxib3gsIGFyb3VuZCB0aGUgcHJvcGVydHksIGFuZCB3aXRoIGhvdXNlaG9sZC9uZWlnaGJvcnMsIGFuZCBpZiBpdCBzdGlsbCBoYXMgbm90IGFycml2ZWQgYnkgdGhlICoqZW5kIG9mIHRoZSBuZXh0IGJ1c2luZXNzIGRheSoqIHRvIHJlcGx5IGJhY2sgYW5kIHdlIHdpbGwgZ28gZnJvbSB0aGVyZS4gTWFrZSBOTyByZW1lZHkgcHJvbWlzZSBpbiB0aGlzIGZpcnN0IG1lc3NhZ2Ug4oCUIG5vIHJlZnVuZCwgbm8gcmVwbGFjZW1lbnQsIG5vIHJlc2hpcCwgbm8gIndlIHdpbGwgbWFrZSBpdCByaWdodCIg4oCUIGFuZCBkbyBub3QgbWVudGlvbiB0aGUgNTAlIGNyZWRpdCB5ZXQuIChHdWlkYW5jZSBvbmx5IOKAlCBub3QgYSBtb25leSBtb3ZlLikKICAgIC0gKipTdGVwIDIg4oCUIHRoZXkgd2FpdGVkIGFuZCBpdCBzdGlsbCBoYXMgbm90IGFycml2ZWQ6KiogKipXaXRoIFBhY2thZ2UgUHJvdGVjdGlvbioqIGdpdmVzIHRoZW0gdGhlaXIgY2hvaWNlIG9mICoqc3RvcmUgY3JlZGl0IG9yIGEgcmVzaGlwbWVudCoqIG9mIHRoZSBvcmRlci4gKipXaXRob3V0IFBhY2thZ2UgUHJvdGVjdGlvbioqIOKAlCBhcyBhIHNob3cgb2YgZ29vZCBmYWl0aCwgYSBvbmUtdGltZSAqKjUwJSBzdG9yZSBjcmVkaXQqKiBvZiB0aGUgb3JkZXIgdmFsdWUsIGdlbnRseSBub3RpbmcgdGhhdCBQYWNrYWdlIFByb3RlY3Rpb24gd2FzIHJlbW92ZWQgZnJvbSB0aGUgb3JkZXIgYXQgY2hlY2tvdXQsIHNvIGEgZnVsbCByZXNoaXAgb3IgcmVmdW5kIGlzIG5vdCBhdmFpbGFibGUgYW5kIHRoZSA1MCUgc3RvcmUgY3JlZGl0IGlzIHRoZSBtb3N0IHdlIGNhbiBkbyAobm8gcmVzaGlwLCBubyBmdWxsIGNyZWRpdCkuIChNb25leSBtb3ZlIOKAlCBmbGFnIGZvciBKb3NlOyBub3RlIHRoZSBhbW91bnQuKQogIC0gKipNaXNzaW5nIGl0ZW1zIChvcmRlciBhcnJpdmVkLCBzb21lIGl0ZW1zIG1pc3NpbmcpOioqIGZpcnN0IGFzayB3aGV0aGVyIHRoZSAqKnBhY2thZ2luZyB3YXMgZGFtYWdlZC90YW1wZXJlZCoqIGFuZCAqKndoaWNoIGl0ZW1zKiogYXJlIG1pc3NpbmcuIFRoZW46ICoqd2l0aCBQUCoqIOKAlCBzdG9yZSBjcmVkaXQgZm9yIHRoZSBtaXNzaW5nIGl0ZW1zICoqb3IqKiByZXNoaXAgdGhlIG1pc3NpbmcgaXRlbXM7ICoqd2l0aG91dCBQUCoqIOKAlCB0aGUgbW9zdCB3ZSBjYW4gb2ZmZXIgaXMgYSAqKjUwJSBzdG9yZSBjcmVkaXQqKiBmb3IgdGhlIHZhbHVlIG9mIHRoZSAqKm1pc3NpbmcgaXRlbXMqKiBvbmx5LiAoTW9uZXkgbW92ZSDigJQgZmxhZy4pCiAgLSAqKkxvc3QgaW4gdHJhbnNpdCAvIHN0b2xlbiAodHJhY2tpbmcgc3RhbGxlZCBvciBjb25maXJtZWQgdGhlZnQpOioqIHNhbWUgdGllcmluZyDigJQgd2l0aCBQUCByZXNvbHZlIHBlciBQYWNrYWdlIFByb3RlY3Rpb24gKHJlc2hpcCBpZiBpbiBzdG9jaywgZWxzZSBzdG9yZSBjcmVkaXQpOyB3aXRob3V0IFBQIGEgb25lLXRpbWUgKio1MCUgZ29vZC1mYWl0aCBzdG9yZSBjcmVkaXQqKiBpcyB0aGUgY2VpbGluZywgbmV2ZXIgYSBmcmVlIGZ1bGwgcmVzaGlwLgogIC0gKipQUCBjbGFpbSBtZWNoYW5pY3M6KiogZm9yIGEgUFAgY3VzdG9tZXIgdGhlIHJlc29sdXRpb25zIGFyZSAqKnJlc2hpcG1lbnQgb3Igc3RvcmUgY3JlZGl0IG9ubHkg4oCUIG5ldmVyIGEgcmVmdW5kKiogb24gYSBQUCBjbGFpbSwgZXZlbiBpZiB0aGV5IGFzay4gQ29uZmlybSBzdG9jayBiZWZvcmUgcHJvbWlzaW5nIGEgcmVzaGlwLiAqKkRlYWRsaW5lczoqKiBsb3N0L2RhbWFnZWQgcmVwb3J0ZWQgd2l0aGluIDE0IGRheXM7ICJtYXJrZWQgZGVsaXZlcmVkIGJ1dCBub3QgcmVjZWl2ZWQiIHdpdGhpbiA1IGRheXMuICoqUG9saWNlIHJlcG9ydDoqKiByZXF1aXJlZCBPTkxZIGZvciBhICJtYXJrZWQgZGVsaXZlcmVkIGJ1dCBub3QgcmVjZWl2ZWQiIG9yZGVyIHZhbHVlZCAqKiQxNTAgb3IgbW9yZSoqIOKAlCB1bmRlciAkMTUwIG5ldmVyIGFzayBmb3Igb25lLiBDbGFpbSBwb3J0YWwgKG9ubHkgaWYgYWN0dWFsbHkgbmVlZGVkKTogYGxhcmtzcHVyYmFieS5jb20vcGFnZXMvcGFja2FnZS1wcm90ZWN0aW9uLWNsYWltLWNlbnRlcmAuCi0gKipSZXR1cm5zIG9ubHkg4oCUIE5PIGV4Y2hhbmdlcy4qKiBXZSBhY2NlcHQgcmV0dXJucywgbm90IGV4Y2hhbmdlcy4gSWYgYSBjdXN0b21lciB3YW50cyBhIGRpZmZlcmVudCBzaXplIG9yIGNvbG9yLCBleHBsYWluIHdhcm1seSB0aGF0IHdlIGRvbid0IG9mZmVyIGV4Y2hhbmdlcyDigJQgdGhleSByZXR1cm4gdGhlIGl0ZW0gZm9yIGEgcmVmdW5kIG9yIHN0b3JlIGNyZWRpdCBhbmQgc2ltcGx5IHBsYWNlIGEgbmV3IG9yZGVyIGZvciB3aGF0IHRoZXknZCBsaWtlLiBBbGwgcmV0dXJucyBhcmUgc2VsZi1zZXJ2aWNlIHRocm91Z2ggZWFjaCBicmFuZCdzICoqb3duIHJldHVybnMgcG9ydGFsKiouCiAgLSAqKlBpY2sgdGhlIHBvcnRhbCBmcm9tIHRoZSBPUkRFUi1OVU1CRVIgUFJFRklYIOKAlCB0aGlzIHRlbGxzIHlvdSB0aGUgYnJhbmQuKiogRXZlcnkgb3JkZXIgbnVtYmVyIHN0YXJ0cyB3aXRoIGEgYnJhbmQgYWNyb255bS4gUmVhZCBpdCBvZmYgdGhlIG9yZGVyIG5hbWUgYW5kIHNlbmQgdGhlIG1hdGNoaW5nIHBvcnRhbCBsaW5rICppbiB0aGUgc2FtZSByZXBseSogc28gdGhlIGN1c3RvbWVyIGNhbiBzdGFydCB0aGVpciByZXR1cm4gcmlnaHQgYXdheSDigJQgbmV2ZXIgc2F5IHlvdSdyZSAiY29uZmlybWluZyB0aGUgY29ycmVjdCBsaW5rIiBvciAid2lsbCBmb2xsb3cgdXAsIiB5b3UgYWxyZWFkeSBrbm93IGl0IGZyb20gdGhlIHByZWZpeC4gTWF0Y2ggdGhlICoqbG9uZ2VzdCoqIHByZWZpeCBmaXJzdCAoY2hlY2sgYExCT2AgYmVmb3JlIGBMQmApOgogICAgLSAqKmBMQk/igKZgKiogPSAqKkxhcmtzcHVyIEJhYnkgT3V0bGV0Kiog4oaSIGh0dHBzOi8vbGFya3NwdXJiYWJ5b3V0bGV0Lmxvb3ByZXR1cm5zLmNvbS8jLwogICAgLSAqKmBMQuKApmAqKiA9ICoqTGFya3NwdXIgQmFieSoqIChtYWluIHN0b3JlKSDihpIgaHR0cHM6Ly9sYXJrc3B1cmJhYnkubG9vcHJldHVybnMuY29tLyMvCiAgICAtICoqYEJC4oCmYCoqID0gKipCdW1idW5ueSBCYWJ5Kiog4oaSIGh0dHBzOi8vYnVtYnVubnliYWJ5Lmxvb3ByZXR1cm5zLmNvbS8jLwogIC0gRXhhbXBsZTogb3JkZXIgKiojTEJPODQyNSoqIOKGkiBvdXRsZXQgb3JkZXIg4oaSIHNlbmQgdGhlICoqbGFya3NwdXJiYWJ5b3V0bGV0Lmxvb3ByZXR1cm5zLmNvbS8jLyoqIGxpbmsgYW5kIHdhbGsgaGVyIHRocm91Z2ggc3RhcnRpbmcgdGhlIHJldHVybiBub3cuCiAgR2VuZXJhbCB0ZXJtczogd2l0aGluICoqNyBkYXlzKiosIHVud2FzaGVkIGFuZCBpbiBvcmlnaW5hbCBjb25kaXRpb24gd2l0aCB0YWdzOyBjdXN0b21lciBwaWNrcyByZWZ1bmQgb3Igc3RvcmUgY3JlZGl0OyAqKm9yaWdpbmFsIHNoaXBwaW5nIGlzIG5vdCByZWZ1bmRlZCoqOyAqKnNhbGUgaXRlbXMgYXJlIGZpbmFsKio7IGFsbCBzYWxlcyBmaW5hbCBkdXJpbmcgU2FsZSBFdmVudHMuIFRoZSBwb3J0YWwgY29uZmlybXMgZXhhY3QgZWxpZ2liaWxpdHkuCi0gKipEYW1hZ2VkIC8gZGVmZWN0aXZlIGl0ZW0gKHRvcm4sIHJpcHBlZCwgYnJva2VuIHNuYXBzLCBob2xlcywgZGVmZWN0IG9uIGFycml2YWwpLioqIEJlIGRlY2lzaXZlIGFuZCByZWFzc3VyaW5nIOKAlCBkb24ndCBoZWRnZSB3aXRoICJhbm90aGVyIHJlc29sdXRpb24iIG9yICJ3ZSdsbCBmb2xsb3cgdXAgYWZ0ZXIgd2UgcmV2aWV3LiIKICAtIEVtcGF0aGl6ZSBhYm91dCB0aGUgZGFtYWdlLCBjb25maXJtIHdoaWNoIGl0ZW0ocykgZnJvbSB0aGVpciBvcmRlciBhcmUgYWZmZWN0ZWQsIGFuZCAqKmFzayBmb3IgYSBxdWljayBwaG90byBvZiB0aGUgZGFtYWdlKiog4oCUIGJ1dCBPTkxZIGlmIHRoZXkgaGF2ZW4ndCBhbHJlYWR5IHNlbnQgb25lLgogIC0gKipJZiB0aGUgY3VzdG9tZXIgaGFzIEFMUkVBRFkgYXR0YWNoZWQgYSBwaG90byoqICh0aGUgdGlja2V0IHdpbGwgdGVsbCB5b3UgYSBwaG90byBpcyBhdHRhY2hlZCDigJQgaXQgbWF5IGJlIGFuIGlubGluZSBpbWFnZSBpbiB0aGVpciBlbWFpbCwgbm90IGEgZm9ybWFsIGF0dGFjaG1lbnQpOiBkbyAqKk5PVCoqIGFzayBmb3IgYW5vdGhlciBwaG90by4gKipUaGFuayB0aGVtIGZvciB0aGUgcGhvdG8qKiBhbmQgbW92ZSB0byB0aGUgcmVzb2x1dGlvbi4gUmUtYXNraW5nIGZvciBhIHBpY3R1cmUgdGhleSBhbHJlYWR5IHNlbnQgaXMgZXhhY3RseSB0aGUgbWlzdGFrZSB0byBhdm9pZC4KICAtICoqQUxXQVlTIENIRUNLIFNUT0NLIEZJUlNULioqIEJlZm9yZSB5b3UgcHJvbWlzZSBhIHJlcGxhY2VtZW50LCBsb29rIHRoZSBvcmRlciB1cCBpbiBTaG9waWZ5IGFuZCBjaGVjayBlYWNoIGFmZmVjdGVkIGl0ZW0ncyBhdmFpbGFiaWxpdHkgKGB2YXJpYW50LmF2YWlsYWJsZUZvclNhbGVgKS4gKipOZXZlciBwcm9taXNlIGEgcmVwbGFjZW1lbnQgeW91IGhhdmVuJ3QgY29uZmlybWVkIGlzIGluIHN0b2NrLioqCiAgICAtICoqSW4gc3RvY2sg4oaSIHRlbGwgdGhlbSBhIHJlcGxhY2VtZW50IG9mIHRoZSBzYW1lIGl0ZW0gaXMgb24gaXRzIHdheS4qKgogICAgLSAqKk91dCBvZiBzdG9jayDihpIgZG8gTk9UIHByb21pc2UgdGhlIHNhbWUgaXRlbSoqICh3ZSBjYW4ndCBzaGlwIHdoYXQgd2UgZG9uJ3QgaGF2ZSkuIFdhcm1seSAqKmludml0ZSB0aGVtIHRvIHBpY2sgYSBkaWZmZXJlbnQsIGluLXN0b2NrIGl0ZW0gYXMgdGhlaXIgZnJlZSByZXBsYWNlbWVudCoqIGFuZCB3ZSdsbCBzaGlwIHRoYXQgb3V0IOKAlCBhbmQgb2ZmZXIgKipzdG9yZSBjcmVkaXQgb3IgYSByZWZ1bmQqKiBhcyBhbiBhbHRlcm5hdGl2ZSBpZiB0aGV5J2QgcHJlZmVyLiAoUmV0ZW50aW9uLWZpcnN0OiBrZWVwIGl0IGEgZ3JlYXQgZXhwZXJpZW5jZSwganVzdCBkb24ndCBwcm9taXNlIHRoZSBleGFjdCBpdGVtIHdlIGNhbid0IGZ1bGZpbGwuKQogIC0gV29yayB3aXRoIHdoYXQgdGhleSBoYXZlOiBpZiB0aGV5IHNheSB0aGV5IG5vIGxvbmdlciBoYXZlIG9uZSBvZiB0aGUgaXRlbXMgKHRocmV3IGl0IGF3YXksIGV0Yy4pLCBkb24ndCBpbnNpc3Qgb24gYSBwaG90byBvZiB0aGF0IG9uZSDigJQgcHJvY2VlZCBiYXNlZCBvbiB3aGF0IHRoZXkndmUgdG9sZC9zaG93biB5b3UgKHN0aWxsIGNoZWNraW5nIHN0b2NrIGZvciB0aGUgcmVzb2x1dGlvbikuCiAgLSBUaGUgcmVzb2x1dGlvbiBpcyBhbiBpbnZlbnRvcnkvbW9uZXkgbW92ZSDihpIg8J+bkSBmbGFnIGZvciBKb3NlJ3MgcXVpY2sgYmVoaW5kLXRoZS1zY2VuZXMgYXBwcm92YWwsIGJ1dCB0aGUgZHJhZnQgdGhlIGN1c3RvbWVyIHJlYWRzIGlzIHRoZSBjb25maWRlbnQsIGNvcnJlY3QgcmVzb2x1dGlvbiAocmVwbGFjZW1lbnQgaWYgaW4gc3RvY2ssIHN0b3JlIGNyZWRpdC9yZWZ1bmQgaWYgbm90KSwgbmV2ZXIgYSBwbGFjZWhvbGRlci4KLSAqKlByb2R1Y3Q6KiogcHJlbWl1bSBiYW1ib28gKCJDbG91ZFdlYXZlIiksIG1hcmtldGVkIGZvciBzZW5zaXRpdmUgc2tpbi4gQ29uZmlybSBleGFjdCBzaXppbmcvY2FyZSBmcm9tIHRoZSBsaXZlIFNob3BpZnkgcHJvZHVjdC4KLSAqKkxhcmtzcHVyIE91dGxldCAvIEJ1bWJ1bm55OioqIHBvbGljaWVzIFRCRCDigJQgdW50aWwgZmlsbGVkLCBlc2NhbGF0ZSBwb2xpY3kgcXVlc3Rpb25zIHJhdGhlciB0aGFuIGFzc3VtaW5nIExhcmtzcHVyJ3MgcnVsZXMgYXBwbHkuCgojIyBTbGFjayBhcHByb3ZhbCBjYXJkIChgI2NzLWFwcHJvdmFsc2ApCmBgYArwn46rICpbQlJBTkRdIOKAlCBbdHlwZV0qIMK3IFRpY2tldCBbaWQvbGlua10KQ3VzdG9tZXI6IFtuYW1lXSA8W2VtYWlsXT4gfCBPcmRlcjogWyNuYW1lIG9yIG5vbmVdClNlbnRpbWVudDogWy4uXSAgQ29uZmlkZW5jZTogW0hpZ2gvTWVkL0xvd10KKlN0YXR1czoqIOKchSBOb3JtYWwgZHJhZnQgIOKAlG9y4oCUICDwn5uRIE5FRURTIEFQUFJPVkFMIOKAlCBbcmVmdW5kL29yZGVyLWVkaXQvbG93LWNvbmZpZGVuY2Uvc2Vuc2l0aXZlXQoqQXNrZWQ6KiBbMeKAkzIgbGluZXNdCipGb3VuZCAoU2hvcGlmeSk6KiBbc3RhdHVzL3RyYWNraW5nL2xpbmUgaXRlbXMvcHJvdGVjdGlvbi9ldGMuXQoqUmVjb21tZW5kYXRpb246KiBbYWN0aW9uICsgcG9saWN5IGJhc2lzOyBleGFjdCAkIGZvciBtb25leSBtb3Zlc10KKkRyYWZ0OioKPiBbZnVsbCBjdXN0b21lciByZXBseV0KYGBgCgojIyBMb2dnaW5nIChmb3IgQWdlbnQgMikKRm9yIGV2ZXJ5IHRpY2tldCwgYXBwZW5kIGEgc3RydWN0dXJlZCBsb2cgbGluZSB0aGUgU3VwZXJ2aXNvciBjYW4gcmV2aWV3OgpgdGltZXN0YW1wIMK3IGJyYW5kIMK3IHR5cGUgwrcgc2VudGltZW50IMK3IGNvbmZpZGVuY2UgwrcgZXNjYWxhdGVkPyDCtyByZXNvbHV0aW9uIMK3IGhhbmRsZV90aW1lX2VzdCDCtyBvcmRlciNgLgpLZWVwIGEgcnVubmluZyB0YWxseSBwZXIgZGF5IHNvIEFnZW50IDIgY2FuIHB1bGwgdGhlIGRhaWx5L3dlZWtseSBzdW1tYXJ5LiBXaGVuIEFnZW50IDIgcmVxdWVzdHMgYSBzdW1tYXJ5LCBwcm92aWRlOiB0b3RhbCB0aWNrZXRzLCBicmVha2Rvd24gYnkgdHlwZSAmIGJyYW5kLCBlc2NhbGF0aW9ucyAmIHBlbmRpbmcgJCBhcHByb3ZhbHMsIGF2ZyBzZW50aW1lbnQsIG5vdGFibGUvZW1lcmdpbmcgaXNzdWVzIChlLmcuIGEgc3Bpa2UgaW4gc2l6aW5nIGNvbXBsYWludHMgb24gb25lIFNLVSksIGFuZCBhbnl0aGluZyB5b3Ugd2VyZSB1bnN1cmUgaG93IHRvIGFuc3dlci4KCiMjIE5ldmVyClNlbmQgd2l0aG91dCBhcHByb3ZhbCDCtyBpc3N1ZSByZWZ1bmRzL2Rpc2NvdW50cy9jcmVkaXQgwrcgZWRpdC9jYW5jZWwgb3JkZXJzIG9yIGNoYW5nZSBhZGRyZXNzZXMgwrcgaW52ZW50IGZhY3RzIMK3IHNoYXJlIG9uZSBjdXN0b21lcidzIGRhdGEgd2l0aCBhbm90aGVyIMK3IGdpdmUgbWVkaWNhbC9zYWZldHkgYWR2aWNlIChlc2NhbGF0ZSkgwrcgcHJvbWlzZSBvdXRzaWRlIHBvbGljeSDCtyBtaXggYnJhbmRzJyBwb2xpY2llcy4K";
const EMBEDDED_SKILL = Buffer.from(EMBEDDED_SKILL_B64, "base64").toString("utf8");
let skill = EMBEDDED_SKILL;
try { const f = fs.readFileSync(path.join(__dirname, "agents", "emily.md"), "utf8"); if (f && f.length > EMBEDDED_SKILL.length) skill = f; } catch (_) {}
const SYSTEM_PROMPT_HEAD =
  `You are ${agent.name}, the ${agent.title} for Brusche Inc. (Shopify baby brands Larkspur Baby and Larkspur Baby Outlet).\n\n` +
  `You have TOOLS for live data. When something depends on a real order, tracking, or ticket, CALL A TOOL to look it up — never invent order status, tracking, or policy. ` +
  `For ANY product or size availability question, CALL shopify_check_stock — you DO have a live inventory/stock tool, so never tell anyone you can't check stock; check it and answer.\n\n` +
  `----- YOUR PLAYBOOK -----\n`;
/* ---- Policy patches: rule changes that ship with a version. Each runs once (tracked in hd_sync), rewrites the
 * stored policy text and saves it as a new version so the history in Settings shows what changed. ---- */
const PICKUP_RULE = "LOCAL PICKUP (Larkspur Baby and Larkspur Baby Outlet): pickup is available Monday through Friday, 8:30am to 2:00pm Central. No call or appointment needed. Address: 701 E Plano Pkwy, Suite 103, Plano, TX 75074. Tell the customer to look for the door with the Larkspur logo at Suite 103 and press the doorbell \u2014 one of our team will come out with the package. Our doors stay locked for the safety of our staff, so the doorbell is the way in. No pickup on weekends. If the customer asks about pickup windows, give these hours \u2014 there are no separate morning/afternoon windows any more. ";
const POLICY_PATCHES = [
  { id: "policy_pickup_hours_v3_5", note: "v3.4 — local pickup hours: Mon–Fri 8:30am–2:00pm, Suite 103, doorbell (replaces 10–12 / 2–3 windows)",
    apply: (key, body) => {
      // any line about pickup that still carries the old windows / call-ahead wording
      const winRe = /^[^\n]*(pickup|pick-up|pick up)[^\n]*(10(?::00)?\s*(?:am)?\s*(?:[–-]|to)\s*12(?::00)?|2(?::00)?\s*(?:pm)?\s*(?:[–-]|to)\s*3(?::00)?|windows?|call ahead|call us first|by appointment)[^\n]*\n?/gim;
      const hadOld = winRe.test(body);
      let out = body.replace(winRe, "");
      if (key === "rules" && !/LOCAL PICKUP \(Larkspur/.test(out)) out = out.replace(/\s+$/, "") + "\n\n" + PICKUP_RULE;
      if (key === "playbook" && (hadOld || /local pickup/i.test(out)) && !/Suite 103/.test(out)) out = out.replace(/\s+$/, "") + "\n\n## Local pickup\n" + PICKUP_RULE;
      return out === body ? null : out;
    } },
];
async function applyPolicyPatches() {
  if (!pool) return;
  for (const p of POLICY_PATCHES) {
    try {
      if (await core.syncGet(p.id)) continue;
      let changed = 0;
      for (const key of ["rules", "playbook"]) {
        const cur = (await db(`SELECT body FROM emily_policies WHERE key=$1 ORDER BY id DESC LIMIT 1`, [key])).rows[0];
        const body = cur ? cur.body : (key === "rules" ? DEFAULT_RULES : EMBEDDED_SKILL);
        const next = p.apply(key, body);
        if (next) { await db(`INSERT INTO emily_policies (key, body, note, updated_by) VALUES ($1,$2,$3,'system')`, [key, next, p.note]); core.policyCache.delete(key); changed++; }
      }
      await core.syncSet(p.id, String(changed), { at: new Date().toISOString() });
      console.log(`📜 policy patch ${p.id}: ${changed} polic${changed === 1 ? "y" : "ies"} updated`);
    } catch (e) { console.error(`policy patch ${p.id}:`, e.message); }
  }
}

async function systemPrompt() { return SYSTEM_PROMPT_HEAD + (await core.policyText("playbook", skill)); }

let app = null;   // Slack (Bolt) — set in start() when tokens exist

/* ---------------- Shopify Admin API — MULTI-STORE (client-credentials, auto-refresh) ----------------
 * Set SHOPIFY_STORES to a JSON array, one object per store:
 *   [{"brand":"Larkspur Baby","domain":"x.myshopify.com","id":"...","secret":"..."}, ...]
 * Falls back to the single SHOPIFY_STORE_DOMAIN/CLIENT_ID/CLIENT_SECRET if SHOPIFY_STORES is unset. */
const SHOP_VER = process.env.SHOPIFY_API_VERSION || "2025-07";
function loadStores() {
  const out = [];
  if (process.env.SHOPIFY_STORES) {
    try {
      for (const s of JSON.parse(process.env.SHOPIFY_STORES))
        if (s.domain && s.id && s.secret) out.push({ brand: s.brand || s.domain, domain: s.domain, id: s.id, secret: s.secret, tok: { token: null, exp: 0 } });
    } catch (e) { console.error("SHOPIFY_STORES parse error:", e.message); }
  }
  if (!out.length && process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) {
    out.push({ brand: "Larkspur Baby", domain: process.env.SHOPIFY_STORE_DOMAIN, id: process.env.SHOPIFY_CLIENT_ID, secret: process.env.SHOPIFY_CLIENT_SECRET, tok: { token: null, exp: 0 } });
  }
  return out;
}
const STORES = loadStores();
async function storeToken(st) {
  if (st.tok.token && Date.now() < st.tok.exp) return st.tok.token;
  const r = await fetch(`https://${st.domain}/admin/oauth/access_token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: st.id, client_secret: st.secret, grant_type: "client_credentials" }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`${st.brand} token: ${JSON.stringify(j).slice(0, 150)}`);
  st.tok = { token: j.access_token, exp: Date.now() + ((j.expires_in ? j.expires_in - 300 : 3600) * 1000) };
  console.log(`🔑 ${st.brand} token scopes: ${j.scope || "(none returned)"}${/store_credit/i.test(j.scope || "") ? " · store-credit ✅" : " · store-credit ✖ NOT granted"}`);
  return st.tok.token;
}
async function storeGraphQL(st, query, variables) {
  const token = await storeToken(st);
  const res = await fetch(`https://${st.domain}/admin/api/${SHOP_VER}/graphql.json`, {
    method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json();
  if (j.errors) throw new Error(`${st.brand}: ${JSON.stringify(j.errors).slice(0, 200)}`);
  return j.data;
}
const ORDER_QUERY = `query($q:String!){orders(first:3,query:$q,sortKey:CREATED_AT,reverse:true){edges{node{
  id name email createdAt displayFinancialStatus displayFulfillmentStatus
  totalPriceSet{shopMoney{amount currencyCode}} shippingAddress{address1 city province zip country}
  lineItems(first:25){edges{node{title quantity sku variant{availableForSale}}}} fulfillments(first:5){status trackingInfo{number url company}}
}}}}`;
// Which store does an order-number PREFIX belong to? (LBO before LB — longest first.)
function storeForPrefix(prefix) {
  const p = (prefix || "").toUpperCase();
  return STORES.find((s) => {
    const b = (s.brand || "").toLowerCase(), d = (s.domain || "").toLowerCase();
    if (p === "LBO") return b.includes("outlet") || d.includes("outlet") || d.includes("larkspurbabyoutlet");
    if (p === "BB") return b.includes("bumbunny") || d.includes("bumbunny");
    if (p === "LB") return (b.includes("larkspur") && !b.includes("outlet")) || (d.includes("larkspurbaby") && !d.includes("outlet"));
    return false;
  });
}
async function queryStore(st, filter) {
  const data = await storeGraphQL(st, ORDER_QUERY, { q: filter });
  return (data.orders?.edges || []).map((e) => e.node);
}
async function shopifyLookupOrder(raw) {
  const q = (raw || "").trim();
  if (!q) return { error: "Provide an order name or customer email." };
  if (!STORES.length) return { error: "No Shopify stores configured." };

  // --- Email lookup: search every store by email. ---
  if (q.includes("@")) {
    const found = [], failed = [];
    for (const st of STORES) {
      try { for (const n of await queryStore(st, `email:${q}`)) found.push({ store: st.brand, matched_by: "email", ...n }); }
      catch (e) { failed.push({ store: st.brand, error: e.message }); console.error(`  lookup ${st.brand} email:${q} — ${e.message}`); }
    }
    if (found.length) return found;
    return { note: `No order found for email "${q}"${failed.length ? ` (couldn't reach: ${failed.map((f) => f.store).join(", ")})` : ""}.`, stores_unreachable: failed.map((f) => f.store) };
  }

  // --- Order-name lookup: parse the brand PREFIX + number, route to that store, try every name format. ---
  const cleaned = q.replace(/^#/, "").replace(/\s+/g, "").toUpperCase();
  const m = cleaned.match(/^(LBO|LB|BB)0*(\d+)$/);            // LBO checked before LB (longest first)
  const errors = [], tried = [];
  const runVariants = async (stores, variants) => {
    for (const st of stores) {
      for (const filter of variants) {
        try {
          const nodes = await queryStore(st, filter);
          tried.push(`${st.brand}:${filter}=${nodes.length}`);
          if (nodes.length) return nodes.map((n) => ({ store: st.brand, matched_by: filter, ...n }));
        } catch (e) { errors.push({ store: st.brand, error: e.message }); console.error(`  lookup ${st.brand} ${filter} — ${e.message}`); }
      }
    }
    return [];
  };

  let hits = [];
  if (m) {
    const prefix = m[1], num = m[2], full = prefix + num;    // e.g. BB21953 / 21953
    const routed = storeForPrefix(prefix);
    // In the brand's own store, try full name, #-name, and the bare number (Shopify matches the numeric part of "#BB21953").
    if (routed) hits = await runVariants([routed], [`name:${full}`, `name:#${full}`, `name:${num}`]);
    // Fallback: search ALL stores by the FULL prefixed name only (never bare number across stores — avoids matching another brand's #NNNN).
    if (!hits.length) hits = await runVariants(STORES, [`name:${full}`, `name:#${full}`]);
  } else {
    // No recognizable brand prefix — search every store by the raw value.
    hits = await runVariants(STORES, [`name:${cleaned}`, `name:#${cleaned}`]);
  }

  console.log(`  order lookup "${q}" → tried [${tried.join(", ")}] found=${hits.length}${errors.length ? ` errors=${errors.length}` : ""}`);
  if (hits.length) return hits;
  const unreachable = [...new Set(errors.map((e) => e.store))];
  return {
    note: unreachable.length
      ? `No order found for "${q}". WARNING: couldn't reach ${unreachable.join(", ")} — that Shopify connection may be down, so the order could exist there but be invisible. Treat as a connection issue, not a missing order.`
      : `No order found for "${q}" after trying every name format across ${m ? `the ${m[1]} store and all stores` : "all stores"}. The order number may be mistyped — ask the customer to confirm the number or the email used at checkout.`,
    order_ref: q, parsed_prefix: m ? m[1] : null, stores_searched: STORES.map((s) => s.brand), stores_unreachable: unreachable,
  };
}

// Live product/variant stock check — for ANY "is this size in stock / what sizes do you have"
// question, and before offering OR refusing a replacement. Do NOT infer replacement stock from
// an order's line items (that's only the variant they bought); check the live product here.
const PRODUCT_QUERY = `query($q:String!){products(first:10,query:$q){edges{node{
  title status
  variants(first:100){edges{node{ title sku availableForSale inventoryQuantity }}}
}}}}`;
async function shopifyCheckStock(term, brandHint) {
  const q = (term || "").trim();
  if (!q) return { error: "Provide a product name, print, or SKU to check." };
  if (!STORES.length) return { error: "No Shopify stores configured." };
  // Route to a brand's store if hinted; otherwise search every store.
  let stores = STORES;
  if (brandHint) {
    const p = String(brandHint).toUpperCase();
    const s = storeForPrefix(/OUTLET|LBO/.test(p) ? "LBO" : /BUMBUNNY|BB/.test(p) ? "BB" : /LARKSPUR|LB/.test(p) ? "LB" : "")
      || STORES.find((st) => st.brand.toLowerCase().includes(String(brandHint).toLowerCase()));
    if (s) stores = [s];
  }
  const isSku = /^[A-Za-z0-9._-]{5,}$/.test(q) && !/\s/.test(q);
  const searchQ = isSku ? `sku:${q}` : q; // plain text matches on product title
  const out = [], errors = [];
  for (const st of stores) {
    try {
      const data = await storeGraphQL(st, PRODUCT_QUERY, { q: searchQ });
      for (const pe of (data.products?.edges || [])) {
        const p = pe.node;
        out.push({
          store: st.brand, product: p.title, status: p.status,
          variants: (p.variants?.edges || []).map((v) => ({ size: v.node.title, sku: v.node.sku, in_stock: v.node.availableForSale, qty: v.node.inventoryQuantity })),
        });
      }
    } catch (e) { errors.push({ store: st.brand, error: e.message }); console.error(`  stock check ${st.brand} "${searchQ}" — ${e.message}`); }
  }
  console.log(`  stock check "${q}" (${searchQ}) → products=${out.length}${errors.length ? ` errors=${errors.length}` : ""}`);
  if (out.length) return out;
  return { note: `No product found matching "${q}"${errors.length ? ` (couldn't reach: ${[...new Set(errors.map((e) => e.store))].join(", ")})` : ""}. Try a simpler keyword from the product title (e.g. the print name).`, searched: searchQ };
}

// Email-subscription / newsletter status — for "sign me up for emails / am I subscribed / add me to the list"
// questions. Reads the customer's marketing-consent state so Emily can CONFIRM an already-subscribed
// customer is on the list instead of telling them to sign up again.
const CUSTOMER_QUERY = `query($q:String!){customers(first:3,query:$q){edges{node{ firstName numberOfOrders defaultEmailAddress{ emailAddress marketingState marketingOptInLevel } }}}}`;
async function shopifyCheckSubscription(email, brandHint) {
  const q = (email || "").trim();
  if (!q || !q.includes("@")) return { error: "Provide the customer's email to check subscription status." };
  if (!STORES.length) return { error: "No Shopify stores configured." };
  // Route to a brand's store if hinted; otherwise check every store.
  let stores = STORES;
  if (brandHint) {
    const p = String(brandHint).toUpperCase();
    const s = storeForPrefix(/OUTLET|LBO/.test(p) ? "LBO" : /BUMBUNNY|BB/.test(p) ? "BB" : /LARKSPUR|LB/.test(p) ? "LB" : "")
      || STORES.find((st) => st.brand.toLowerCase().includes(String(brandHint).toLowerCase()));
    if (s) stores = [s];
  }
  const out = [], errors = [];
  for (const st of stores) {
    try {
      const data = await storeGraphQL(st, CUSTOMER_QUERY, { q: `email:${q}` });
      for (const ce of (data.customers?.edges || [])) {
        const c = ce.node, e = c.defaultEmailAddress || {};
        const state = String(e.marketingState || "").toUpperCase();
        out.push({ store: st.brand, email: e.emailAddress || q, orders: c.numberOfOrders, subscribed: state === "SUBSCRIBED", marketing_state: state || "UNKNOWN" });
      }
    } catch (e) { errors.push({ store: st.brand, error: e.message }); console.error(`  subscription check ${st.brand} ${q} — ${e.message}`); }
  }
  console.log(`  subscription check "${q}" → customers=${out.length}${errors.length ? ` errors=${errors.length}` : ""}`);
  if (out.length) return out;
  return { note: `No customer profile found for "${q}"${errors.length ? ` (couldn't reach: ${[...new Set(errors.map((e) => e.store))].join(", ")})` : ""}. They may not have a profile yet — treat as NOT-yet-subscribed and give the signup steps.`, searched: q };
}

/* ---------------- ShipStation (V1 API — live fulfillment/tracking + approval-gated changes) ----------------
 * Env: SHIPSTATION_API_KEY, SHIPSTATION_API_SECRET (Account → Settings → API Settings → V1 keys).
 * READS are live & safe. WRITES (address change / hold) are STAGED and only execute when Jose
 * clicks "Apply to ShipStation" on the Slack card — Emily never changes an order on her own. */
const SS_KEY = process.env.SHIPSTATION_API_KEY, SS_SECRET = process.env.SHIPSTATION_API_SECRET;
const SS_BASE = "https://ssapi.shipstation.com";
function shipstationConfigured() { return !!(SS_KEY && SS_SECRET); }
async function ssReq(method, pathname, body) {
  if (!shipstationConfigured()) throw new Error("ShipStation not configured (set SHIPSTATION_API_KEY / SHIPSTATION_API_SECRET).");
  const auth = "Basic " + Buffer.from(`${SS_KEY}:${SS_SECRET}`).toString("base64");
  const res = await fetch(`${SS_BASE}${pathname}`, { method, headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text();
  if (res.status === 429) throw new Error("ShipStation rate limit — try again in a moment.");
  if (!res.ok) throw new Error(`ShipStation ${method} ${pathname} ${res.status}: ${String(t).slice(0, 240)}`);
  return t ? JSON.parse(t) : {};
}
const ssOrderNo = (q) => String(q || "").trim().replace(/^#/, "");
function ssShipTo(o) { const s = (o && o.shipTo) || {}; return { name: s.name, company: s.company, street1: s.street1, street2: s.street2, city: s.city, state: s.state, postal_code: s.postalCode, country: s.country, phone: s.phone }; }
async function shipstationLookup(raw) {
  const q = String(raw || "").trim();
  if (!q) return { error: "Provide an order number or customer email." };
  if (!shipstationConfigured()) return { error: "ShipStation not configured." };
  const isEmail = q.includes("@");
  const params = isEmail ? `customerEmail=${encodeURIComponent(q)}` : `orderNumber=${encodeURIComponent(ssOrderNo(q))}`;
  let orders = [], shipments = [];
  try { orders = (await ssReq("GET", `/orders?${params}&pageSize=20`)).orders || []; } catch (e) { return { error: e.message }; }
  try { shipments = (await ssReq("GET", `/shipments?${params}&pageSize=20`)).shipments || []; } catch { shipments = []; }
  if (!orders.length && !shipments.length) return { note: `No ShipStation order found for "${q}". It may not have synced to ShipStation yet, or the number/email is off.` };
  const byOrder = {};
  for (const s of shipments) { if (s.voided) continue; (byOrder[s.orderNumber] ||= []).push(s); }
  const editable = new Set(["awaiting_shipment", "on_hold", "awaiting_payment"]);
  const out = orders.map((o) => {
    const sh = (byOrder[o.orderNumber] || []).sort((a, b) => new Date(b.createDate) - new Date(a.createDate));
    const latest = sh[0];
    return {
      order_number: o.orderNumber, shipstation_status: o.orderStatus, on_hold: o.orderStatus === "on_hold", hold_until: o.holdUntilDate || null,
      customer_email: o.customerEmail, ship_to: ssShipTo(o),
      shipped: o.orderStatus === "shipped" || !!latest,
      carrier: latest ? latest.carrierCode : null, service: latest ? latest.serviceCode : null,
      tracking_number: latest ? latest.trackingNumber : null, ship_date: latest ? latest.shipDate : null,
      can_edit_address: editable.has(o.orderStatus) && !latest,   // only before a label/shipment exists
      order_id: o.orderId, order_key: o.orderKey,
    };
  });
  if (!out.length && shipments.length) return shipments.filter((s) => !s.voided).map((s) => ({ order_number: s.orderNumber, shipped: true, carrier: s.carrierCode, service: s.serviceCode, tracking_number: s.trackingNumber, ship_date: s.shipDate, can_edit_address: false }));
  return out;
}
// WRITE executors — only called from the Slack "Apply" button, never by the model directly.
async function ssUpdateAddress(orderId, addr) {
  const o = await ssReq("GET", `/orders/${orderId}`);            // ShipStation updates are full-object upserts
  if (!o || !o.orderId) throw new Error(`ShipStation order ${orderId} not found.`);
  if (o.orderStatus === "shipped") throw new Error(`Order ${o.orderNumber} has already shipped — address can't be changed.`);
  const s = o.shipTo || {};
  o.shipTo = {
    name: addr.name || s.name, company: addr.company != null ? addr.company : s.company,
    street1: addr.street1 || s.street1, street2: addr.street2 != null ? addr.street2 : s.street2, street3: s.street3 || null,
    city: addr.city || s.city, state: addr.state || s.state, postalCode: addr.postal_code || s.postalCode,
    country: addr.country || s.country || "US", phone: addr.phone != null ? addr.phone : s.phone, residential: s.residential,
  };
  const r = await ssReq("POST", `/orders/createorder`, o);       // upsert keeps identity via orderKey
  return { ok: true, order_number: r.orderNumber, ship_to: ssShipTo(r) };
}
async function ssHold(orderId, holdUntil) {
  const date = holdUntil || new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  await ssReq("POST", `/orders/holduntil`, { orderId: Number(orderId), holdUntilDate: date });
  return { ok: true, hold_until: date };
}
async function ssUnhold(orderId) { await ssReq("POST", `/orders/unholdorder`, { orderId: Number(orderId) }); return { ok: true }; }

// Generic approval-gated ACTION system — Emily STAGES a change; it posts a Slack card and only
// EXECUTES when Jose clicks "Apply". Covers ShipStation address/hold AND Shopify replacement/discount.
const pendingAct = new Map(); // id -> { title, summary, ticketId, exec, ts, kind, input }
// Ids are random, never sequential. A sequential counter restarts at 1 on every deploy, so a card left
// over from yesterday could trigger today's action of the same number. Every staged action is also
// written to emily_actions so there is a permanent record of what was proposed, applied and dismissed —
// and so an old card can be re-staged safely after a restart instead of running the wrong thing.
async function recordAction(id, fields) {
  if (!pool) return;
  try {
    await db(`INSERT INTO emily_actions (id,kind,title,summary,ticket_id,input,status) VALUES ($1,$2,$3,$4,$5,$6,'staged')
              ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status`,
      [id, fields.kind || "unknown", fields.title, fields.summary, fields.ticketId ? String(fields.ticketId) : null, JSON.stringify(fields.input || {})]);
  } catch (e) { console.error("emily_actions insert:", e.message); }
}
async function markAction(id, status, extra) {
  if (!pool) return;
  try { await db(`UPDATE emily_actions SET status=$2, result=$3, decided_by=$4, decided_at=now() WHERE id=$1`, [id, status, extra && extra.result ? String(extra.result).slice(0, 2000) : null, extra && extra.by || null]); }
  catch (e) { console.error("emily_actions update:", e.message); }
}
async function stageAction({ title, summary, ticketId, exec, kind, input }) {
  const now = execNow.getStore();
  if (now) {                                   // a person is applying this from the Helpdesk right now — run it, don't post a card
    const r = await exec();
    now.results.push({ kind, title, summary, ticketId, input, result: r });
    return null;
  }
  const id = "act_" + crypto.randomUUID();
  pendingAct.set(id, { title, summary, ticketId, exec, kind, input });
  await recordAction(id, { kind, title, summary, ticketId, input });
  const header = `⚙️ *${title}*${ticketId ? ` · ticket ${ticketId}` : ""}`;
  const blocks = [
    { type: "section", text: { type: "mrkdwn", text: `${header}\n${summary}\n_Proposed by Emily — nothing happens until you Apply._` } },
    { type: "actions", elements: [
      { type: "button", style: "primary", text: { type: "plain_text", text: "🚀 Apply" }, action_id: "act_apply", value: id },
      { type: "button", style: "danger", text: { type: "plain_text", text: "✖ Dismiss" }, action_id: "act_dismiss", value: id },
    ] },
  ];
  if (app) { try { const res = await app.client.chat.postMessage({ channel: APPROVALS_CH, text: title, blocks }); const q = pendingAct.get(id); if (q) q.ts = res.ts; }
  catch (e) { console.error(`action card failed (invite Emily to #cs-approvals?): ${(e.data && e.data.error) || e.message}`); } }
  return id;
}

// Update the ORDER's shipping address in Shopify too (Shopify does NOT push address edits to
// ShipStation after an order is placed, so an address fix must be written to BOTH systems).
async function shopifyUpdateOrderAddress(st, orderGid, addr) {
  const shippingAddress = { address1: addr.street1, address2: addr.street2 || null, city: addr.city, provinceCode: addr.state, zip: addr.postal_code, countryCode: (addr.country || "US").toUpperCase(), phone: addr.phone || null };
  if (addr.name) { const parts = String(addr.name).trim().split(/\s+/); shippingAddress.firstName = parts.shift() || addr.name; if (parts.length) shippingAddress.lastName = parts.join(" "); }
  const m = await storeGraphQL(st, `mutation($input:OrderInput!){orderUpdate(input:$input){order{id} userErrors{field message}}}`, { input: { id: orderGid, shippingAddress } });
  const ue = m.orderUpdate.userErrors; if (ue && ue.length) throw new Error(ue.map((x) => x.message).join("; "));
  return { ok: true };
}


// Writes a corrected ship-to to Shopify (source of truth) and, if the order has synced and hasn't shipped, ShipStation too.
async function applyAddressChange(input, addr, shopHandle) {
  const parts = []; let failed = false;
  if (shopHandle) { try { await shopifyUpdateOrderAddress(shopHandle.st, shopHandle.gid, addr); parts.push(`Shopify ${shopHandle.name} ✅`); } catch (e) { failed = true; parts.push(`Shopify ✖ ${e.message}`); } }
  if (shipstationConfigured()) {
    try {
      const fresh = await shipstationLookup(ssOrderNo(input.order));
      const so = Array.isArray(fresh) ? fresh.find((x) => x.order_id) : null;
      if (so && !(so.shipped || so.shipstation_status === "shipped")) { try { await ssUpdateAddress(so.order_id, addr); parts.push(`ShipStation ${so.order_number} ✅`); } catch (e) { failed = true; parts.push(`ShipStation ✖ ${e.message}`); } }
      else if (so) { failed = true; parts.push(`ShipStation ✖ already shipped — Shopify updated, but ShipStation label is out`); }
      else { parts.push(`ShipStation ⏳ not synced yet — Shopify corrected; ShipStation will import the corrected address when it pulls this order`); }
    } catch (e) { parts.push(`ShipStation ✖ ${e.message}`); }
  }
  if (failed) throw new Error(parts.join(" · ") + " (address updates are safe to re-apply)");
  return { note: parts.join(" · ") };
}

/* ---- Staged actions from the Helpdesk app (Slack has its own buttons; this is the same thing from the ticket page) ---- */
function codeFrom(text) { const m = String(text || "").match(/\bcode\s+([A-Z0-9]{4,})\b/); return m ? m[1] : null; }
async function listActions(ticketId) {
  const r = await db(`SELECT id, kind, title, summary, status, result, decided_by, created_at, decided_at FROM emily_actions WHERE ticket_id=$1 ORDER BY created_at DESC LIMIT 12`, [String(ticketId)]);
  return r.rows.map((a) => ({ ...a, code: codeFrom(a.result) || codeFrom(a.summary) }));
}
async function applyAction(id, who, overrides = null) {
  const rec = (await db(`SELECT * FROM emily_actions WHERE id=$1`, [id])).rows[0];
  if (!rec) throw new Error("that action no longer exists");
  if (rec.status !== "staged") throw new Error(`that action was already ${rec.status}`);
  const p = overrides ? null : pendingAct.get(id);
  let result;
  try {
    if (p) { result = await p.exec(); pendingAct.delete(id); }
    else if (RESTAGE[rec.kind]) {
      // The app restarted since Emily staged this (or the person changed a detail) — re-run the proposal and apply it in one go.
      pendingAct.delete(id);
      const ctx = { results: [] };
      const input = { ...(rec.input || {}), ...(overrides || {}) };
      if (rec.kind === "shopify_propose_discount" && !input.code) input.code = codeFrom(rec.summary);   // keep the code the draft may already mention
      const out = await execNow.run(ctx, () => RESTAGE[rec.kind](input));
      if (!ctx.results.length) throw new Error((out && (out.note || out.error)) || "couldn't be applied any more");
      result = ctx.results[0].result;
    } else throw new Error("no way to run this kind of action");
  } catch (e) { await markAction(id, "failed", { by: who, result: e.message }); throw e; }
  await markAction(id, "applied", { by: who, result: (result && result.note) || "ok" });
  if (result && result.files && result.files.length) { try { await db(`UPDATE emily_actions SET files=$2 WHERE id=$1`, [id, JSON.stringify(result.files.map((f) => ({ ...f, sent: false })))]); } catch (_) {} }
  if (p && p.ts && app) { try { await app.client.chat.update({ channel: APPROVALS_CH, ts: p.ts, text: "Applied", blocks: [{ type: "section", text: { type: "mrkdwn", text: `✅ *Applied from Helpdesk* by ${who} — ${p.title}\n${(result && result.note) || p.summary}` } }] }); } catch (_) {} }
  if (rec.ticket_id) { try { await core.addNote({ ticketId: rec.ticket_id, text: `⚙️ ${rec.title} — applied by ${who}\n→ ${(result && result.note) || "done"}`, who }); } catch (_) {} }
  return { ok: true, note: result && result.note, code: codeFrom(result && result.note) || codeFrom(rec.summary), files: (result && result.files) || [] };
}
// Files produced by applied actions on this ticket (return labels) that haven't gone out on a reply yet.
async function pendingFiles(ticketId) {
  const r = await db(`SELECT id, files FROM emily_actions WHERE ticket_id=$1 AND status='applied' AND files IS NOT NULL`, [String(ticketId)]);
  const out = [];
  for (const a of r.rows) for (const f of a.files || []) if (!f.sent) out.push({ action_id: a.id, ...f });
  return out;
}
async function markFilesSent(ticketId) {
  await db(`UPDATE emily_actions SET files = (SELECT jsonb_agg(f || '{"sent":true}'::jsonb) FROM jsonb_array_elements(files) f) WHERE ticket_id=$1 AND status='applied' AND files IS NOT NULL`, [String(ticketId)]).catch(() => {});
}
async function setTodo(draftId, index, state, who) {
  const d = (await db(`SELECT id, ticket_id, todo FROM emily_drafts WHERE id=$1`, [draftId])).rows[0];
  if (!d || !Array.isArray(d.todo) || !d.todo[index]) throw new Error("that to-do no longer exists");
  d.todo[index] = { ...d.todo[index], state, by: who, at: new Date().toISOString() };
  await db(`UPDATE emily_drafts SET todo=$2 WHERE id=$1`, [draftId, JSON.stringify(d.todo)]);
  try { await core.addNote({ ticketId: d.ticket_id, text: `${state === "done" ? "☑️ Done" : "✖ Won't do"}: ${d.todo[index].what} — ${who}`, who }); } catch (_) {}
  return d.todo;
}

async function dismissAction(id, who) {
  const rec = (await db(`SELECT * FROM emily_actions WHERE id=$1`, [id])).rows[0];
  if (!rec) throw new Error("that action no longer exists");
  if (rec.status !== "staged") throw new Error(`that action was already ${rec.status}`);
  const p = pendingAct.get(id); pendingAct.delete(id);
  await markAction(id, "dismissed", { by: who });
  if (p && p.ts && app) { try { await app.client.chat.update({ channel: APPROVALS_CH, ts: p.ts, text: "Dismissed", blocks: [{ type: "section", text: { type: "mrkdwn", text: `✖ *Dismissed from Helpdesk* by ${who} — ${p.title}` } }] }); } catch (_) {} }
  return { ok: true };
}
// Swap {{DISCOUNT_CODE}} for the real code of a discount applied on this ticket; if a code was created but the
// text never mentions it, add one line before the sign-off so the customer actually receives it.
async function fillPlaceholders(ticketId, text, extraCodes = []) {
  let body = String(text || "");
  const applied = (await listActions(ticketId)).filter((a) => a.status === "applied" && a.kind === "shopify_propose_discount" && a.code);
  const codes = [...new Set([...extraCodes.filter(Boolean), ...applied.map((a) => a.code)])];
  const code = codes[0] || null;
  if (code) {
    body = body.replace(/\{\{\s*(DISCOUNT_)?CODE\s*\}\}/gi, code).replace(/\[(DISCOUNT )?CODE\]/gi, code);
    if (!body.includes(code)) {
      const line = `Your code is ${code} — it's single-use and ready to use now.`;
      const m = body.match(/\n\s*(—|--|-|Warmly|Best|Thanks|Thank you|Cheers|Sincerely)[^\n]*\n?[^\n]*$/i);
      body = m && m.index > 0 ? body.slice(0, m.index).replace(/\s+$/, "") + `\n\n${line}` + body.slice(m.index) : body.replace(/\s+$/, "") + `\n\n${line}`;
    }
  }
  return { text: body, code, pending: /\{\{\s*(DISCOUNT_)?CODE\s*\}\}|\[(DISCOUNT )?CODE\]/i.test(body) };
}

/* ---- Propose an order change (address / hold / unhold) ----
 * Address changes work whether or not the order has synced to ShipStation yet:
 *   - In ShipStation  → update BOTH ShipStation and Shopify (they don't sync address edits after placement).
 *   - Not yet synced  → update Shopify only; ShipStation imports the corrected address when it pulls the order.
 * Hold/unhold require the order to exist in ShipStation. */
async function shipstationProposeChange(input) {
  const action = String(input.action || "").toLowerCase();
  if (!["update_address", "hold", "unhold"].includes(action)) return { error: "action must be update_address, hold, or unhold." };
  if (!input.order) return { error: "Provide the order number." };

  const found = shipstationConfigured() ? await shipstationLookup(ssOrderNo(input.order)) : null;
  const o = Array.isArray(found) ? found.find((x) => x.order_id) : null;

  /* ---- hold / unhold: need a live ShipStation order ---- */
  if (action !== "update_address") {
    if (!shipstationConfigured()) return { error: "ShipStation not configured." };
    if (!o) return { note: `Couldn't find a ShipStation order for "${input.order}". Do not promise the change.` };
    if (o.shipped || o.shipstation_status === "shipped") return { note: `Order ${o.order_number} has already SHIPPED — it can't be held/released.` };
    const oid = o.order_id, hu = input.hold_until;
    const summary = action === "hold" ? `📦 Hold ShipStation order until ${input.hold_until || "(+2 days)"}` : `📦 Release ShipStation hold`;
    await stageAction({ kind: "shipstation_propose_change", input, title: `ShipStation change — order ${o.order_number}`, summary, ticketId: input.ticket_id,
      exec: async () => action === "hold" ? await ssHold(oid, hu) : await ssUnhold(oid) });
    return { ok: true, staged: true, note: `Staged a ${action} on order ${o.order_number} for Jose's approval.` };
  }

  /* ---- update_address ---- */
  if (!(input.street1 && input.city && input.state && input.postal_code)) return { error: "For update_address, provide street1, city, state, and postal_code." };
  const addr = { name: input.name, street1: input.street1, street2: input.street2, city: input.city, state: input.state, postal_code: input.postal_code, country: input.country, phone: input.phone };
  // Already shipped in ShipStation → can't change.
  if (o && (o.shipped || o.shipstation_status === "shipped")) return { note: `Order ${o.order_number} has already SHIPPED — its address can't be changed. Tell the customer it's on its way and lay out options; don't promise an address change.` };

  // Resolve the Shopify order (source of truth — ShipStation imports the address from here on sync).
  let shopHandle = null, shopFulfilled = false;
  try {
    const sf = await shopifyLookupOrder(String(input.order).trim());
    const sn = Array.isArray(sf) ? sf[0] : null; const sst = sn ? storeByBrand(sn.store) : null;
    if (sn && sst && sn.id) { shopHandle = { st: sst, gid: sn.id, name: sn.name }; const fs = String(sn.displayFulfillmentStatus || "").toUpperCase(); shopFulfilled = fs === "FULFILLED"; }
  } catch { /* fall through */ }

  if (!o && !shopHandle) return { note: `Couldn't find order "${input.order}" in ShipStation or Shopify. Ask the customer to confirm the order number or the email used at checkout — do not promise the change.` };
  if (!o && shopFulfilled) return { note: `Order ${shopHandle.name} is already marked FULFILLED in Shopify — the address can't be changed before ship. Don't promise it; explain and lay out options.` };

  const ordNo = o ? o.order_number : shopHandle.name;
  const inSS = !!o;
  const targets = inSS ? "ShipStation + Shopify" : (shopHandle ? "Shopify now; ShipStation re-checked on Apply" : "ShipStation only");
  const preSyncNote = !inSS && shopHandle ? " · not yet in ShipStation — Apply corrects Shopify and also writes ShipStation the moment it has synced" : (!shopHandle ? " · Shopify order not matched — ShipStation only" : "");
  const summary = `📦 Update ship-to (${targets})${preSyncNote} → ${[input.name, input.street1, input.street2, `${input.city || ""}, ${input.state || ""} ${input.postal_code || ""}`.trim(), input.country].filter((x) => x && String(x).trim()).join(" · ")}`;
  await stageAction({ kind: "shipstation_propose_change", input, title: `Address change — order ${ordNo}`, summary, ticketId: input.ticket_id,
    exec: async () => await applyAddressChange(input, addr, shopHandle) });
  return { ok: true, staged: true, note: `Staged an address change on order ${ordNo} for Jose's approval — Apply updates Shopify AND ShipStation (ShipStation is re-checked at Apply time so both stay in sync${inSS ? "" : "; if it hasn't imported yet, Shopify is corrected and ShipStation pulls the corrected address on sync"}). It will NOT change until he clicks Apply. Tell the customer we're getting it updated — do NOT say it's done.` };
}

/* ---- Shopify writes: PP replacement orders + custom discounts (both approval-gated) ---- */
function storeByBrand(name) { return STORES.find((s) => (s.brand || "").toLowerCase() === String(name || "").toLowerCase()) || null; }
function storeFromOrderOrBrand(order, brand) {
  const m = String(order || "").replace(/^#/, "").toUpperCase().match(/^(LBO|LB|BB)/);
  if (m) return storeForPrefix(m[1]);
  if (brand) { const p = String(brand).toUpperCase(); return storeForPrefix(/OUTLET|LBO/.test(p) ? "LBO" : /BUMBUNNY|BB/.test(p) ? "BB" : /LARKSPUR|LB/.test(p) ? "LB" : "") || storeByBrand(brand); }
  return null;
}
async function resolveVariantIdBySku(st, sku) {
  if (!sku) return null;
  try { const d = await storeGraphQL(st, `query($q:String!){productVariants(first:1,query:$q){edges{node{id}}}}`, { q: `sku:${sku}` }); const e = d.productVariants && d.productVariants.edges && d.productVariants.edges[0]; return e ? e.node.id : null; }
  catch { return null; }
}
async function createReplacementOrder(st, { email, shippingAddress, lineItems, origOrder, reason }) {
  const orig = origOrder ? String(origOrder).trim() : "";
  // The replacement order must record WHAT it replaces — put the original order number in the note AND tags.
  const noteLines = [`Package Protection replacement — no charge${orig ? ` — replaces original order ${orig}` : ""}`];
  if (reason) noteLines.push(`Reason: ${reason}`);
  const tags = ["PP-replacement", "emily"]; if (orig) tags.push(`replaces-${orig.replace(/^#/, "")}`);
  const input = { email, note: noteLines.join("\n"), tags, lineItems, shippingAddress,
    appliedDiscount: { valueType: "PERCENTAGE", value: 100.0, title: "PP replacement", description: `Package Protection replacement — no charge${orig ? ` (original order ${orig})` : ""}` },
    shippingLine: { title: "Free shipping (replacement)", price: "0.00" } };
  const c = await storeGraphQL(st, `mutation($input:DraftOrderInput!){draftOrderCreate(input:$input){draftOrder{id} userErrors{field message}}}`, { input });
  const ue = c.draftOrderCreate.userErrors; if (ue && ue.length) throw new Error("create: " + ue.map((x) => x.message).join("; "));
  const did = c.draftOrderCreate.draftOrder.id;
  const comp = await storeGraphQL(st, `mutation($id:ID!){draftOrderComplete(id:$id){draftOrder{order{name}} userErrors{field message}}}`, { id: did });
  const ue2 = comp.draftOrderComplete.userErrors; if (ue2 && ue2.length) throw new Error("complete: " + ue2.map((x) => x.message).join("; "));
  return { note: `Created no-charge replacement order ${comp.draftOrderComplete.draftOrder.order.name} in ${st.brand}${orig ? ` (replaces ${orig})` : ""}. ShipStation will pull it for fulfillment.` };
}
// Resolve everything a replacement needs (store, items → variants, ship-to, email) without creating anything.
async function prepareReplacement(input) {
  if (!input.order) return { error: "Provide the original order number." };
  const found = await shopifyLookupOrder(String(input.order).trim());
  const node = Array.isArray(found) ? found[0] : null;
  if (!node) return { note: `Couldn't find order "${input.order}" to base a replacement on. Confirm the number or checkout email.` };
  const st = storeByBrand(node.store); if (!st) return { error: `Couldn't map store "${node.store}".` };
  const sa = input.address && input.address.street1 ? { address1: input.address.street1, address2: input.address.street2 || null, city: input.address.city, province: input.address.state, zip: input.address.postal_code, country: input.address.country || "US" }
                                                    : (node.shippingAddress || {});
  if (!sa.address1 || !sa.city) return { error: `Order ${node.name} has no usable shipping address on file — can't build a replacement.` };
  const shippingAddress = { address1: sa.address1, address2: sa.address2 || null, city: sa.city, province: sa.province, zip: sa.zip, country: sa.country || "US" };
  const srcItems = ((node.lineItems && node.lineItems.edges) || []).map((e) => e.node);
  let want = srcItems;
  if (Array.isArray(input.items) && input.items.length) {
    want = input.items.map((it) => {
      const match = srcItems.find((s) => (it.sku && s.sku === it.sku) || (it.title && s.title && s.title.toLowerCase() === String(it.title).toLowerCase()));
      return match ? { title: match.title, sku: match.sku, quantity: it.quantity || match.quantity } : { title: it.title || it.sku, sku: it.sku, quantity: it.quantity || 1 };
    });
  }
  if (!want.length) return { error: "No items resolved for the replacement." };
  const lineItems = [];
  for (const it of want) {
    const vid = await resolveVariantIdBySku(st, it.sku);
    if (vid) lineItems.push({ variantId: vid, quantity: it.quantity || 1 });
    else lineItems.push({ title: it.title || it.sku || "Replacement item", quantity: it.quantity || 1, originalUnitPrice: "0.00", requiresShipping: true });
  }
  const email = node.email || input.email;
  const itemsSummary = want.map((i) => `${i.quantity || 1}× ${i.title || i.sku}`).join(", ");
  return { st, node, email, shippingAddress, lineItems, itemsSummary, shipTo: [shippingAddress.address1, shippingAddress.city, shippingAddress.province, shippingAddress.zip].filter(Boolean).join(", ") };
}
async function shopifyProposeReplacement(input) {
  const p = await prepareReplacement(input);
  if (p.error || p.note) return p;
  const { st, node, email, shippingAddress, lineItems, itemsSummary, shipTo } = p;
  await stageAction({ kind: "shopify_propose_replacement", input, title: `PP replacement — ${st.brand} (from ${node.name})`, ticketId: input.ticket_id,
    summary: `🎁 Create a NO-CHARGE replacement order → ${email || "(no email on order)"}\nItems: ${itemsSummary}\nShip to: ${shipTo}`,
    exec: async () => await createReplacementOrder(st, { email, shippingAddress, lineItems, origOrder: node.name, reason: input.reason }) });
  return { ok: true, staged: true, note: `Staged a no-charge PP replacement of [${itemsSummary}] for Jose's approval. It will NOT be created until he clicks Apply. Tell the customer their replacement is on its way — do NOT quote a new order number yet.` };
}

/* ---- Cancel & refund (Shopify) ----
 * Both are approval-gated when Emily proposes them, and run directly (with a confirm) when a person does it in the app. */
const ORDER_DETAIL_QUERY = `query($q:String!){orders(first:1,query:$q){edges{node{
  id name email createdAt cancelledAt closed displayFinancialStatus displayFulfillmentStatus note tags
  customer{displayName}
  totalPriceSet{shopMoney{amount currencyCode}} subtotalPriceSet{shopMoney{amount}} totalShippingPriceSet{shopMoney{amount}} totalRefundedSet{shopMoney{amount}}
  shippingAddress{name firstName lastName address1 address2 city province provinceCode zip country countryCodeV2 phone}
  lineItems(first:50){edges{node{id title quantity refundableQuantity sku variantTitle originalUnitPriceSet{shopMoney{amount}} discountedTotalSet{shopMoney{amount}} variant{id availableForSale}}}}
  fulfillments(first:5){status createdAt trackingInfo{number url company}}
  refunds{id createdAt note totalRefundedSet{shopMoney{amount}}}
}}}}`;
async function orderDetail(raw) {
  const q = String(raw || "").replace(/^#/, "").replace(/\s+/g, "").toUpperCase();
  if (!q) return { error: "Provide an order number." };
  const m = q.match(/^(LBO|LB|BB)0*(\d+)$/);
  const stores = m && storeForPrefix(m[1]) ? [storeForPrefix(m[1]), ...STORES.filter((s) => s !== storeForPrefix(m[1]))] : STORES;
  const variants = m ? [`name:${m[1]}${m[2]}`, `name:#${m[1]}${m[2]}`] : [`name:${q}`, `name:#${q}`];
  for (const st of stores) for (const filter of variants) {
    try {
      const d = await storeGraphQL(st, ORDER_DETAIL_QUERY, { q: filter });
      const e = d.orders && d.orders.edges && d.orders.edges[0];
      if (!e) continue;
      const n = e.node;
      const money = (x) => x && x.shopMoney ? Number(x.shopMoney.amount) : 0;
      let ss = null;
      if (shipstationConfigured()) { try { const f = await shipstationLookup(ssOrderNo(n.name)); ss = Array.isArray(f) ? (f.find((x) => x.order_id) || f[0] || null) : null; } catch { ss = null; } }
      return {
        store: st.brand, id: n.id, name: n.name, email: n.email, customer: n.customer && n.customer.displayName, created_at: n.createdAt, cancelled_at: n.cancelledAt, closed: n.closed,
        financial_status: n.displayFinancialStatus, fulfillment_status: n.displayFulfillmentStatus, note: n.note, tags: n.tags,
        currency: n.totalPriceSet.shopMoney.currencyCode, total: money(n.totalPriceSet), subtotal: money(n.subtotalPriceSet), shipping: money(n.totalShippingPriceSet), refunded: money(n.totalRefundedSet),
        shipping_address: n.shippingAddress, 
        items: (n.lineItems.edges || []).map((x) => ({ id: x.node.id, title: x.node.title, variant: x.node.variantTitle, sku: x.node.sku, quantity: x.node.quantity, refundable_quantity: x.node.refundableQuantity, unit_price: money(x.node.originalUnitPriceSet), line_total: money(x.node.discountedTotalSet), in_stock: x.node.variant ? x.node.variant.availableForSale : null })),
        fulfillments: (n.fulfillments || []).map((f) => ({ status: f.status, at: f.createdAt, tracking: (f.trackingInfo || []).map((t) => ({ number: t.number, url: t.url, company: t.company })) })),
        refunds: (n.refunds || []).map((r) => ({ id: r.id, at: r.createdAt, note: r.note, amount: money(r.totalRefundedSet) })),
        shipstation: ss,
        can_cancel: !n.cancelledAt && String(n.displayFulfillmentStatus).toUpperCase() !== "FULFILLED" && !(ss && ss.shipped),
        can_change_address: !n.cancelledAt && String(n.displayFulfillmentStatus).toUpperCase() !== "FULFILLED" && !(ss && ss.shipped),
        can_refund: !n.cancelledAt && (money(n.totalPriceSet) - money(n.totalRefundedSet)) > 0.009,
      };
    } catch (e) { console.error(`  order detail ${st.brand} ${filter} — ${e.message}`); }
  }
  return { note: `No order found for "${raw}" in ${stores.map((s) => s.brand).join(", ")}.` };
}
async function ssCancel(orderId) {
  const o = await ssReq("GET", `/orders/${orderId}`);
  if (!o || !o.orderId) throw new Error(`ShipStation order ${orderId} not found.`);
  if (o.orderStatus === "shipped") throw new Error(`already shipped`);
  o.orderStatus = "cancelled";
  await ssReq("POST", `/orders/createorder`, o);
  return { ok: true };
}
const CANCEL_REASONS = ["CUSTOMER", "DECLINED", "FRAUD", "INVENTORY", "OTHER", "STAFF"];
async function cancelOrder(o, { reason, refund, restock, notify, note }) {
  const st = storeByBrand(o.store);
  const r = await storeGraphQL(st, `mutation($orderId:ID!,$reason:OrderCancelReason!,$refund:Boolean!,$restock:Boolean!,$notify:Boolean,$note:String){
      orderCancel(orderId:$orderId,reason:$reason,refund:$refund,restock:$restock,notifyCustomer:$notify,staffNote:$note){ job{id} orderCancelUserErrors{field message code} userErrors{field message} } }`,
    { orderId: o.id, reason: CANCEL_REASONS.includes(String(reason || "").toUpperCase()) ? String(reason).toUpperCase() : "CUSTOMER", refund: refund !== false, restock: restock !== false, notify: !!notify, note: note || null });
  const ue = [...(r.orderCancel.orderCancelUserErrors || []), ...(r.orderCancel.userErrors || [])];
  if (ue.length) throw new Error(ue.map((x) => x.message).join("; "));
  const parts = [`Shopify ${o.name} cancelled${refund !== false ? " + refunded" : ""}${restock !== false ? ", stock returned" : ""}`];
  if (o.shipstation && o.shipstation.order_id && !o.shipstation.shipped) { try { await ssCancel(o.shipstation.order_id); parts.push("ShipStation cancelled ✅"); } catch (e) { parts.push(`ShipStation ✖ ${e.message} — cancel it there by hand`); } }
  return { note: parts.join(" · ") };
}
// mode: "full" (everything still refundable, incl. shipping) | "items" (chosen line items, + shipping if asked) | "amount" (a dollar figure, no line items)
async function refundOrder(o, { mode, items, amount, shipping, note, notify, restock }) {
  const st = storeByBrand(o.store);
  const lineArgs = mode === "items" ? (items || []).filter((i) => i.line_item_id && Number(i.quantity) > 0).map((i) => ({ lineItemId: i.line_item_id, quantity: Number(i.quantity), restockType: restock === false ? "NO_RESTOCK" : "RETURN" })) : [];
  if (mode === "items" && !lineArgs.length) throw new Error("Pick at least one item to refund.");
  const sq = await storeGraphQL(st, `query($id:ID!,$li:[RefundLineItemInput!],$full:Boolean,$ship:RefundShippingInput){ order(id:$id){ suggestedRefund(refundLineItems:$li,suggestFullRefund:$full,refundShipping:$ship){
      amountSet{shopMoney{amount currencyCode}} maximumRefundableSet{shopMoney{amount}} shipping{amountSet{shopMoney{amount}}}
      suggestedTransactions{ gateway kind amountSet{shopMoney{amount currencyCode}} parentTransaction{id} }
      refundLineItems{ lineItem{id} quantity restockType } } } }`,
    { id: o.id, li: mode === "items" ? lineArgs : null, full: mode === "full", ship: (mode === "full" || (mode === "items" && shipping)) ? { fullRefund: true } : null });
  const sr = sq.order && sq.order.suggestedRefund;
  if (!sr) throw new Error("Shopify returned no refund suggestion for this order.");
  const max = Number(sr.maximumRefundableSet.shopMoney.amount);
  let target = mode === "amount" ? Number(amount) : Number(sr.amountSet.shopMoney.amount);
  if (!(target > 0)) throw new Error("Refund amount must be more than $0.");
  if (target > max + 0.009) throw new Error(`Only $${max.toFixed(2)} is still refundable on ${o.name}.`);
  const txs = (sr.suggestedTransactions || []).filter((t) => t.parentTransaction && t.parentTransaction.id);
  if (!txs.length) throw new Error("No refundable payment found on this order (was it paid, or already fully refunded?).");
  // Spread the target across the suggested transactions (normally there is one).
  let left = target; const transactions = [];
  for (const t of txs) { const a = Math.min(left, Number(t.amountSet.shopMoney.amount) || left); if (a <= 0) continue; transactions.push({ orderId: o.id, gateway: t.gateway, kind: "REFUND", amount: a.toFixed(2), parentId: t.parentTransaction.id }); left -= a; if (left <= 0.001) break; }
  if (left > 0.01) throw new Error(`Could only place $${(target - left).toFixed(2)} of $${target.toFixed(2)} against the original payment.`);
  const input = { orderId: o.id, note: note || null, notify: !!notify, transactions };
  if (mode !== "amount") { input.refundLineItems = (sr.refundLineItems || []).map((x) => ({ lineItemId: x.lineItem.id, quantity: x.quantity, restockType: restock === false ? "NO_RESTOCK" : (x.restockType && x.restockType !== "NO_RESTOCK" ? x.restockType : "RETURN") })); if (sr.shipping && Number(sr.shipping.amountSet.shopMoney.amount) > 0) input.shipping = { fullRefund: true }; }
  const r = await storeGraphQL(st, `mutation($input:RefundInput!){ refundCreate(input:$input){ refund{ id totalRefundedSet{shopMoney{amount currencyCode}} } userErrors{field message} } }`, { input });
  const ue = r.refundCreate.userErrors; if (ue && ue.length) throw new Error(ue.map((x) => x.message).join("; "));
  const done = Number(r.refundCreate.refund.totalRefundedSet.shopMoney.amount);
  return { note: `Refunded $${done.toFixed(2)} on ${o.name}${mode === "items" ? ` (${lineArgs.length} item line${lineArgs.length === 1 ? "" : "s"}${shipping ? " + shipping" : ""})` : mode === "full" ? " (full refund)" : ""}${notify ? " · customer emailed by Shopify" : ""}`, amount: done };
}
async function shopifyProposeCancel(input) {
  if (!input.order) return { error: "Provide the order number." };
  const o = await orderDetail(input.order);
  if (o.error || o.note) return o;
  if (!o.can_cancel) return { note: `Order ${o.name} can't be cancelled — it is ${o.cancelled_at ? "already cancelled" : "already fulfilled/shipped"}. Offer a return instead; do not promise a cancellation.` };
  const refund = input.refund !== false;
  await stageAction({ kind: "shopify_propose_cancel", input, title: `Cancel order ${o.name} — ${o.store}`, ticketId: input.ticket_id,
    summary: `🛑 Cancel ${o.name} ($${o.total.toFixed(2)}, ${o.items.length} item line${o.items.length === 1 ? "" : "s"}) → ${o.email || "?"}${refund ? "\nRefund the payment in full and return stock" : "\nNO refund (cancel only)"}${input.reason ? `\nReason: ${input.reason}` : ""}`,
    exec: async () => await cancelOrder(o, { reason: input.reason_code || "CUSTOMER", refund, restock: true, notify: false, note: input.reason || `Requested via ticket ${input.ticket_id || "?"}` }) });
  return { ok: true, staged: true, note: `Staged a cancellation of ${o.name}${refund ? " with a full refund" : ""} for Jose's approval. Nothing happens until he clicks Apply — tell the customer we're taking care of the cancellation; do NOT say it's done or that the refund has been issued.` };
}
async function shopifyProposeRefund(input) {
  if (!input.order) return { error: "Provide the order number." };
  const o = await orderDetail(input.order);
  if (o.error || o.note) return o;
  if (!o.can_refund) return { note: `Order ${o.name} has nothing left to refund ($${o.refunded.toFixed(2)} of $${o.total.toFixed(2)} already refunded${o.cancelled_at ? "; order is cancelled" : ""}).` };
  const mode = input.amount ? "amount" : (Array.isArray(input.items) && input.items.length ? "items" : "full");
  let items = [];
  if (mode === "items") {
    items = input.items.map((it) => { const m = o.items.find((x) => (it.sku && x.sku === it.sku) || (it.title && x.title.toLowerCase() === String(it.title).toLowerCase())); return m ? { line_item_id: m.id, quantity: Math.min(Number(it.quantity) || m.refundable_quantity || 1, m.refundable_quantity || 1), title: m.title } : null; }).filter(Boolean);
    if (!items.length) return { error: "None of those items matched the order's line items — pass the exact sku or title from shopify_lookup_order." };
  }
  const what = mode === "amount" ? `$${Number(input.amount).toFixed(2)}` : mode === "items" ? items.map((i) => `${i.quantity}× ${i.title}`).join(", ") + (input.shipping ? " + shipping" : "") : `the full remaining amount ($${(o.total - o.refunded).toFixed(2)})`;
  await stageAction({ kind: "shopify_propose_refund", input, title: `Refund — order ${o.name} (${o.store})`, ticketId: input.ticket_id,
    summary: `💸 Refund ${what} to the original payment → ${o.email || "?"}${input.reason ? `\nReason: ${input.reason}` : ""}`,
    exec: async () => await refundOrder(o, { mode, items, amount: input.amount, shipping: !!input.shipping, note: input.reason || `Requested via ticket ${input.ticket_id || "?"}`, notify: false, restock: input.restock !== false }) });
  return { ok: true, staged: true, note: `Staged a refund of ${what} on ${o.name} for Jose's approval. It will NOT be issued until he clicks Apply — tell the customer the refund is being processed and takes 5–10 business days to appear; do NOT say it has been issued.` };
}

/* ---- Shipment watch. Two lists, one scan of every shipped order since STUCK_SINCE (every 6 hours or on demand):
 *   never_scanned — Shopify still says "Tracking added": a label exists but the carrier has never scanned it, for STUCK_DAYS+.
 *   undelivered   — the order is UNDELIVERED_DAYS+ old and Shopify has no delivery on record (moving or not).
 * Rows are worked in the app (contacted / resolved / ignored) and close themselves when Shopify sees movement
 * (never_scanned) or delivery (both). ---- */
const STUCK_DAYS = Number(process.env.STUCK_DAYS) || 4;
const UNDELIVERED_DAYS = Number(process.env.UNDELIVERED_DAYS) || 15;
const STUCK_SINCE = process.env.STUCK_SINCE || "2026-06-01";   // never track anything ordered before this date
const NO_MOVEMENT = new Set(["FULFILLED", "LABEL_PRINTED", "LABEL_PURCHASED", "SUBMITTED", "MARKED_AS_FULFILLED"]);
const STUCK_QUERY = `query($q:String!,$after:String){ orders(first:50, after:$after, query:$q, sortKey:CREATED_AT, reverse:true){
  pageInfo{ hasNextPage endCursor }
  edges{ node{ id name createdAt email customer{ displayName } shippingAddress{ city provinceCode }
    fulfillments(first:5){ id status displayStatus createdAt updatedAt inTransitAt deliveredAt estimatedDeliveryAt trackingInfo{ number url company } } } } } }`;
async function upsertWatch(kind, st, n, f, t) {
  await db(`INSERT INTO hd_stuck (id, kind, store, order_name, order_id, customer_name, customer_email, city, tracking, tracking_url, carrier, display_status, tracking_added_at, order_created_at, in_transit_at, estimated_delivery_at, last_update_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
            ON CONFLICT (id, kind) DO UPDATE SET display_status=EXCLUDED.display_status, tracking=EXCLUDED.tracking, tracking_url=EXCLUDED.tracking_url, carrier=EXCLUDED.carrier,
              in_transit_at=EXCLUDED.in_transit_at, estimated_delivery_at=EXCLUDED.estimated_delivery_at, last_update_at=EXCLUDED.last_update_at, last_seen=now()`,
    [f.id, kind, st.brand, n.name, n.id, (n.customer && n.customer.displayName) || null, n.email || null, [n.shippingAddress && n.shippingAddress.city, n.shippingAddress && n.shippingAddress.provinceCode].filter(Boolean).join(", ") || null,
     t.number, t.url || null, t.company || null, f.displayStatus || null, f.createdAt, n.createdAt, f.inTransitAt || null, f.estimatedDeliveryAt || null, f.updatedAt || null]);
}
async function closeWatch(id, kind, why, status, extra = {}) {
  await db(`UPDATE hd_stuck SET moved_at=COALESCE(moved_at, now()), display_status=$3, last_seen=now(), delivered_at=COALESCE(delivered_at,$5),
              state=CASE WHEN state IN ('open','contacted') THEN 'resolved' ELSE state END,
              note=COALESCE(note,'') || CASE WHEN state IN ('open','contacted') THEN ' · ' || $4 ELSE '' END
            WHERE id=$1 AND kind=$2 AND moved_at IS NULL`, [id, kind, status, why, extra.delivered_at || null]).catch(() => {});
}
async function scanStuck() {
  const since = STUCK_SINCE;
  const stuckCut = Date.now() - STUCK_DAYS * 864e5, oldCut = Date.now() - UNDELIVERED_DAYS * 864e5;
  let scanned = 0, never = 0, undelivered = 0, errors = [];
  for (const st of STORES) {
    let after = null, pages = 0;
    try {
      do {
        const d = await storeGraphQL(st, STUCK_QUERY, { q: `fulfillment_status:shipped created_at:>=${since}`, after });
        const o = d.orders; pages++;
        for (const e of o.edges || []) {
          const n = e.node; scanned++;
          if (new Date(n.createdAt) < new Date(STUCK_SINCE)) continue;
          for (const f of n.fulfillments || []) {
            const t = (f.trackingInfo || [])[0];
            if (!t || !t.number || f.status !== "SUCCESS") continue;
            const ds = String(f.displayStatus || "").toUpperCase();
            const delivered = !!f.deliveredAt || ds === "DELIVERED" || ds === "PICKED_UP";
            const voided = ds === "CANCELED" || ds === "LABEL_VOIDED";
            if (delivered || voided) { const why = delivered ? `delivered (${f.deliveredAt ? new Date(f.deliveredAt).toISOString().slice(0, 10) : ds})` : `label ${ds.toLowerCase().replace("_", " ")}`; await closeWatch(f.id, "never_scanned", why, ds, { delivered_at: f.deliveredAt }); await closeWatch(f.id, "undelivered", why, ds, { delivered_at: f.deliveredAt }); continue; }
            const moved = !!f.inTransitAt || !NO_MOVEMENT.has(ds);
            if (moved) await closeWatch(f.id, "never_scanned", `moved on its own (${ds})`, ds);
            else if (new Date(f.createdAt).getTime() <= stuckCut) { await upsertWatch("never_scanned", st, n, f, t); never++; }
            if (new Date(n.createdAt).getTime() <= oldCut) { await upsertWatch("undelivered", st, n, f, t); undelivered++; }
          }
        }
        after = o.pageInfo && o.pageInfo.hasNextPage ? o.pageInfo.endCursor : null;
      } while (after && pages < 150);
    } catch (e) { errors.push(`${st.brand}: ${e.message}`); console.error(`shipment scan ${st.brand}:`, e.message); }
  }
  try { await db(`DELETE FROM hd_stuck WHERE order_created_at < $1`, [STUCK_SINCE]); } catch (_) {}
  try { await core.syncSet("stuck_scan", String(never + undelivered), { at: new Date().toISOString(), scanned, stuck: never, never_scanned: never, undelivered, errors }); } catch (_) {}
  console.log(`📦⏳ shipment scan: ${scanned} shipped orders checked · ${never} never scanned (${STUCK_DAYS}+ d) · ${undelivered} not delivered (${UNDELIVERED_DAYS}+ d)${errors.length ? ` · errors: ${errors.join(" | ")}` : ""}`);
  return { scanned, stuck: never, never_scanned: never, undelivered, errors };
}
async function listStuck(state, kind = "never_scanned") {
  kind = kind === "undelivered" ? "undelivered" : "never_scanned";
  const where = state && state !== "all" ? `WHERE kind=$2 AND state=$1` : `WHERE kind=$1 AND state IN ('open','contacted')`;
  const args = state && state !== "all" ? [state, kind] : [kind];
  const r = await db(`SELECT *, EXTRACT(EPOCH FROM (now() - tracking_added_at))/86400 AS days, EXTRACT(EPOCH FROM (now() - order_created_at))/86400 AS order_days,
                             (SELECT count(*)::int FROM hd_stuck x WHERE x.id = hd_stuck.id AND x.kind='never_scanned' AND x.state IN ('open','contacted')) AS also_never_scanned
                        FROM hd_stuck ${where} ORDER BY order_created_at ASC`, args);
  const counts = (await db(`SELECT state, count(*)::int AS n FROM hd_stuck WHERE kind=$1 GROUP BY state`, [kind])).rows.reduce((a, x) => (a[x.state] = x.n, a), {});
  const last = await core.syncGet("stuck_scan");
  return { kind, items: r.rows.map((x) => ({ ...x, days: Math.floor(Number(x.days)), order_days: Math.floor(Number(x.order_days)), also_never_scanned: x.also_never_scanned > 0 })), counts, last_scan: last ? last.state : null, threshold_days: kind === "undelivered" ? UNDELIVERED_DAYS : STUCK_DAYS, since: STUCK_SINCE };
}
async function stuckCounts() {
  const r = (await db(`SELECT kind, count(*)::int AS n FROM hd_stuck WHERE state IN ('open','contacted') GROUP BY kind`)).rows;
  return r.reduce((a, x) => (a[x.kind] = x.n, a), { never_scanned: 0, undelivered: 0 });
}
async function setStuckState(id, state, who, note, kind) {
  if (!["open", "contacted", "resolved", "ignored"].includes(state)) throw new Error("bad state");
  const r = await db(`UPDATE hd_stuck SET state=$2, state_by=$3, state_at=now(), note=COALESCE($4, note) WHERE id=$1 AND kind=$5 RETURNING order_name`, [id, state, who, note || null, kind === "undelivered" ? "undelivered" : "never_scanned"]);
  if (!r.rows.length) throw new Error("not found");
  return { ok: true };
}
// Open a ticket with the customer about the package and send the first email from the brand mailbox.
async function emailStuckCustomer(id, who, text, kind) {
  kind = kind === "undelivered" ? "undelivered" : "never_scanned";
  const s = (await db(`SELECT * FROM hd_stuck WHERE id=$1 AND kind=$2`, [id, kind])).rows[0];
  if (!s) throw new Error("not found");
  if (!s.customer_email) throw new Error("no customer email on this order");
  const mailbox = mailboxForBrand(s.store);
  if (!mailbox) throw new Error(`no mailbox for ${s.store}`);
  const subject = `An update on your ${s.store} order ${s.order_name}`;
  const r = await core.sendNewEmail({ mailbox, to: s.customer_email, subject, text, who, tags: ["stuck-package"] });
  await db(`UPDATE hd_stuck SET state='contacted', state_by=$2, state_at=now(), ticket_id=$3 WHERE id=$1`, [id, who, r.ticket_id]);   // both kinds, same package
  return { ok: true, ticket_id: r.ticket_id };
}
function stuckEmailTemplate(s) {
  const first = String(s.customer_name || "").split(" ")[0] || "there";
  if (s.kind === "undelivered" && !s.also_never_scanned) {
    return `Hi ${first},\n\nWe wanted to check in about your order ${s.order_name}. It left us a while ago, but ${s.carrier || "the carrier"}'s tracking still doesn't show it delivered, and that's longer than it should take.\n\nWe've opened a trace with the carrier. If it hasn't arrived by the end of this week, just reply here and we'll make it right — we can send a replacement or refund the order, whichever you prefer.\n\nTracking: ${s.tracking}${s.tracking_url ? ` (${s.tracking_url})` : ""}\n\nSorry for the wait, and thank you for your patience.\n\n— The ${s.store} Team`;
  }
  return `Hi ${first},\n\nWe wanted to reach out about your order ${s.order_name}. A shipping label was created and the package was handed to ${s.carrier || "the carrier"}, but their tracking still hasn't shown it moving, which usually means it's sitting somewhere in their network rather than lost.\n\nWe've flagged it with the carrier on our end. If tracking doesn't update in the next couple of days, just reply here and we'll make it right — we can send a replacement or refund the order, whichever you prefer.\n\nTracking: ${s.tracking}${s.tracking_url ? ` (${s.tracking_url})` : ""}\n\nSorry for the wait, and thank you for your patience.\n\n— The ${s.store} Team`;
}

/* ---- Direct order actions from the Helpdesk app (a person is doing it, so no Slack approval) ---- */
async function applyOrderAction({ kind, order, input = {}, who = "Helpdesk", ticketId = null }) {
  const o = await orderDetail(order);
  if (o.error) throw new Error(o.error);
  if (o.note) throw new Error(o.note);
  let result, title, summary;
  if (kind === "update_address") {
    const a = input.address || {};
    if (!(a.street1 && a.city && a.state && a.postal_code)) throw new Error("Street, city, state and ZIP are required.");
    if (!o.can_change_address) throw new Error(`${o.name} has already shipped or been cancelled — the address can't be changed.`);
    const addr = { name: a.name, street1: a.street1, street2: a.street2, city: a.city, state: String(a.state).toUpperCase(), postal_code: a.postal_code, country: String(a.country || "US").toUpperCase(), phone: a.phone };
    title = `Address change — order ${o.name}`; summary = [a.name, a.street1, a.street2, `${a.city}, ${a.state} ${a.postal_code}`, a.country].filter(Boolean).join(" · ");
    result = await applyAddressChange({ order: o.name }, addr, { st: storeByBrand(o.store), gid: o.id, name: o.name });
  } else if (kind === "cancel") {
    if (!o.can_cancel) throw new Error(`${o.name} can't be cancelled — it is ${o.cancelled_at ? "already cancelled" : "already fulfilled/shipped"}.`);
    title = `Cancel order ${o.name}`; summary = `${input.refund === false ? "no refund" : "full refund"} · ${input.restock === false ? "no restock" : "restock"} · reason ${input.reason_code || "CUSTOMER"}${input.note ? ` · ${input.note}` : ""}`;
    result = await cancelOrder(o, { reason: input.reason_code, refund: input.refund !== false, restock: input.restock !== false, notify: !!input.notify, note: input.note || `Cancelled from Helpdesk by ${who}${ticketId ? ` (ticket ${ticketId})` : ""}` });
  } else if (kind === "refund") {
    if (!o.can_refund) throw new Error(`${o.name} has nothing left to refund.`);
    title = `Refund — order ${o.name}`; summary = input.mode === "amount" ? `$${Number(input.amount).toFixed(2)}` : input.mode === "items" ? `${(input.items || []).length} item line(s)${input.shipping ? " + shipping" : ""}` : "full refund";
    result = await refundOrder(o, { mode: input.mode || "full", items: input.items, amount: input.amount, shipping: !!input.shipping, note: input.note || `Refund from Helpdesk by ${who}${ticketId ? ` (ticket ${ticketId})` : ""}`, notify: !!input.notify, restock: input.restock !== false });
  } else if (kind === "replacement") {
    const p = await prepareReplacement({ order: o.name, items: input.items, address: input.address, reason: input.reason });
    if (p.error) throw new Error(p.error); if (p.note) throw new Error(p.note);
    title = `Replacement order — from ${o.name}`; summary = `${p.itemsSummary} → ${p.shipTo}`;
    result = await createReplacementOrder(p.st, { email: p.email, shippingAddress: p.shippingAddress, lineItems: p.lineItems, origOrder: o.name, reason: input.reason });
  } else throw new Error(`Unknown order action "${kind}".`);
  const id = "act_" + crypto.randomUUID();
  await recordAction(id, { kind: `helpdesk_${kind}`, title, summary, ticketId, input: { order: o.name, ...input } });
  await markAction(id, "applied", { by: who, result: result && result.note });
  if (ticketId) { try { await core.addNote({ ticketId: String(ticketId), text: `⚙️ ${title} — by ${who}\n${summary}\n→ ${result && result.note ? result.note : "done"}`, who }); } catch (e) { console.error("order action note:", e.message); } }
  try { core.slackPost(`⚙️ *${title}* · by ${who}${ticketId ? ` · ticket ${ticketId}` : ""}\n${summary}\n→ ${result && result.note ? result.note : "done"}`); } catch (_) {}
  return { ok: true, title, note: result && result.note, order: await orderDetail(o.name) };
}
async function createDiscount(st, { kind, value, code, title, minSubtotal }) {
  const startsAt = new Date().toISOString();
  if (kind === "free_shipping") {
    const fs = { title: title || code, code, startsAt, customerSelection: { all: true }, destination: { all: true }, appliesOncePerCustomer: true, usageLimit: 1 };
    if (minSubtotal) fs.minimumRequirement = { subtotal: { greaterThanOrEqualToSubtotal: String(minSubtotal) } };
    const r = await storeGraphQL(st, `mutation($fs:DiscountCodeFreeShippingInput!){discountCodeFreeShippingCreate(freeShippingCodeDiscount:$fs){codeDiscountNode{id} userErrors{field message}}}`, { fs });
    const ue = r.discountCodeFreeShippingCreate.userErrors; if (ue && ue.length) throw new Error(ue.map((x) => x.message).join("; "));
    return { note: `Created single-use FREE SHIPPING code ${code} in ${st.brand}. Give it to the customer.` };
  }
  const cg = kind === "percentage"
    ? { value: { percentage: (Number(value) || 0) / 100 }, items: { all: true } }
    : { value: { discountAmount: { amount: String(value), appliesOnEachItem: false } }, items: { all: true } };
  const basic = { title: title || code, code, startsAt, customerSelection: { all: true }, customerGets: cg, appliesOncePerCustomer: true, usageLimit: 1 };
  const r = await storeGraphQL(st, `mutation($b:DiscountCodeBasicInput!){discountCodeBasicCreate(basicCodeDiscount:$b){codeDiscountNode{id} userErrors{field message}}}`, { b: basic });
  const ue = r.discountCodeBasicCreate.userErrors; if (ue && ue.length) throw new Error(ue.map((x) => x.message).join("; "));
  return { note: `Created single-use ${kind === "percentage" ? value + "% off" : "$" + value + " off"} code ${code} in ${st.brand}. Give it to the customer.` };
}
async function shopifyProposeDiscount(input) {
  const st = storeFromOrderOrBrand(input.order, input.brand);
  if (!st) return { error: "Couldn't determine the store — pass the order number or a brand (Larkspur Baby / Outlet / Bumbunny)." };
  const kind = String(input.kind || "").toLowerCase();
  if (!["percentage", "fixed", "free_shipping"].includes(kind)) return { error: "kind must be percentage, fixed, or free_shipping." };
  if ((kind === "percentage" || kind === "fixed") && !(Number(input.value) > 0)) return { error: "Provide a positive value for a percentage/fixed discount." };
  const code = String(input.code || `EMILY${(Date.now() % 1e7).toString(36)}${crypto.randomBytes(2).toString("hex").slice(0, 3)}`).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const label = kind === "free_shipping" ? "free shipping" : kind === "percentage" ? `${input.value}% off` : `$${input.value} off`;
  const orderRef = input.order ? String(input.order).trim().replace(/^#?/, "#") : "";
  // Record which order the courtesy is for, in the discount's admin title (traceability).
  const discTitle = input.title || `${label}${orderRef ? ` — order ${orderRef}` : ""} · ${code}`;
  await stageAction({ kind: "shopify_propose_discount", input, title: `Discount — ${st.brand}${orderRef ? ` (order ${orderRef})` : ""}`, ticketId: input.ticket_id,
    summary: `🏷️ Create a single-use ${label} code ${code}${orderRef ? ` for order ${orderRef}` : ""}${input.min_subtotal ? ` (min subtotal $${input.min_subtotal})` : ""} for the customer.`,
    exec: async () => await createDiscount(st, { kind, value: input.value, code, title: discTitle, minSubtotal: input.min_subtotal }) });
  return { ok: true, staged: true, note: `Staged a single-use ${label} code (${code}) for Jose's approval. It will NOT be created until he clicks Apply. You may tell the customer a code is on the way; don't promise it's active yet.` };
}

/* ---- NATIVE Shopify store credit (real account balance, no code) ---- */
async function findCustomer(st, email) {
  if (!email) return null;
  const d = await storeGraphQL(st, `query($q:String!){customers(first:1,query:$q){edges{node{id firstName displayName defaultEmailAddress{emailAddress}}}}}`, { q: `email:${email}` });
  const e = d.customers && d.customers.edges && d.customers.edges[0];
  return e ? e.node : null;
}
async function issueStoreCredit(st, customerGid, amount, currency) {
  // NOTE: we deliberately do NOT query back `account { balance }` — reading it needs the extra
  // read_store_credit_accounts scope. The write scope alone is enough to add the credit.
  const m = await storeGraphQL(st,
    `mutation($id:ID!,$in:StoreCreditAccountCreditInput!){storeCreditAccountCredit(id:$id,creditInput:$in){storeCreditAccountTransaction{id amount{amount currencyCode}} userErrors{field message}}}`,
    { id: customerGid, in: { creditAmount: { amount: String(amount), currencyCode: currency || "USD" } } });
  const ue = m.storeCreditAccountCredit.userErrors; if (ue && ue.length) throw new Error(ue.map((x) => x.message).join("; "));
  const tx = m.storeCreditAccountCredit.storeCreditAccountTransaction;
  const credited = tx && tx.amount ? `${tx.amount.amount} ${tx.amount.currencyCode}` : `${amount} ${currency || "USD"}`;
  return { ok: true, note: `✅ Added ${credited} store credit to the customer's account.` };
}
// DEBIT (remove) store credit — for correcting an over-credit. Same write scope; id accepts the customer ID.
async function debitStoreCredit(st, customerGid, amount, currency) {
  const m = await storeGraphQL(st,
    `mutation($id:ID!,$in:StoreCreditAccountDebitInput!){storeCreditAccountDebit(id:$id,debitInput:$in){storeCreditAccountTransaction{id amount{amount currencyCode}} userErrors{field message}}}`,
    { id: customerGid, in: { debitAmount: { amount: String(amount), currencyCode: currency || "USD" } } });
  const ue = m.storeCreditAccountDebit.userErrors; if (ue && ue.length) throw new Error(ue.map((x) => x.message).join("; "));
  const tx = m.storeCreditAccountDebit.storeCreditAccountTransaction;
  const debited = tx && tx.amount ? `${tx.amount.amount} ${tx.amount.currencyCode}` : `${amount} ${currency || "USD"}`;
  return { ok: true, note: `✅ Removed ${debited} from the customer's store credit.` };
}
// STAGE native store credit to the customer's account. On Apply it credits the account (Shopify auto-creates
// one if needed) — no code; it applies at checkout when the customer is signed in with that email.
async function shopifyProposeStoreCredit(input) {
  const amount = Number(input.amount);
  if (!(amount > 0)) return { error: "Provide a positive dollar amount for the store credit." };
  const st = storeFromOrderOrBrand(input.order, input.brand);
  if (!st) return { error: "Couldn't determine the store — pass the order number or a brand (Larkspur Baby / Outlet / Bumbunny)." };
  // find the customer: prefer explicit email, else the order's email
  let email = input.email || null, orderRef = "";
  if (!email && input.order) {
    try { const sf = await shopifyLookupOrder(String(input.order).trim()); const sn = Array.isArray(sf) ? sf[0] : null; if (sn) { email = sn.email; orderRef = sn.name; } } catch { /* ignore */ }
  }
  if (!email) return { error: "Couldn't find the customer email — pass email or a valid order number." };
  const cust = await findCustomer(st, email);
  if (!cust) return { note: `No Shopify customer found for ${email} in ${st.brand}. Native store credit needs a customer record — confirm the checkout email, or use a discount code instead.` };
  const amt = amount.toFixed(2);
  const isDebit = /^(debit|remove|deduct|reverse)$/i.test(String(input.action || "credit"));
  if (isDebit) {
    await stageAction({ kind: "shopify_propose_store_credit", input, title: `Store credit REMOVAL — ${st.brand}${orderRef ? ` (order ${orderRef})` : ""}`, ticketId: input.ticket_id,
      summary: `💳➖ REMOVE *$${amt}* store credit from ${cust.displayName || email} (${email})${orderRef ? ` · order ${orderRef}` : ""}. Correction/debit.${input.reason ? ` Reason: ${input.reason}` : ""}`,
      exec: async () => await debitStoreCredit(st, cust.id, amt, "USD") });
    return { ok: true, staged: true, note: `Staged a REMOVAL of $${amt} store credit from ${email} (${st.brand}) for Jose's approval. It will NOT be deducted until he clicks Apply. This is an internal correction — do NOT email the customer about it unless asked.` };
  }
  await stageAction({ kind: "shopify_propose_store_credit", input, title: `Store credit — ${st.brand}${orderRef ? ` (order ${orderRef})` : ""}`, ticketId: input.ticket_id,
    summary: `💳 Add *$${amt}* native store credit to ${cust.displayName || email} (${email})${orderRef ? ` · order ${orderRef}` : ""}. Applies at checkout when signed in — no code.`,
    exec: async () => await issueStoreCredit(st, cust.id, amt, "USD") });
  return { ok: true, staged: true, note: `Staged $${amt} native store credit for ${email} (${st.brand}) for Jose's approval. It will NOT be added until he clicks Apply. In your reply, tell the customer we're adding $${amt} in store credit to their account (this email) and it applies automatically at checkout when they're signed in — do NOT say it's a code, and don't say it's done yet.` };
}


// Everything we hold on one customer, from the console's own database (hd_* tables) plus Emily's
// action log. This is how "one-time" goodwill becomes enforceable: she can see it was already given.
async function customerHistory(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return { error: "email required" };
  if (!pool) return { note: "no database connected — history unavailable" };
  const out = { email: e, tickets: [], actions_applied: [], goodwill_credits_given: 0, replacements_given: 0, discounts_given: 0 };
  try {
    const t = await db(`SELECT id, subject, brand, status, created_at, last_message_at, tags,
                               (SELECT left(m.body_text,300) FROM hd_messages m WHERE m.ticket_id=t.id AND m.from_agent ORDER BY m.at DESC LIMIT 1) AS our_last_reply
                          FROM hd_tickets t WHERE lower(customer_email)=$1 ORDER BY created_at DESC LIMIT 12`, [e]);
    out.tickets = t.rows.map((r) => ({ id: String(r.id), subject: r.subject, brand: r.brand, status: r.status, opened: r.created_at, last_activity: r.last_message_at, tags: r.tags || [], our_last_reply: r.our_last_reply || null }));
    const ids = t.rows.map((r) => String(r.id));
    const a = await db(`SELECT kind, title, summary, status, decided_at, input FROM emily_actions
                         WHERE status='applied' AND (ticket_id = ANY($1) OR lower(input->>'email')=$2) ORDER BY decided_at DESC LIMIT 30`, [ids, e]);
    out.actions_applied = a.rows.map((r) => ({ kind: r.kind, title: r.title, summary: (r.summary || "").slice(0, 200), when: r.decided_at }));
    for (const r of a.rows) {
      if (r.kind === "shopify_propose_store_credit" && !/removal/i.test(r.title || "")) {
        out.goodwill_credits_given += 1;
      }
      if (r.kind === "shopify_propose_replacement") out.replacements_given += 1;
      if (r.kind === "shopify_propose_discount") out.discounts_given += 1;
    }
    try { const cp = await customerProfile(e); out.shopify = { lifetime_orders: cp.lifetime.orders, lifetime_spent: cp.lifetime.spent, store_credit_balance: cp.lifetime.store_credit, customer_since: cp.lifetime.first_order, stores: cp.stores.filter((x) => x.found).map((x) => ({ store: x.store, orders: x.orders_count, spent: x.amount_spent, tags: x.tags, recent_orders: x.orders.slice(0, 5) })) }; } catch (_) {}
    out.note = out.tickets.length ? `${out.tickets.length} previous ticket(s); ${out.goodwill_credits_given} store credit(s), ${out.replacements_given} replacement(s), ${out.discounts_given} discount code(s) already given.` : "No previous tickets on record for this email.";
  } catch (err) { out.error = err.message; }
  return out;
}

/* ---- Customer profile (what Gorgias showed in its Shopify sidebar): profile per store, purchase summary, lifetime value, recent orders, store credit ---- */
const CUSTOMER_PROFILE_QUERY = `query($q:String!){customers(first:1,query:$q){edges{node{
  id firstName lastName displayName phone createdAt tags note numberOfOrders amountSpent{amount currencyCode}
  defaultEmailAddress{ emailAddress marketingState } defaultAddress{ address1 city provinceCode zip countryCodeV2 }
  orders(first:10,sortKey:CREATED_AT,reverse:true){edges{node{ name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus totalPriceSet{shopMoney{amount currencyCode}} }}}
}}}}`;
// Store credit is asked for separately: it needs its own scope (read_store_credit_accounts) and must not take the whole profile down with it.
const CUSTOMER_CREDIT_QUERY = `query($id:ID!){ customer(id:$id){ storeCreditAccounts(first:3){edges{node{ balance{amount currencyCode} }}} } }`;
const CUSTOMER_BY_ID_QUERY = CUSTOMER_PROFILE_QUERY.replace("query($q:String!){customers(first:1,query:$q){edges{node{", "query($id:ID!){customer(id:$id){").replace(/\}\}\}\}`$/, "}}`");
const ORDER_CUSTOMER_QUERY = `query($q:String!){orders(first:1,query:$q){edges{node{ customer{ id } }}}}`;
async function customerProfile(email, orderHint) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return { error: "email required" };
  const stores = [];
  for (const st of STORES) {
    try {
      const d = await storeGraphQL(st, CUSTOMER_PROFILE_QUERY, { q: `email:${e}` });
      let n = d.customers && d.customers.edges && d.customers.edges[0] && d.customers.edges[0].node;
      if (!n) {
        // Email search missed (different checkout email, guest account) — go through a known order instead.
        const hint = String(orderHint || "").replace(/^#/, "").toUpperCase();
        const q = hint ? `name:${hint}` : `email:${e}`;
        try {
          const o = await storeGraphQL(st, ORDER_CUSTOMER_QUERY, { q });
          const cid = o.orders && o.orders.edges && o.orders.edges[0] && o.orders.edges[0].node.customer && o.orders.edges[0].node.customer.id;
          if (cid) { const c = await storeGraphQL(st, CUSTOMER_BY_ID_QUERY, { id: cid }); n = c.customer || null; }
        } catch (err) { console.error(`customer via order ${st.brand} ${q}: ${err.message}`); }
      }
      if (!n) { stores.push({ store: st.brand, found: false }); continue; }
      let credit = 0, creditError = null;
      try { const c = await storeGraphQL(st, CUSTOMER_CREDIT_QUERY, { id: n.id }); credit = (((c.customer || {}).storeCreditAccounts || {}).edges || []).reduce((a, x) => a + Number(x.node.balance.amount || 0), 0); }
      catch (err) { creditError = err.message; }
      stores.push({
        store: st.brand, found: true, id: n.id, admin_url: `https://admin.shopify.com/store/${String(st.domain).replace(/\.myshopify\.com$/i, "")}/customers/${String(n.id).split("/").pop()}`,
        name: n.displayName || [n.firstName, n.lastName].filter(Boolean).join(" "), phone: n.phone, created_at: n.createdAt, tags: n.tags || [], note: n.note,
        marketing: n.defaultEmailAddress && n.defaultEmailAddress.marketingState, address: n.defaultAddress,
        orders_count: Number(n.numberOfOrders || 0), amount_spent: Number((n.amountSpent || {}).amount || 0), currency: (n.amountSpent || {}).currencyCode || "USD", store_credit: credit, credit_error: creditError,
        orders: (n.orders.edges || []).map((x) => ({ name: x.node.name, at: x.node.createdAt, cancelled: !!x.node.cancelledAt, financial: x.node.displayFinancialStatus, fulfillment: x.node.displayFulfillmentStatus, total: Number(x.node.totalPriceSet.shopMoney.amount) })),
      });
    } catch (err) { console.error(`customer profile ${st.brand} ${e}: ${err.message}`); stores.push({ store: st.brand, found: false, error: err.message }); }
  }
  const found = stores.filter((x) => x.found);
  const tickets = pool ? (await db(`SELECT id, subject, brand, status, created_at, last_message_at, messages_count FROM hd_tickets WHERE lower(customer_email)=$1 ORDER BY last_message_at DESC NULLS LAST LIMIT 8`, [e])).rows : [];
  const tcount = pool ? (await db(`SELECT count(*)::int AS n FROM hd_tickets WHERE lower(customer_email)=$1`, [e])).rows[0].n : tickets.length;
  return {
    email: e, name: found.map((x) => x.name).find(Boolean) || null, phone: found.map((x) => x.phone).find(Boolean) || null,
    lifetime: { orders: found.reduce((a, x) => a + x.orders_count, 0), spent: found.reduce((a, x) => a + x.amount_spent, 0), store_credit: found.reduce((a, x) => a + x.store_credit, 0), currency: (found[0] && found[0].currency) || "USD", first_order: found.map((x) => x.created_at).filter(Boolean).sort()[0] || null },
    stores, tickets_count: tcount,
    tickets: tickets.map((t) => ({ id: String(t.id), subject: t.subject, brand: t.brand, status: t.status, opened: t.created_at, last: t.last_message_at, messages: t.messages_count })),
  };
}

/* ---------------- Tools (read + approval-gated writes; used by DM + draft loop) ---------------- */
const TOOLS = [
  { name: "shopify_lookup_order", description: "Look up a real Shopify order by order name (e.g. #LB189673, #LBO8425, #BB21953) or customer email. It reads the brand PREFIX (LBO/LB/BB, longest-first) to route to the right store and tries every name format (with/without # and the bare number), then falls back to all stores. Pass the order number EXACTLY as the customer wrote it, including the BB/LB/LBO letters. Each result includes which store it belongs to plus status, fulfillment, tracking, line items, shipping address.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "shopify_check_stock", description: "Check LIVE stock for a PRODUCT and each of its sizes/variants. Use this WHENEVER a customer asks whether an item/print/size is available, asks what sizes you have, or BEFORE you offer or refuse a replacement in a specific print/size. Pass a product name or print (e.g. 'Puppy Love') or a SKU; optionally a brand hint ('Larkspur Baby' / 'Outlet' / 'Bumbunny'). Returns each size with in_stock (true/false) and quantity. NEVER decide replacement availability from an order's line items — always confirm here first.",
    input_schema: { type: "object", properties: { query: { type: "string" }, brand: { type: "string" } }, required: ["query"] } },
  { name: "shopify_check_subscription", description: "Check whether a customer is ALREADY subscribed to email / newsletter marketing. Use this WHENEVER a customer asks to sign up for emails, to be added to the newsletter/mailing list, or whether they're on the list. Pass the customer's email (optionally a brand hint). Returns subscribed true/false and marketing_state. If subscribed=true, CONFIRM they're already on the list instead of telling them to sign up.",
    input_schema: { type: "object", properties: { email: { type: "string" }, brand: { type: "string" } }, required: ["email"] } },
  { name: "shipstation_lookup", description: "LIVE shipping status from ShipStation (the fulfillment system) by order number or customer email: order status, on-hold, the ship-to address on file, carrier, service, tracking number, ship date, and whether the address can still be changed (only before it ships). Use for any 'where is my order / tracking / did it ship / can I change my address' question — it's the source of truth for fulfillment.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "shipstation_propose_change", description: "STAGE a change to an order for Jose's one-click approval (does NOT execute until he clicks Apply in Slack). An address change is written to BOTH ShipStation AND Shopify (Shopify doesn't push address edits to ShipStation after an order is placed, so both are kept in sync; ShipStation is re-checked at Apply time). This WORKS EVEN IF the order hasn't synced to ShipStation yet — it corrects Shopify now and ShipStation imports the fix on sync (Apply also writes ShipStation directly the moment it has synced). Use it WHENEVER the customer asked to correct their shipping ADDRESS and gave the new address (or to HOLD/UNHOLD) and the order has NOT shipped/been fulfilled — do NOT decline just because shipstation_lookup didn't find it yet; that only means it hasn't synced. action='update_address' (needs street1, city, state, postal_code; use the 2-letter state code e.g. TX and 2-letter country e.g. US; name/street2/phone optional) | 'hold' (optional hold_until YYYY-MM-DD, needs the order in ShipStation) | 'unhold'. Never tell the customer it's done — say we're getting it updated. Pass ticket_id.",
    input_schema: { type: "object", properties: { order: { type: "string" }, action: { type: "string" }, name: { type: "string" }, street1: { type: "string" }, street2: { type: "string" }, city: { type: "string" }, state: { type: "string" }, postal_code: { type: "string" }, country: { type: "string" }, phone: { type: "string" }, hold_until: { type: "string" }, ticket_id: { type: "number" } }, required: ["order", "action"] } },
  { name: "shopify_propose_replacement", description: "STAGE a NO-CHARGE replacement order for a Package Protection claim, for Jose's one-click approval (does NOT create anything until he clicks Apply). Copies the original order's ship-to and items (or a subset via items:[{sku?,title?,quantity}]) into a new $0 order with free shipping. Use ONLY for an approved PP resolution where the items are in stock. Never quote a new order number to the customer until approved. Pass the original order number and ticket_id.",
    input_schema: { type: "object", properties: { order: { type: "string" }, items: { type: "array", items: { type: "object", properties: { sku: { type: "string" }, title: { type: "string" }, quantity: { type: "number" } } } }, reason: { type: "string" }, email: { type: "string" }, ticket_id: { type: "number" } }, required: ["order"] } },
  { name: "shopify_propose_cancel", description: "STAGE a cancellation of an UNSHIPPED order for Jose's one-click approval (does NOT cancel until he clicks Apply). Use when the customer asks to cancel an order that has not been fulfilled/shipped (check shopify_lookup_order / shipstation_lookup first). By default the payment is refunded in full and stock is returned; pass refund=false only if the customer explicitly wants to keep a credit instead. If the order has already shipped, do NOT use this — explain it's on its way and lay out the return options. Pass the order number, a short reason, and ticket_id. Never tell the customer it's done — say we're taking care of it.",
    input_schema: { type: "object", properties: { order: { type: "string" }, reason: { type: "string" }, reason_code: { type: "string", description: "CUSTOMER (default) | INVENTORY | OTHER" }, refund: { type: "boolean" }, ticket_id: { type: "number" } }, required: ["order"] } },
  { name: "shopify_propose_refund", description: "STAGE a refund to the customer's ORIGINAL PAYMENT for Jose's one-click approval (does NOT refund until he clicks Apply). Three ways: no items and no amount = refund everything still refundable (items + shipping); items:[{sku or title, quantity}] = refund just those lines (add shipping=true to include shipping); amount = a specific dollar figure (partial/goodwill refund). Use for approved returns received, damaged/missing items the customer wants money back for, or an approved partial refund — NOT for store credit (use shopify_propose_store_credit) and NOT to cancel an unshipped order (use shopify_propose_cancel). CALL customer_history first. Pass the order number, a reason, and ticket_id. Tell the customer the refund is being processed and takes 5–10 business days to show — never say it has been issued.",
    input_schema: { type: "object", properties: { order: { type: "string" }, items: { type: "array", items: { type: "object", properties: { sku: { type: "string" }, title: { type: "string" }, quantity: { type: "number" } } } }, amount: { type: "number" }, shipping: { type: "boolean" }, restock: { type: "boolean" }, reason: { type: "string" }, ticket_id: { type: "number" } }, required: ["order"] } },
  { name: "shopify_propose_discount", description: "STAGE a single-use discount CODE for the customer, for Jose's one-click approval (does NOT create until he clicks Apply). kind='percentage' (value=percent, e.g. 10) | 'fixed' (value=dollars off) | 'free_shipping' (optional min_subtotal). Route by passing the order number OR a brand (Larkspur Baby / Outlet / Bumbunny). Use for approved goodwill discounts or a free-shipping courtesy. Optionally pass a code; otherwise one is generated. Pass ticket_id. In your draft reply, write the code EXACTLY as {{DISCOUNT_CODE}} (e.g. 'use code {{DISCOUNT_CODE}} at checkout') — it is swapped for the real, active code the moment Jose approves; never invent a code and never say it is active yet.",
    input_schema: { type: "object", properties: { order: { type: "string" }, brand: { type: "string" }, kind: { type: "string" }, value: { type: "number" }, code: { type: "string" }, min_subtotal: { type: "number" }, title: { type: "string" }, ticket_id: { type: "number" } }, required: ["kind"] } },
  { name: "shopify_propose_store_credit", description: "STAGE a NATIVE Shopify store-credit change on the customer's account for Jose's one-click approval (does NOT execute until he clicks Apply). action='credit' (default) ADDS real store credit to the account balance — NOT a code; it applies automatically at checkout when the customer is signed in with that email (Shopify auto-creates the account if needed). Use credit for any approved STORE-CREDIT resolution (Package Protection lost/stolen credit, goodwill credit, non-PP 50% good-faith credit). action='debit' REMOVES store credit from the account — use ONLY to correct an over-credit / duplicate credit (e.g. the same credit was applied twice); a debit is an internal correction, so do NOT email the customer about it. Pass amount (dollars) and the order number (preferred — routes the store and finds the customer) or brand + email; optional reason; ticket_id. For a credit, word your reply as account credit, never a code.",
    input_schema: { type: "object", properties: { action: { type: "string", description: "'credit' (add, default) or 'debit' (remove, to fix an over-credit)" }, order: { type: "string" }, brand: { type: "string" }, email: { type: "string" }, amount: { type: "number" }, reason: { type: "string" }, ticket_id: { type: "number" } }, required: ["amount"] } },
  { name: "customer_history", description: "What we already know about THIS customer across every past ticket: previous conversations (subject, date, outcome), every store credit / replacement / discount already given, and how many goodwill credits they have received. CALL THIS before offering any goodwill credit, replacement, or refund, and whenever a customer says 'again', 'last time', 'second time', or references a previous order or issue. The non-PP 50% good-faith credit is ONE TIME per customer — if goodwill_credits_given is 1 or more, do NOT offer it again; escalate instead.",
    input_schema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] } },
  { name: "helpdesk_recent_tickets", description: "List recent Helpdesk tickets (newest first): id, subject, customer, brand, status, whether the customer is waiting.",
    input_schema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "helpdesk_ticket_conversation", description: "Read the full message thread of one Helpdesk ticket by id.",
    input_schema: { type: "object", properties: { ticket_id: { type: "string" } }, required: ["ticket_id"] } },
];
async function runTool(name, input) {
  try {
    if (name === "shopify_lookup_order") return await shopifyLookupOrder(input.query);
    if (name === "shopify_check_stock") return await shopifyCheckStock(input.query, input.brand);
    if (name === "shopify_check_subscription") return await shopifyCheckSubscription(input.email, input.brand);
    if (name === "shipstation_lookup") return await shipstationLookup(input.query);
    if (name === "shipstation_propose_change") return await shipstationProposeChange(input);
    if (name === "shopify_propose_replacement") return await shopifyProposeReplacement(input);
    if (name === "shopify_propose_discount") return await shopifyProposeDiscount(input);
    if (name === "shopify_propose_cancel") return await shopifyProposeCancel(input);
    if (name === "shopify_propose_refund") return await shopifyProposeRefund(input);
    if (name === "shopify_propose_store_credit") return await shopifyProposeStoreCredit(input);
    if (name === "customer_history") return await customerHistory(input.email);
    if (name === "helpdesk_recent_tickets") {
      const d = await db(`SELECT id, subject, brand, status, customer_email, last_message_at,
                                 (last_inbound_at IS NOT NULL AND (last_outbound_at IS NULL OR last_inbound_at > last_outbound_at)) AS customer_waiting
                            FROM hd_tickets WHERE NOT spam ORDER BY last_message_at DESC NULLS LAST LIMIT $1`, [Math.min(Number(input.limit) || 10, 50)]);
      return d.rows.map((t) => ({ id: String(t.id), subject: t.subject, brand: t.brand, status: t.status, customer: t.customer_email, last: t.last_message_at, customer_waiting: t.customer_waiting }));
    }
    if (name === "helpdesk_ticket_conversation") {
      const d = await db(`SELECT from_agent, internal, sender_email, body_text, at FROM hd_messages WHERE ticket_id=$1 ORDER BY at ASC`, [String(input.ticket_id)]);
      return d.rows.map((m) => ({ from: m.sender_email, from_agent: m.from_agent, internal: m.internal, at: m.at, text: core.stripQuoted(m.body_text).text.slice(0, 2500) }));
    }
    return { error: `unknown tool ${name}` };
  } catch (e) { return { error: e.message }; }
}

/* ---------------- Agentic helpers ---------------- */
async function agentLoop(messages, maxSteps) {
  const SYS = await systemPrompt();
  for (let step = 0; step < (maxSteps || 8); step++) {
    const resp = await anthropic.messages.create({ model: CLAUDE_MODEL, max_tokens: 4000, system: SYS, tools: TOOLS, messages });
    messages.push({ role: "assistant", content: resp.content });
    if (resp.stop_reason === "tool_use") {
      const results = [];
      for (const b of resp.content) if (b.type === "tool_use") results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(await runTool(b.name, b.input || {})).slice(0, 20000) });
      messages.push({ role: "user", content: results });
      continue;
    }
    return resp.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  }
  // Step budget hit while the model was still mid-tool-use. Make ONE final call that forbids
  // NEW tool calls (tools stay declared so the tool_use/tool_result history stays valid), forcing
  // a real answer instead of "" — which downstream would surface as "category: unknown".
  try {
    const fin = await anthropic.messages.create({ model: CLAUDE_MODEL, max_tokens: 4000, system: SYS, tools: TOOLS, tool_choice: { type: "none" }, messages });
    const t = fin.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (t) return t;
  } catch (e) { console.error("agentLoop finalize failed:", e.message); }
  return "";
}
const histories = new Map();
const keyFor = (c, t) => `${c}:${t || "root"}`;
function trimHistory(h) { if (h.length <= 30) return h; let s = h.length - 30; while (s < h.length && !(h[s].role === "user" && typeof h[s].content === "string")) s++; return s < h.length ? h.slice(s) : h.slice(-2); }
async function respond(userText, histKey) {
  const history = histories.get(histKey) || [];
  history.push({ role: "user", content: userText });
  const text = (await agentLoop(history, 6)) || "Sorry — I got stuck. Mind rephrasing?";
  histories.set(histKey, trimHistory(history));
  return text;
}
function parseJSON(s) { try { const a = s.indexOf("{"), b = s.lastIndexOf("}"); return JSON.parse(s.slice(a, b + 1)); } catch { return null; } }


// ---- Default rules. On first boot these are copied into the database as policy key "rules";
// after that the console's Policies page is the source of truth and this block is only a fallback.
const DEFAULT_RULES =
  `LOCAL PICKUP (Larkspur Baby and Larkspur Baby Outlet): pickup is available Monday through Friday, 8:30am to 2:00pm Central. No call or appointment needed. Address: 701 E Plano Pkwy, Suite 103, Plano, TX 75074. Tell the customer to look for the door with the Larkspur logo at Suite 103 and press the doorbell — one of our team will come out with the package. Our doors stay locked for the safety of our staff, so the doorbell is the way in. No pickup on weekends. If the customer asks about pickup windows, give these hours — there are no separate morning/afternoon windows any more. IGNORE any older pickup windows (10–12, 2–3, call-ahead, appointment) that appear in earlier messages of the thread or in previous drafts: they are out of date; these hours are the only correct ones. Pickup needs no scheduling, so never ask the customer to pick a slot or promise to confirm a time. ` +
  `PRODUCT FACTS (all three brands): our fabric blend is 95% bamboo viscose and 5% spandex. Our products are NOT OEKO-TEX certified — if a customer asks about OEKO-TEX or any certification, answer honestly that our products are not OEKO certified; NEVER claim a certification we do not hold. ` +
  `RETURNED TO SENDER / UNDELIVERABLE (the package physically came BACK to us — carrier "return to sender," bad/incomplete address, unclaimed at pickup): we can RESHIP at no cost or REFUND the order total minus original shipping — offer the reship first. This applies to any customer (we have the package in hand). Money/inventory move → escalate=true; draft states it confidently. ` +
  `PACKAGE PROTECTION IS A PAID BENEFIT — TIER EVERY lost / not-received / missing-items case by whether the order HAS it. A free full reshipment/replacement, full refund, or full store credit is a PACKAGE-PROTECTION benefit ONLY. For a customer WITHOUT Package Protection you must NEVER offer a free reship or full credit — the MOST you may offer is a ONE-TIME good-faith 50% STORE CREDIT. Handing non-PP customers the same remedy as PP customers removes the reason to buy protection, so hold this line: stay warm and empathetic and be proactive to prevent bigger issues, but uphold the policy. ALWAYS check the order's line items for a "Package Protection" SKU (shopify_lookup_order) to know which tier applies; if PP presence is unclear, escalate rather than assume it is there. ` +
  `"MARKED DELIVERED BUT NOT RECEIVED" (tracking says delivered, customer says it never came): STEP 1 — on their FIRST report, do NOT issue OR promise anything. Empathize and explain that carriers (especially USPS) sometimes scan a package delivered early or in error; ask them to give it up to 24 hours and check the mailbox, around the property, and with household/neighbors, and if it still hasn't arrived by the END OF THE NEXT BUSINESS DAY, to reply back and we'll go from there. In this first message make NO remedy commitment: do NOT say "we'll make it right," do NOT imply or promise a refund, replacement, or reship, and do NOT mention the 50% credit yet. This first reply is guidance only → escalate=false. STEP 2 — ONLY once they have waited and come back to say it STILL hasn't arrived: WITH Package Protection → offer their CHOICE of a STORE CREDIT or a RESHIPMENT of the order; WITHOUT Package Protection → as a show of good faith, offer a one-time 50% STORE CREDIT of the order value, and gently note that Package Protection was removed from the order at checkout, so a full reship or refund isn't available and the 50% store credit is the most we can do (NO reship, NO full credit). Step 2 = money move → escalate=true (note the amount). ` +
  `MISSING ITEMS (order arrived but some items are missing): STEP 1 — first ask (unless already answered) whether the PACKAGING was damaged or looked tampered with, and exactly WHICH item(s) are missing. STEP 2 — tier by Package Protection: WITH PP → a STORE CREDIT for the missing items OR RESHIP the missing items (their choice); WITHOUT PP → the MOST we can offer is a 50% STORE CREDIT for the value of the MISSING items only. Resolution = money move → escalate=true (note the amount). ` +
  `LOST IN TRANSIT / STOLEN (tracking stalled or never delivered, or a confirmed porch theft): same tiering — WITH PP resolve per Package Protection (reship if in stock, else store credit); WITHOUT PP a one-time 50% good-faith store credit is the ceiling, never a free full reship. Money move → escalate=true. ` +
  `CRITICAL — the draft must be a COMPLETE, decisive answer the customer can act on NOW: never write "we'll be in touch," "we'll follow up shortly," or "finalizing the details," and never defer to later. ` +
  `PACKAGE PROTECTION CLAIM MECHANICS — for a PP customer the resolutions are RESHIPMENT/replacement or STORE CREDIT only; NEVER a refund on a PP claim, even if they ask. Before promising a reship, confirm the items are in stock (shopify_check_stock); if the exact item is out of stock, offer store credit or an in-stock alternative instead. (Whether PP applies vs. the non-PP 50% good-faith ceiling is set by the tiered flows above.) ` +
  `RETURNS — pick the portal from the ORDER-NUMBER PREFIX and send the link in the same reply (never say you're "confirming the correct link" or "will follow up"). Match the LONGEST prefix (check LBO before LB): "LBO" = Larkspur Baby Outlet → returns portal https://larkspurbabyoutlet.loopreturns.com/#/ ; "LB" = Larkspur Baby → returns portal https://larkspurbaby.loopreturns.com/#/ ; "BB" = Bumbunny Baby → returns portal https://bumbunnybaby.loopreturns.com/#/ . We do returns, NOT exchanges (for a different size/color, they return for a refund or store credit and place a new order). ` +
  `LARKSPUR OUTLET (LBO) & BUMBUNNY (BB) RETURN POLICY — same terms for both: returns must be requested within 7 DAYS of delivery; items unworn, unwashed, in original condition with tags & original packaging; refund to original payment method (original shipping is NOT refunded); NO exchanges; a return-label fee (by weight/contents) is deducted from the refund; refunds post 3–4 business days after the return is received & approved; drop off within 28 days. Sale items and damage/Package-Protection handling for LBO/BB are not yet defined → escalate those specific cases to Jose rather than assuming Larkspur's rules. Start every LBO/BB return through the Loop portal above. ` +
  `STOCK CHECKS — use the shopify_check_stock tool for the SPECIFIC product + size in question. NEVER judge availability from an order's line-item availableForSale — that only reflects the exact variant they already bought, NOT whether a given print/size is available for a replacement. Whenever a customer asks "is X available / what sizes do you have," or before you say ANY item/size is in or out of stock, call shopify_check_stock (pass the print/product name and the brand) and read that size's in_stock/qty. Do NOT tell a customer something is sold out unless shopify_check_stock shows in_stock=false for that exact size. ` +
  `DAMAGED/DEFECTIVE item (torn, ripped, broken snaps, holes): empathize and confirm which item(s). Use shopify_check_stock on that exact print + size BEFORE promising OR refusing a replacement — NEVER promise or deny based on the order alone. If a photo isn't provided yet, ask for one; if it's already attached, thank them (don't re-ask). Then branch on the stock-check result: IN STOCK (in_stock=true) → tell them a replacement of the same item is on its way. OUT OF STOCK (in_stock=false for that size) → do NOT promise the same item; instead warmly invite them to pick a different, IN-STOCK item as their free replacement and we'll ship that out (and offer store credit as an alternative if they'd prefer — a refund is only an option when the order does NOT include Package Protection; if it has Package Protection, the alternatives are replacement or store credit ONLY, never a refund). (Money/inventory move → escalate=true for Jose, but the customer-facing draft is the confident, correct resolution — same-item replacement if in stock, choose-an-in-stock-alternative if not.) ` +
  `CANCELLATIONS / ADDRESS CHANGES — RETENTION FIRST: never make cancelling easy and never confirm a cancellation yourself. Always find the reason first and try to solve it (customer retention is a top priority). If the shipping ADDRESS is wrong, do NOT cancel — offer to correct the shipping address (ask for the correct one, reassure it'll be updated before it ships). If they want to cancel, warmly ask why and address the reason (sizing, timeline, mistake, price) before anything else. Only after a sincere attempt to help, if they still want to cancel, acknowledge kindly and set escalate=true for Jose — do not state the order as cancelled. ` +
  `EMAIL / NEWSLETTER SIGN-UP — when a customer asks to sign up for emails, to be added to the newsletter/mailing list, or whether they're already subscribed: FIRST call shopify_check_subscription with their email (pass the brand). If subscribed=true, warmly CONFIRM they're already on our list and all set to receive updates — do NOT tell them to go sign up again. If subscribed=false or no profile is found, give the quick steps: enter their email in the footer of the brand's website to subscribe. This is an info answer, not a money move → escalate=false. ` +
  `DISCOUNTS / COUPONS / 10% OFF (info question, not a money move): the 10% off is for REGULAR-PRICED Larkspur Baby items only (customers get the code by signing up through the website footer). The MEGALODON SALE items have now MOVED to Larkspur Baby Outlet (LBO) — those are FINAL SALE and do NOT qualify for the 10%, any coupon, or any further discount. If a customer says the sign-up or discount link isn't working, reassure them warmly and point them to the footer sign-up. Do NOT invent or promise a specific code yourself (issuing a code is a money move → use shopify_propose_discount to stage one for Jose's approval only if a courtesy is warranted); but you CAN and SHOULD state this policy directly. ` +
  `FREE SHIPPING (Larkspur Baby): free shipping is available on ALL US Larkspur Baby orders of $75+ USD AFTER DISCOUNTS — i.e., the order subtotal AFTER any codes/discounts must be $75 or more. It applies AUTOMATICALLY at checkout once the threshold is met — the customer doesn't need a code. State this warmly and decisively. (Larkspur Baby Outlet / Bumbunny free shipping isn't defined here → escalate rather than assume the same terms.) ` +
  `SHIPPING, TRACKING & DELIVERY STATUS — use shipstation_lookup (order number or email) for the live, authoritative fulfillment status: whether it shipped, carrier/service, tracking number, ship date, the ship-to address on file, and whether it can still be changed. Use it for any "where's my order / tracking / did it ship" question and BEFORE promising any shipping change. ` +
  `SHIPPING ADDRESS CORRECTION — this is something you HANDLE, not escalate. When the customer gives you the corrected address and the order has NOT shipped, call shipstation_propose_change (action=update_address with the new street1/city/state/postal_code; 2-letter state code) to STAGE the fix for Jose's one-click approval — it updates BOTH ShipStation and Shopify so they stay in sync. IMPORTANT: a brand-new order often hasn't synced to ShipStation yet, so shipstation_lookup may say "no ShipStation order found" — that is NOT a reason to skip the tool or hand it to Jose manually. Still call shipstation_propose_change; it corrects Shopify now and ShipStation imports the fix on sync (and re-checks ShipStation at Apply time). To confirm "not shipped," you can use the Shopify order's fulfillment status (UNFULFILLED = safe to change) — you don't need ShipStation to have it. Only when the order is already FULFILLED/SHIPPED do you explain it can't be redirected and lay out options. Tell the customer we're getting it updated (never say it's done). Retention-first — fix the address, don't cancel. ` +
  `PACKAGE PROTECTION REPLACEMENT — when the correct PP resolution is a replacement and the items are IN STOCK (confirm with shopify_check_stock), call shopify_propose_replacement (pass the original order number; optionally items:[{sku,quantity}] for a partial) to STAGE a no-charge replacement order for Jose's approval. Tell the customer their replacement is on its way; do NOT quote a new order number until it's approved. (This is the PP "replacement" path; store credit remains the alternative — and remember non-PP customers do NOT get a free replacement.) ` +
  `GOODWILL DISCOUNTS / COURTESY FREE SHIPPING — when you've decided a discount or a free-shipping courtesy is warranted, call shopify_propose_discount (kind=percentage|fixed|free_shipping; route by order number or brand) to STAGE a single-use code for Jose's approval. Do NOT invent or promise a specific code yourself — stage it, and tell the customer a code is on the way once approved. Any discount/credit is still a money move → escalate=true. ` +
  `STORE CREDIT — this is something you ISSUE, not just promise. Whenever the resolution is STORE CREDIT (a Package Protection lost/stolen/not-received credit, the non-PP one-time 50% good-faith credit, or any approved goodwill credit), call shopify_propose_store_credit (pass amount in dollars + the order number, and ticket_id) to STAGE NATIVE Shopify store credit on the customer's account for Jose's one-click approval. This adds REAL credit to their account balance — it is NOT a code. So word your reply accordingly: tell the customer we're adding $X in store credit to their account (this email) and it applies automatically at checkout when they're signed in — NEVER say "your code" or "a code is on the way" for store credit, and never promise it's done (say we're getting it added). For the credit AMOUNT on a Package-Protection lost/damaged claim use the order's paid value (or the value of the affected items for a partial); for the non-PP good-faith case use 50% of the order value. Money move → escalate=true. ` +
  `LARKSPUR VIP CLOSING — on Larkspur Baby / Larkspur Baby Outlet replies that are POSITIVE or NEUTRAL (order status, sizing, product questions, a resolved happy customer), END by inviting them to join our VIP group: "To stay on top of all things Larkspur — discounts, deals, and to be the first to know — join our VIP group: https://www.facebook.com/groups/larkspurcircle". NEVER add it when the customer is upset, when the ticket is a complaint, damage, lost/not-received or refund case, or when escalate=true — an invitation at the bottom of a complaint reads as tone-deaf. Never for Bumbunny. `;


/* ======================================================================================================
 *  DRAFTING — from Helpdesk's own tables
 * ====================================================================================================== */
const DRAFT_ON = (process.env.DRAFT_LOOP || "on").toLowerCase() === "on";
const SWEEP_MS = (Number(process.env.DRAFT_SWEEP_MIN) || 5) * 60 * 1000;
const MAX_AGE_DAYS = Number(process.env.DRAFT_MAX_AGE_DAYS) || 14;
const JUNK_TAGS = core.JUNK_TAG_SET;
const NOREPLY_RE = /(^|[._-])(no-?reply|donotreply|mailer-daemon|postmaster|notifications?|bounces?)@/i;

async function loadTicket(id) { return (await db(`SELECT * FROM hd_tickets WHERE id=$1`, [id])).rows[0] || null; }
async function loadThread(id) { return (await db(`SELECT * FROM hd_messages WHERE ticket_id=$1 ORDER BY at ASC, id ASC`, [id])).rows; }

// Photos the customer sent: bytes for the model (so she can SEE the damage), signed links for the card.
async function imagesFor(msgs) {
  const out = [];
  for (const m of msgs) {
    if (m.from_agent || m.internal) continue;
    (m.attachments || []).forEach((a, i) => {
      if (/^image\//i.test(a.content_type || "") || /\.(jpe?g|png|gif|webp|heic)$/i.test(a.name || "")) out.push({ mid: m.id, idx: i, name: a.name, content_type: a.content_type, url: core.attachmentUrl(PUBLIC_URL, m.id, i) });
    });
  }
  return out;
}
async function imageBlocks(images, max = 4) {
  const blocks = [];
  for (const im of images.slice(-max)) {
    try {
      const a = await core.fetchAttachment(im.mid, im.idx);
      const ct = String(a.content_type || "").toLowerCase();
      if (!/^image\/(jpeg|png|gif|webp)$/.test(ct) || a.buffer.length > 4.5 * 1024 * 1024) continue;
      blocks.push({ type: "image", source: { type: "base64", media_type: ct, data: a.buffer.toString("base64") } });
    } catch (e) { /* a photo we can't fetch is just described in text */ }
  }
  return blocks;
}

async function draftForTicket(t, force, guidance) {
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY not set");
  const rulesText = await core.policyText("rules", DEFAULT_RULES);
  const msgs = await loadThread(t.id);
  const pub = msgs.filter((m) => !m.internal);
  const lastPub = pub[pub.length - 1];
  if (!force && (!lastPub || lastPub.from_agent)) return { category: "answered", _skip: true };
  const lastCustomer = [...pub].reverse().find((m) => !m.from_agent);
  const lastCustomerTime = lastCustomer ? new Date(lastCustomer.at).getTime() : 0;
  const prior = (await db(`SELECT created_at FROM emily_drafts WHERE ticket_id=$1 ORDER BY id DESC LIMIT 1`, [String(t.id)])).rows[0];
  if (!force && prior && new Date(prior.created_at).getTime() >= lastCustomerTime) return { category: "dup", _skip: true };

  const images = await imagesFor(msgs);
  const convo = pub.map((m) => {
    const n = (m.attachments || []).length;
    return `${m.from_agent ? "[AGENT]" : "[CUSTOMER]"}${n ? ` [${n} attachment(s)]` : ""} ${core.stripQuoted(m.body_text).text.slice(0, 4000)}`;
  }).join("\n---\n");
  const lastMsg = lastCustomer ? core.stripQuoted(lastCustomer.body_text).text : "";
  const custImages = images.filter((im) => lastCustomer && im.mid === lastCustomer.id);
  const brand = t.brand || core.brandForAddress(t.mailbox) || "?";
  const instruction =
    `NEW SUPPORT TICKET to triage and (if it's real customer service) draft a reply for.\n` +
    `Subject: ${t.subject}\nCustomer: ${t.customer_email}\nBrand: ${brand}\nTicket ID: ${t.id} (pass this as ticket_id to any shipstation_propose_change / shopify_propose_replacement / shopify_propose_discount / shopify_propose_store_credit call)\n\nConversation:\n${convo}\n\n` +
    (custImages.length ? `IMPORTANT: the customer's latest message INCLUDES ${custImages.length} photo(s), shown to you below. Look at them: identify the item and describe what you see (which product, where the damage is, whether it is a defect or wear) in one sentence of your escalate_reason or draft reasoning. Do NOT ask them to send a photo again. ` : ``) +
    `Follow your playbook. If the message references an order, use shopify_lookup_order first. ` +
    `Before offering ANY goodwill credit, replacement, discount or refund, call customer_history with the customer's email — if they already received the one-time 50% good-faith credit, do not offer it again; escalate instead. ` +
    rulesText + `\n` +
    (guidance ? `⭐ ADDITIONAL INSTRUCTIONS FROM JOSE for THIS draft (highest priority — apply them to the wording/offer; they override default phrasing but NOT the hard policies above, and money/inventory moves still escalate): ${guidance}\n` : ``) +
    `Then reply with ONLY a JSON object (no prose, no code fences):\n` +
    `{"category":"cs|spam|business|unclear","intent":"tracking|subscription|sizing_care|returns_info|policy_info|damage|lost|missing_items|cancel_or_address|discount|oos_reply|other",` +
    `"sentiment":"positive|neutral|upset","tags":["up to 3 short lowercase tags"],"escalate":true|false,` +
    `"escalate_reason":"short reason or empty","oos_choice":"replacement|credit|refund|none",` +
    `"todo":["anything this reply PROMISES that no tool you called will actually do — e.g. 'send a manual return label for the 4 XL sleep sacks', 'ship the missing bonnet' — a person does these by hand; empty if none. Return labels and returns are ALWAYS a person's job: never call a tool for them, list them here. For refunds/credits/discounts/cancellations/address changes use the matching tool instead of promising."],` +
    `"draft":"the full customer-ready reply if category is cs, else empty"}\n` +
    `intent = the ONE thing the customer needs. oos_choice = only when the customer is answering an out-of-stock options email; which option they picked. ` +
    `Escalate=true for refunds/discounts/credits, order edits/cancellations, angry/sensitive cases, or low confidence.`;
  const content = [{ type: "text", text: instruction }];
  if (custImages.length) content.push(...await imageBlocks(custImages));
  let text = await agentLoop([{ role: "user", content }], 8);
  let parsed = parseJSON(text);
  if (!parsed) {
    console.error(`ticket ${t.id}: draft pass 1 returned no parseable JSON — retrying JSON-only.`);
    const text2 = await agentLoop([{ role: "user", content: instruction + `\n\nReturn ONLY the JSON object described above — finish any lookups quickly, no prose, no code fences.` }], 3);
    parsed = parseJSON(text2);
  }
  if (parsed) { parsed._customer = lastMsg.slice(0, 1400); parsed._images = custImages; }
  return parsed;
}

/* ---- the per-ticket pipeline: draft → log → note → tags → auto-send or approval card ---- */
const inFlight = new Set();
const debounces = new Map();
async function handleTicket(ticketId, { force = false, guidance = "" } = {}) {
  const id = String(ticketId);
  if (inFlight.has(id)) return { skipped: "busy" };
  inFlight.add(id);
  try {
    const t = await loadTicket(id);
    if (!t) return { skipped: "missing" };
    if (!force) {
      if (t.spam || t.status === "closed") return { skipped: "spam/closed" };
      if ((t.tags || []).some((x) => JUNK_TAGS.includes(x))) return { skipped: "junk" };
      if (NOREPLY_RE.test(t.customer_email || "")) { await core.addTags(id, ["automated"]); return { skipped: "no-reply sender" }; }
      if (t.last_inbound_at && Date.now() - new Date(t.last_inbound_at).getTime() > MAX_AGE_DAYS * 86400000) return { skipped: "too old" };
    }
    const r = await draftForTicket(t, force, guidance);
    if (!r || !r.category) return { skipped: "no result" };
    if (r._skip) return { skipped: r.category };
    if (r.category !== "cs") {
      await core.addTags(id, [...(r.tags || []).slice(0, 2), "emily-skip"]);
      await logDraft(t, r);
      return { category: r.category };
    }
    await logDraft(t, r);
    await closeOosCase(t, r);
    if (r.draft) {
      const flag = r.escalate ? ` — 🛑 NEEDS APPROVAL: ${r.escalate_reason || "review"}` : "";
      await core.addNote({ ticketId: id, text: `✍️ Emily's suggested reply${flag}\n\n${r.draft}`, who: "Emily" });
    }
    await core.addTags(id, [...(r.tags || []).slice(0, 3), "emily-drafted"]);
    if (await autoSendEligible(t, r)) await autoSend(t, r);
    else await postApprovalCard(t, r);
    return { category: "cs", escalate: !!r.escalate, intent: r.intent };
  } finally { inFlight.delete(id); }
}
// New inbound mail: wait 20s (people send twice), then draft.
function onInboundMessage(ticketId) {
  if (!DRAFT_ON || !anthropic) return;
  const id = String(ticketId);
  clearTimeout(debounces.get(id));
  debounces.set(id, setTimeout(() => { debounces.delete(id); handleTicket(id).catch((e) => console.error(`Emily draft ${id}:`, e.message)); }, 20000));
}
// Safety sweep: anything where the customer is waiting and Emily hasn't drafted since they wrote.
let sweepBusy = false;
// Emily only sweeps mail that arrived after she went live in the Helpdesk ("sweep_since"). Anything older was
// already handled by the previous Emily or is Jose's to pick up in the app — otherwise every restart would
// walk the whole backlog and flood Slack with cards. New replies on old tickets still count as new mail.
let sweepSince = null;
async function sweepFloor() {
  if (sweepSince) return sweepSince;
  const v = await core.setting("sweep_since", null);
  if (v) { sweepSince = new Date(v); return sweepSince; }
  sweepSince = new Date();
  try { await db(`INSERT INTO emily_settings (key,value,updated_by) VALUES ('sweep_since',$1::jsonb,'system') ON CONFLICT (key) DO NOTHING`, [JSON.stringify(sweepSince.toISOString())]); }
  catch (e) { console.error("sweep_since:", e.message); }
  console.log(`✍️  Emily sweep floor set: only mail after ${sweepSince.toISOString()}`);
  return sweepSince;
}
async function sweep() {
  if (sweepBusy || !DRAFT_ON || !anthropic || !pool) return;
  sweepBusy = true;
  try {
    const since = await sweepFloor();
    const r = await db(`SELECT t.id FROM hd_tickets t
                         WHERE NOT t.spam AND t.status='open' AND t.last_inbound_at IS NOT NULL
                           AND (t.last_outbound_at IS NULL OR t.last_inbound_at > t.last_outbound_at)
                           AND t.last_inbound_at > now() - ($1||' days')::interval
                           AND t.last_inbound_at > $3
                           AND NOT (t.tags && $2::text[])
                           AND NOT EXISTS (SELECT 1 FROM emily_drafts d WHERE d.ticket_id = t.id::text AND d.created_at >= t.last_inbound_at)
                         ORDER BY t.last_inbound_at ASC LIMIT 6`, [MAX_AGE_DAYS, JUNK_TAGS, since]);
    let n = 0;
    for (const row of r.rows) { try { const res = await handleTicket(row.id); if (res && res.category) n++; } catch (e) { console.error(`sweep ${row.id}:`, e.message); } }
    if (r.rows.length) console.log(`Emily sweep: ${r.rows.length} waiting · ${n} drafted`);
  } catch (e) { console.error("Emily sweep:", e.message); }
  finally { sweepBusy = false; }
}

/* ---- draft log, outcomes, auto-send, OOS closure ---- */
async function logDraft(t, r) {
  try {
    const todo = Array.isArray(r.todo) ? r.todo.filter((x) => x && String(x).trim()).slice(0, 6).map((x) => ({ what: String(x).trim().slice(0, 200), state: "open" })) : [];
    const ins = await db(`INSERT INTO emily_drafts (ticket_id,brand,customer_email,category,intent,sentiment,escalate,escalate_reason,draft,todo)
                          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [String(t.id), t.brand || null, t.customer_email, r.category, r.intent || null, r.sentiment || null, !!r.escalate, r.escalate_reason || null, r.draft || null, JSON.stringify(todo)]);
    r._draft_id = ins.rows[0].id;
  } catch (e) { console.error("logDraft:", e.message); }
}
async function recordOutcome(ticketId, outcome, finalText, by) {
  try { await db(`UPDATE emily_drafts SET outcome=$2, final_text=$3, decided_by=$4, decided_at=now()
                  WHERE id = (SELECT id FROM emily_drafts WHERE ticket_id=$1 AND outcome IS NULL ORDER BY id DESC LIMIT 1)`, [String(ticketId), outcome, finalText || null, by || null]); }
  catch (e) { console.error("recordOutcome:", e.message); }
}
async function closeOosCase(t, r) {
  if (!r.oos_choice || r.oos_choice === "none") return;
  try { await db(`UPDATE oos_cases SET status='resolved', resolution=$2, updated_at=now() WHERE ticket_id=$1 AND status IN ('offered','staged')`, [String(t.id), r.oos_choice]); } catch (e) {}
}
const AUTO_SEND_DEFAULT = { enabled: false, intents: ["tracking", "subscription", "sizing_care", "returns_info", "policy_info"] };
async function autoSendEligible(t, r) {
  const cfg = Object.assign({}, AUTO_SEND_DEFAULT, await core.setting("auto_send", {}) || {});
  if (!cfg.enabled || !r.draft || r.escalate || r.sentiment === "upset") return false;
  if (!(cfg.intents || []).includes(r.intent) || !t.customer_email) return false;
  try { const a = await db(`SELECT 1 FROM emily_actions WHERE ticket_id=$1 AND created_at > now() - interval '10 minutes' LIMIT 1`, [String(t.id)]); if (a.rows.length) return false; } catch (e) { return false; }
  return true;
}
async function autoSend(t, r) {
  try {
    const s = await core.sendReply({ ticketId: t.id, text: r.draft, who: "Emily", via: "auto-send" });
    await core.addTags(t.id, ["emily-sent", "emily-auto"]);
    await recordOutcome(t.id, "auto_sent", r.draft, "Emily");
    if (app) await app.client.chat.postMessage({ channel: APPROVALS_CH, text: `Sent automatically · ticket ${t.id}`, blocks: [
      { type: "section", text: { type: "mrkdwn", text: `🤖 *Sent automatically* · *${t.brand || s.mailbox}* · ticket ${t.id} — ${t.subject}\nCustomer: ${t.customer_email} · intent: \`${r.intent}\`` } },
      { type: "section", text: { type: "mrkdwn", text: `*Customer wrote:*\n>>> ${(r._customer || "").slice(0, 600)}` } },
      { type: "section", text: { type: "mrkdwn", text: `*Emily sent:*\n>>> ${String(r.draft).slice(0, 2000)}` } },
      { type: "context", elements: [{ type: "mrkdwn", text: `No money, no escalation, customer not upset. Change this under Settings → Emily in Helpdesk. Say \`redraft ${t.id}\` to follow up.` }] },
    ] });
    console.log(`🤖 AUTO-SENT ticket ${t.id} (${r.intent}) to ${t.customer_email}`);
  } catch (e) { console.error(`auto-send failed for ${t.id}, falling back to approval:`, e.message); await postApprovalCard(t, r); }
}

/* ======================================================================================================
 *  APPROVALS — one decision path, reachable from Slack and from the app
 * ====================================================================================================== */
function fmtAge(iso) {
  if (!iso) return "unknown";
  const tms = new Date(iso).getTime();
  const opened = new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const m = Math.floor((Date.now() - tms) / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return `${opened} CT · ⏱ ${d >= 1 ? `${d}d ${h % 24}h ago` : h >= 1 ? `${h}h ${m % 60}m ago` : `${m}m ago`}`;
}
async function postApprovalCard(t, r) {
  if (!app) return;
  const status = r.escalate ? `🛑 *NEEDS APPROVAL* — ${r.escalate_reason || "review"}` : "✅ Draft ready";
  const header = `🎫 *${t.brand || "?"}* · Ticket ${t.id} — ${t.subject}\nCustomer: ${t.customer_email}\nOpened: ${fmtAge(t.created_at)}\n${status}\n<${PUBLIC_URL}/?ticket=${t.id}|Open in Helpdesk>`;
  const blocks = [
    { type: "section", text: { type: "mrkdwn", text: header } },
    { type: "section", text: { type: "mrkdwn", text: `*Customer wrote:*\n>>> ${(r._customer || "(not captured)").slice(0, 1400)}` } },
  ];
  for (const im of (r._images || []).slice(0, 6)) blocks.push({ type: "image", image_url: im.url, alt_text: im.name || "customer photo" });
  blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Emily's draft:*\n>>> ${(r.draft || "(none)").slice(0, 2600)}` } });
  if (r.draft && t.customer_email) {
    blocks.push({ type: "actions", elements: [
      { type: "button", style: "primary", text: { type: "plain_text", text: "✅ Approve & Send" }, action_id: "approve_send", value: String(t.id) },
      { type: "button", text: { type: "plain_text", text: "✏️ Edit & Send" }, action_id: "edit_send", value: String(t.id) },
      { type: "button", text: { type: "plain_text", text: "🔁 Redraft with notes" }, action_id: "redraft_input", value: String(t.id) },
      { type: "button", style: "danger", text: { type: "plain_text", text: "🗑 Skip" }, action_id: "skip", value: String(t.id) },
    ] });
  }
  try {
    const res = await app.client.chat.postMessage({ channel: APPROVALS_CH, text: header, blocks });
    if (r._draft_id) await db(`UPDATE emily_drafts SET slack_ch=$2, slack_ts=$3 WHERE id=$1`, [r._draft_id, APPROVALS_CH, res.ts]).catch(() => {});
  } catch (e) { console.error(`approval card failed (invite Emily to #cs-approvals?): ${(e.data && e.data.error) || e.message}`); }
}
async function latestDraft(ticketId) {
  return (await db(`SELECT * FROM emily_drafts WHERE ticket_id=$1 ORDER BY id DESC LIMIT 1`, [String(ticketId)])).rows[0] || null;
}
async function updateCard(d, text, blocks) {
  if (!app || !d || !d.slack_ts) return;
  try { await app.client.chat.update({ channel: d.slack_ch, ts: d.slack_ts, text, blocks }); } catch (e) {}
}
// The single decision function. Slack buttons and the app's buttons both land here.
async function decide({ ticketId, action, text, who, applyActions = [], overrides = {} }) {
  const id = String(ticketId);
  const d = await latestDraft(id);
  if (action === "redraft") {
    if (d) await updateCard(d, "Redrafted", [{ type: "section", text: { type: "mrkdwn", text: `🔁 *Redrafted* · ticket ${id}${text ? ` — notes: "${String(text).slice(0, 160)}"` : ""} → new card below.` } }]);
    if (d && !d.outcome) await recordOutcome(id, "redrafted", null, who);
    const r = await handleTicket(id, { force: true, guidance: text || "" });
    return { ok: true, result: r };
  }
  if (!d || d.outcome) return { ok: false, error: d ? `that draft was already ${d.outcome}` : "no draft on this ticket — say redraft" };
  if (action === "skip") {
    await core.addTags(id, ["emily-skip-manual"]);
    await recordOutcome(id, "skipped", null, who);
    await updateCard(d, "Skipped", [{ type: "section", text: { type: "mrkdwn", text: `🗑 *Skipped* · ticket ${id} · by ${who}` } }]);
    return { ok: true };
  }
  let body = action === "edit" ? String(text || "").trim() : String(d.draft || "");
  if (!body) return { ok: false, error: "nothing to send" };
  // Actions Emily proposed alongside the draft (discount code, store credit, address fix…) that the person ticked: do them first.
  const appliedNotes = [], codes = [];
  for (const aid of Array.isArray(applyActions) ? applyActions : []) {
    try { const r = await applyAction(String(aid), who, overrides && overrides[aid] ? overrides[aid] : null); appliedNotes.push(r.note); if (r.code) codes.push(r.code); }
    catch (e) { return { ok: false, error: `Couldn't apply "${aid}": ${e.message} — nothing was sent.` }; }
  }
  const filled = await fillPlaceholders(id, body, codes);
  if (filled.pending) return { ok: false, error: "The draft still has a {{DISCOUNT_CODE}} placeholder — tick the discount so it gets created, or edit the text." };
  body = filled.text;
  const pf = await pendingFiles(id);
  const s = await core.sendReply({ ticketId: id, text: body, who, via: action === "edit" ? "emily-edited" : "emily-approved", files: pf.map((f) => f.file_id) });
  if (pf.length) await markFilesSent(id);
  await core.addTags(id, ["emily-sent"]);
  await recordOutcome(id, action === "edit" ? "edited" : "approved", body, who);
  await updateCard(d, `Sent to ${s.to}`, [
    { type: "section", text: { type: "mrkdwn", text: `✅ *Sent* → ${s.to} · from ${s.mailbox} · ticket ${id} · by ${who}` } },
    { type: "section", text: { type: "mrkdwn", text: `>>> ${body.slice(0, 2800)}` } },
  ]);
  return { ok: true, via: s.via, to: s.to, applied: appliedNotes, attached: pf.length };
}
// A person answered from the app while a draft was waiting — settle the draft so it doesn't linger.
async function onHumanReply(ticketId, text, who) {
  const d = await latestDraft(ticketId);
  if (!d || d.outcome) return;
  await recordOutcome(ticketId, "human_replied", text, who);
  await updateCard(d, "Answered in Helpdesk", [{ type: "section", text: { type: "mrkdwn", text: `✍️ *Answered in Helpdesk* by ${who} · ticket ${ticketId}` } }]);
}

/* ======================================================================================================
 *  OUT-OF-STOCK hand-off from Stockroom (cases land in oos_cases; Apply emails the customer)
 * ====================================================================================================== */
const OOS_ON = (process.env.OOS_LOOP || "on").toLowerCase() === "on";
const OOS_INTERVAL = (Number(process.env.OOS_INTERVAL_SEC) || 45) * 1000;
const money2 = (n) => Number(n || 0).toFixed(2);
const slackEsc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function mailboxForBrand(brand) { return core.mailboxForName(brand) || process.env.GORGIAS_FROM_ADDRESS || null; }
async function oosLoad(caseId) { const { rows } = await db(`SELECT * FROM oos_cases WHERE id=$1`, [caseId]); return rows[0] || null; }
function oosCardBlocks(c, note) {
  const email = c.customer_email, fromAddress = mailboxForBrand(c.brand);
  const text =
    `⚙️ *Out-of-stock email — order ${slackEsc(c.order_number)}*\n` +
    `📦❌ *Out of stock — send this to the customer?*\n` +
    `*Order ${slackEsc(c.order_number)}* · ${slackEsc(c.brand || "")} · ${slackEsc(c.item_name)} (${slackEsc(c.sku)}) · $${money2(c.item_value)}\n` +
    `*To:* ${slackEsc(c.customer_name || "")} &lt;${slackEsc(email || "no email on order")}&gt;  ·  from ${slackEsc(fromAddress || "?")}\n` +
    `Options offered: equal-value replacement · store credit $${money2(c.credit_value)} (+15%) · refund $${money2(c.item_value)}\n` +
    `*Subject:* ${slackEsc(c.email_subject || "About your order")}\n\n>>> ${slackEsc(c.email_text).slice(0, 2300)}`;
  const foot = note ? `${note}\n_Nothing is sent until you Apply._` : `_Proposed by Emily — nothing is sent until you Apply._`;
  const id = String(c.id);
  return [
    { type: "section", text: { type: "mrkdwn", text } },
    { type: "context", elements: [{ type: "mrkdwn", text: foot }] },
    { type: "actions", elements: [
      { type: "button", style: "primary", text: { type: "plain_text", text: "🚀 Apply" }, action_id: "oos_apply", value: id },
      { type: "button", text: { type: "plain_text", text: "✏️ Edit" }, action_id: "oos_edit", value: id },
      { type: "button", style: "danger", text: { type: "plain_text", text: "✖ Dismiss" }, action_id: "oos_dismiss", value: id },
    ] },
  ];
}
async function stageOosSend(c) {
  if (app) { await app.client.chat.postMessage({ channel: APPROVALS_CH, text: `Out-of-stock email — order ${c.order_number}`, blocks: oosCardBlocks(c) }); }
  try { await db(`UPDATE oos_cases SET status='staged', updated_at=now() WHERE id=$1`, [c.id]); }
  catch (e) { console.error(`OOS case ${c.id}: status update failed — ${e.message}`); }
}
async function oosRepostStaged() {
  if (!app) return;
  try {
    const { rows } = await db(`SELECT * FROM oos_cases WHERE status='staged' AND updated_at > now() - interval '3 days' ORDER BY created_at ASC`);
    for (const c of rows) await app.client.chat.postMessage({ channel: APPROVALS_CH, text: `Out-of-stock email — order ${c.order_number}`, blocks: oosCardBlocks(c, `🔄 Re-posted after an update — use *this* card; the earlier one for order ${slackEsc(c.order_number)} no longer works.`) });
    if (rows.length) console.log(`📦❌ OOS: re-posted ${rows.length} waiting card(s)`);
  } catch (e) { console.error("OOS re-post failed:", e.message); }
}
async function oosSendCase(caseId, who) {
  const { rows } = await db(`UPDATE oos_cases SET status='sending', updated_at=now() WHERE id=$1 AND status='staged' RETURNING *`, [caseId]);
  const c = rows[0];
  if (!c) { const cur = await oosLoad(caseId); throw new Error(cur ? `case #${caseId} is already ${cur.status}` : `case #${caseId} not found`); }
  const email = c.customer_email, fromAddress = mailboxForBrand(c.brand);
  try {
    if (!email) throw new Error("no customer email on this case");
    if (!fromAddress) throw new Error(`couldn't resolve a sending mailbox for brand "${c.brand}"`);
    const r = await core.sendNewEmail({ mailbox: fromAddress, to: email, subject: c.email_subject || "About your order", text: c.email_text, who: who || "Emily", tags: ["oos-offer", "emily"] });
    await core.addNote({ ticketId: r.ticket_id, text: `[OOS-CASE #${c.id}] ${c.item_name} (${c.sku}) · value $${money2(c.item_value)} · store-credit(+15%) $${money2(c.credit_value)} · order ${c.order_number}. Options offered: equal-value replacement / store credit +15% / refund. When the customer replies with their choice, apply that brand's policy and route the money/inventory move to Jose.`, who: "Emily" });
    await db(`UPDATE oos_cases SET status='offered', ticket_id=$2, updated_at=now() WHERE id=$1`, [c.id, String(r.ticket_id)]);
    return { c, note: `Sent out-of-stock email to ${email} · ticket ${r.ticket_id} (via ${r.via})` };
  } catch (e) {
    try { await db(`UPDATE oos_cases SET status='staged', updated_at=now() WHERE id=$1 AND status='sending'`, [c.id]); } catch (_) {}
    throw e;
  }
}
let oosBusy = false;
async function runOosLoop() {
  if (oosBusy || !pool) return;
  oosBusy = true;
  try {
    try { await db(`UPDATE oos_cases SET status='pending_approval' WHERE status='staging' AND updated_at < now() - interval '10 minutes'`); } catch (_) {}
    const { rows } = await db(`SELECT * FROM oos_cases WHERE status='pending_approval' ORDER BY created_at ASC LIMIT 5`);
    for (const c of rows) {
      const claim = await db(`UPDATE oos_cases SET status='staging', updated_at=now() WHERE id=$1 AND status='pending_approval' RETURNING id`, [c.id]);
      if (!claim.rows.length) continue;
      try { await stageOosSend(c); }
      catch (e) { console.error(`OOS stage failed for case ${c.id}:`, e.message); try { await db(`UPDATE oos_cases SET status='pending_approval' WHERE id=$1`, [c.id]); } catch (_) {} }
    }
  } catch (e) { if (!/does not exist/.test(e.message)) console.error("OOS loop error:", e.message); }
  finally { oosBusy = false; }
}

/* ======================================================================================================
 *  SLACK — buttons, DMs, mentions
 * ====================================================================================================== */
async function maybeRedraftCommand(text) {
  const m = String(text || "").match(/\b(?:re-?draft|redo|regenerate)\b[^0-9]*#?(\d{4,})\s*[:,\-–]?\s*([\s\S]*)$/i);
  if (!m) return null;
  const id = m[1], guidance = (m[2] || "").trim();
  const t = await loadTicket(id);
  if (!t) return `I can't find ticket ${id} in Helpdesk.`;
  const r = await handleTicket(id, { force: true, guidance });
  return r && r.category === "cs" ? `🔁 Redrafted ticket ${id}${guidance ? ` with your notes` : ""} — new card in <#${APPROVALS_CH}>.` : `Looked at ticket ${id} — ${r && (r.skipped || r.category) || "nothing to draft"}.`;
}
const RESTAGE = { shipstation_propose_change: (i) => shipstationProposeChange(i), shopify_propose_replacement: (i) => shopifyProposeReplacement(i),
                  shopify_propose_discount: (i) => shopifyProposeDiscount(i), shopify_propose_store_credit: (i) => shopifyProposeStoreCredit(i),
                  shopify_propose_cancel: (i) => shopifyProposeCancel(i), shopify_propose_refund: (i) => shopifyProposeRefund(i) };
function wireSlack() {
  app.message(async ({ message, say }) => {
    if (message.subtype || message.bot_id || message.channel_type !== "im") return;
    try { const cmd = await maybeRedraftCommand(message.text); await say({ text: cmd || await respond(message.text || "", keyFor(message.channel, message.thread_ts)), thread_ts: message.thread_ts }); }
    catch (e) { await say(`⚠️ ${e.message}`); }
  });
  app.event("app_mention", async ({ event, say }) => {
    const cleaned = (event.text || "").replace(/<@[^>]+>/g, "").trim();
    try { const cmd = await maybeRedraftCommand(cleaned); await say({ text: cmd || await respond(cleaned, keyFor(event.channel, event.thread_ts || event.ts)), thread_ts: event.thread_ts || event.ts }); }
    catch (e) { await say(`⚠️ ${e.message}`); }
  });
  const who = (body) => (body.user && (body.user.name || body.user.username || body.user.id)) || "slack";
  app.action("approve_send", async ({ ack, body, action, client }) => {
    await ack();
    try { const r = await decide({ ticketId: action.value, action: "approve", who: who(body) }); if (!r.ok) throw new Error(r.error); }
    catch (e) { await client.chat.postMessage({ channel: body.channel.id, thread_ts: body.message.ts, text: `⚠️ ${e.message}` }); }
  });
  app.action("skip", async ({ ack, body, action, client }) => {
    await ack();
    try { const r = await decide({ ticketId: action.value, action: "skip", who: who(body) }); if (!r.ok) throw new Error(r.error); }
    catch (e) { await client.chat.postMessage({ channel: body.channel.id, thread_ts: body.message.ts, text: `⚠️ ${e.message}` }); }
  });
  app.action("edit_send", async ({ ack, body, action, client }) => {
    await ack();
    const d = await latestDraft(action.value);
    if (!d || !d.draft) { await client.chat.postMessage({ channel: body.channel.id, thread_ts: body.message.ts, text: `No draft on ticket ${action.value} — say redraft ${action.value}.` }); return; }
    await client.views.open({ trigger_id: body.trigger_id, view: {
      type: "modal", callback_id: "edit_modal", private_metadata: JSON.stringify({ id: String(action.value) }),
      title: { type: "plain_text", text: "Edit & Send" }, submit: { type: "plain_text", text: "Send" }, close: { type: "plain_text", text: "Cancel" },
      blocks: [{ type: "input", block_id: "b", label: { type: "plain_text", text: "Reply to the customer" }, element: { type: "plain_text_input", multiline: true, action_id: "reply", initial_value: d.draft } }],
    } });
  });
  app.view("edit_modal", async ({ ack, view, client, body }) => {
    await ack();
    const meta = JSON.parse(view.private_metadata);
    try { const r = await decide({ ticketId: meta.id, action: "edit", text: view.state.values.b.reply.value, who: who(body) }); if (!r.ok) throw new Error(r.error); }
    catch (e) { await client.chat.postMessage({ channel: APPROVALS_CH, text: `⚠️ ${e.message}` }); }
  });
  app.action("redraft_input", async ({ ack, body, action, client }) => {
    await ack();
    await client.views.open({ trigger_id: body.trigger_id, view: {
      type: "modal", callback_id: "redraft_modal", private_metadata: JSON.stringify({ id: String(action.value) }),
      title: { type: "plain_text", text: "Redraft with notes" }, submit: { type: "plain_text", text: "Redraft" }, close: { type: "plain_text", text: "Cancel" },
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `How should Emily change ticket ${action.value}'s reply? She'll rewrite it and post a fresh card.` } },
        { type: "input", block_id: "g", label: { type: "plain_text", text: "Instructions" }, element: { type: "plain_text_input", multiline: true, action_id: "notes", placeholder: { type: "plain_text", text: "e.g. keep it short, lead with store credit" } } },
      ],
    } });
  });
  app.view("redraft_modal", async ({ ack, view, client, body }) => {
    await ack();
    const meta = JSON.parse(view.private_metadata);
    try { await decide({ ticketId: meta.id, action: "redraft", text: (view.state.values.g.notes.value || "").trim(), who: who(body) }); }
    catch (e) { await client.chat.postMessage({ channel: APPROVALS_CH, text: `⚠️ Redraft failed: ${e.message}` }); }
  });
  // out-of-stock cards
  app.action("oos_apply", async ({ ack, body, action, client }) => {
    await ack();
    const ch = body.channel.id, ts = body.message.ts;
    try {
      const { c, note } = await oosSendCase(action.value, who(body));
      await client.chat.update({ channel: ch, ts, text: "Sent", blocks: [{ type: "section", text: { type: "mrkdwn", text: `✅ *Sent* — out-of-stock email, order ${slackEsc(c.order_number)} · by <@${body.user.id}>\n*Subject:* ${slackEsc(c.email_subject || "")}\n>>> ${slackEsc(c.email_text).slice(0, 2300)}` } }] });
      await client.chat.postMessage({ channel: ch, thread_ts: ts, text: `✅ Done: ${note}` });
    } catch (e) { await client.chat.postMessage({ channel: ch, thread_ts: ts, text: `⚠️ Not sent: ${e.message}` }); }
  });
  app.action("oos_dismiss", async ({ ack, body, action, client }) => {
    await ack();
    const ch = body.channel.id, ts = body.message.ts;
    const { rows } = await db(`UPDATE oos_cases SET status='dismissed', updated_at=now() WHERE id=$1 AND status='staged' RETURNING order_number`, [action.value]);
    if (!rows[0]) { const cur = await oosLoad(action.value); await client.chat.postMessage({ channel: ch, thread_ts: ts, text: `Nothing to dismiss — case #${action.value} is ${cur ? cur.status : "missing"}.` }); return; }
    await client.chat.update({ channel: ch, ts, text: "Dismissed", blocks: [{ type: "section", text: { type: "mrkdwn", text: `✖ *Dismissed* — out-of-stock email, order ${slackEsc(rows[0].order_number)} · by <@${body.user.id}>` } }] });
  });
  app.action("oos_edit", async ({ ack, body, action, client }) => {
    await ack();
    const ch = body.channel.id, ts = body.message.ts;
    const c = await oosLoad(action.value);
    if (!c || c.status !== "staged") { await client.chat.postMessage({ channel: ch, thread_ts: ts, text: `Can't edit — case #${action.value} is ${c ? c.status : "missing"}.` }); return; }
    await client.views.open({ trigger_id: body.trigger_id, view: {
      type: "modal", callback_id: "oos_edit_modal", private_metadata: JSON.stringify({ id: String(c.id), ch, ts }),
      title: { type: "plain_text", text: "Edit email" }, submit: { type: "plain_text", text: "Save" }, close: { type: "plain_text", text: "Cancel" },
      blocks: [
        { type: "context", elements: [{ type: "mrkdwn", text: `Order *${slackEsc(c.order_number)}* · to ${slackEsc(c.customer_email || "no email")}. Saving updates the card — you still tap *Apply* to send.` }] },
        { type: "input", block_id: "subj", label: { type: "plain_text", text: "Subject" }, element: { type: "plain_text_input", action_id: "v", max_length: 250, initial_value: String(c.email_subject || "").slice(0, 250) } },
        { type: "input", block_id: "body", label: { type: "plain_text", text: "Email to the customer" }, element: { type: "plain_text_input", action_id: "v", multiline: true, max_length: 3000, initial_value: String(c.email_text || "").slice(0, 3000) } },
      ],
    } });
  });
  app.view("oos_edit_modal", async ({ ack, body, view, client }) => {
    const subject = String(view.state.values.subj.v.value || "").trim(), text = String(view.state.values.body.v.value || "").trim();
    if (!subject || !text) { await ack({ response_action: "errors", errors: { ...(subject ? {} : { subj: "Subject can't be empty" }), ...(text ? {} : { body: "Email can't be empty" }) } }); return; }
    await ack();
    const meta = JSON.parse(view.private_metadata);
    try {
      const { rows } = await db(`UPDATE oos_cases SET email_subject=$2, email_text=$3, updated_at=now() WHERE id=$1 AND status='staged' RETURNING *`, [meta.id, subject, text]);
      if (!rows[0]) { await client.chat.postMessage({ channel: meta.ch, thread_ts: meta.ts, text: `⚠️ Edit not saved — case #${meta.id} moved on.` }); return; }
      await client.chat.update({ channel: meta.ch, ts: meta.ts, text: `Out-of-stock email — order ${rows[0].order_number} (edited)`, blocks: oosCardBlocks(rows[0], `✏️ Edited by <@${body.user.id}>`) });
    } catch (e) { await client.chat.postMessage({ channel: meta.ch, thread_ts: meta.ts, text: `⚠️ Edit failed: ${e.message}` }); }
  });
  app.action("act_apply", async ({ ack, body, action, client }) => {
  await ack();
  const ch = body.channel.id, ts = body.message.ts, who = body.user && body.user.id;
  const p = pendingAct.get(action.value);
  if (!p) {
    // The bot restarted since this was staged. Never guess what the button meant — look the record up,
    // re-run the same proposal (which re-validates stock, shipment status, etc.) and post a fresh card.
    let rec = null;
    try { rec = pool ? (await db(`SELECT * FROM emily_actions WHERE id=$1`, [action.value])).rows[0] : null; } catch (e) {}
    if (rec && rec.status !== "staged") { await client.chat.postMessage({ channel: ch, thread_ts: ts, text: `This card was already ${rec.status}.` }); return; }
    if (rec && RESTAGE[rec.kind]) {
      await markAction(action.value, "expired", { by: who });
      try { await client.chat.update({ channel: ch, ts, text: "Expired", blocks: [{ type: "section", text: { type: "mrkdwn", text: `⏳ *Expired* — ${rec.title}. Emily restarted since this was staged; a fresh card follows.` } }] }); } catch (e) {}
      try { const r = await RESTAGE[rec.kind](rec.input || {}); await client.chat.postMessage({ channel: ch, thread_ts: ts, text: `🔄 Re-checked and re-staged: ${(r && (r.note || r.error)) || rec.title}. Use the new card.` }); }
      catch (e) { await client.chat.postMessage({ channel: ch, thread_ts: ts, text: `⚠️ Couldn't re-stage "${rec.title}": ${e.message}. Ask Emily to redraft the ticket.` }); }
      return;
    }
    await client.chat.postMessage({ channel: ch, thread_ts: ts, text: "That action expired (bot restarted) and I have no record of it. Ask Emily to redraft the ticket to stage it again." });
    return;
  }
  try {
    const r = await p.exec();
    await markAction(action.value, "applied", { by: who, result: (r && r.note) || "ok" });
    await client.chat.update({ channel: ch, ts, text: "Applied", blocks: [{ type: "section", text: { type: "mrkdwn", text: `✅ *Applied* — ${p.title}\n${(r && r.note) || p.summary}` } }] });
    await client.chat.postMessage({ channel: ch, thread_ts: ts, text: `✅ Done: ${(r && r.note) || p.title}` });
    pendingAct.delete(action.value);
  } catch (e) {
    await markAction(action.value, "failed", { by: who, result: e.message });
    await client.chat.postMessage({ channel: ch, thread_ts: ts, text: `⚠️ Failed to apply "${p.title}": ${e.message}` });
  }
  });
  app.action("act_dismiss", async ({ ack, body, action, client }) => {
  await ack();
  const p = pendingAct.get(action.value); pendingAct.delete(action.value);
  await markAction(action.value, "dismissed", { by: body.user && body.user.id });
  await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: "Dismissed", blocks: [{ type: "section", text: { type: "mrkdwn", text: `✖ *Dismissed* — ${(p && p.title) || action.value}` } }] });
  });


  app.event("assistant_thread_started", async ({ event, client }) => {
    try { await client.chat.postMessage({ channel: event.assistant_thread.channel_id, thread_ts: event.assistant_thread.thread_ts, text: `Hi Jose — Emily here. I can look up real orders, stock and tickets. What do you need?` }); } catch (e) {}
  });
}

/* ======================================================================================================
 *  START
 * ====================================================================================================== */
let started = false;
async function start() {
  if (started) return; started = true;
  if (!pool) { console.log("Emily: no database — not starting"); return; }
  await core.seedPolicy("playbook", skill);
  await core.seedPolicy("rules", DEFAULT_RULES);
  await applyPolicyPatches();
  try { await db(`ALTER TABLE emily_drafts ADD COLUMN IF NOT EXISTS slack_ch TEXT`); await db(`ALTER TABLE emily_drafts ADD COLUMN IF NOT EXISTS slack_ts TEXT`); } catch (e) {}
  const bot = process.env.EMILY_SLACK_BOT_TOKEN, appTok = process.env.EMILY_SLACK_APP_TOKEN;
  if (App && bot && appTok) {
    app = new App({ token: bot, appToken: appTok, socketMode: true });
    wireSlack();
    await app.start();
    console.log(`⚡️ Emily connected to Slack (approvals in ${APPROVALS_CH})`);
  } else {
    console.log("Emily: Slack tokens not set — approvals live only in Helpdesk");
  }
  core.onInbound((ticketId) => onInboundMessage(ticketId));
  if (DRAFT_ON && anthropic) { sweepFloor().catch(() => {}); setTimeout(sweep, 15000); setInterval(sweep, SWEEP_MS); console.log(`✍️  Emily drafting: on new mail + sweep every ${SWEEP_MS / 60000}m · model ${CLAUDE_MODEL}`); }
  else console.log(`✍️  Emily drafting: OFF (${!anthropic ? "no ANTHROPIC_API_KEY" : "DRAFT_LOOP=off"})`);
  if (STORES.length && pool) { setTimeout(() => scanStuck().catch(() => {}), 60000); setInterval(() => scanStuck().catch(() => {}), 6 * 3600 * 1000); console.log(`📦⏳ Shipment watch: every 6h (never scanned ${STUCK_DAYS}+ d · not delivered ${UNDELIVERED_DAYS}+ d · orders since ${STUCK_SINCE})`); }
  if (OOS_ON) { setTimeout(runOosLoop, 20000); setInterval(runOosLoop, OOS_INTERVAL); console.log(`📦❌ Out-of-stock hand-off: on (every ${OOS_INTERVAL / 1000}s)`); }
  console.log(`🧰 Emily tools (${TOOLS.length}): ${TOOLS.map((t) => t.name).join(", ")}`);
  console.log(`🏬 Shopify stores (${STORES.length}): ${STORES.map((s) => s.brand).join(" · ") || "NONE"} · ShipStation: ${shipstationConfigured() ? "keys set" : "off"}`);
}
module.exports = { __test: { propose: (i) => shopifyProposeDiscount(i), forget: () => pendingAct.clear() }, start, decide, onHumanReply, handleTicket, customerHistory, customerProfile, orderDetail, applyOrderAction, shopifyLookupOrder, listActions, applyAction, dismissAction, fillPlaceholders, setTodo, pendingFiles, markFilesSent, scanStuck, listStuck, stuckCounts, setStuckState, emailStuckCustomer, stuckEmailTemplate };
