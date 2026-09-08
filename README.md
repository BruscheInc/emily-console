# Emily Console

A full CS inbox over **Gorgias**, and an extension of Emily. Node/Express PWA — no database (reads live from Gorgias).

## What it does
- **Queue by state:** Pending (customer waiting), Responded (we replied last), Closed, All — filter by brand, search by name/subject.
- **Full conversation threads:** every message in a ticket, both sides, chronological (not just the last message).
- **Act on tickets:** reply to the customer (sends via Gorgias from the brand's support address), add an internal note, close/reopen.
- **Extension of Emily:** every action is mirrored to the Slack CS channel, and an **Ask Emily** button pings Emily in Slack to draft the ticket.

## Environment
| Var | Purpose |
|---|---|
| `CONSOLE_KEY` | access key (Jose only) |
| `GORGIAS_DOMAIN` / `GORGIAS_EMAIL` / `GORGIAS_API_KEY` | reused from the other services |
| `SLACK_BOT_TOKEN` / `CS_CHANNEL` | mirror actions + ping Emily |
| `EMILY_SLACK_ID` | Emily's Slack user id (for the Ask-Emily ping) |
| `PORT` | provided by Railway |

## Deploy (Railway)
1. Create repo `BruscheInc/emily-console`, upload `server.js`, `package.json`, `README.md`, `public/`.
2. Create the service from the repo; set the env vars above (reference the existing services so no secrets are copied).
3. Generate a domain, open `/?key=<CONSOLE_KEY>`.

## Notes
- Replies send from the ticket's connected brand address (e.g. hello@larkspurbabyoutlet.com) to the customer — the same path Emily uses.
- Messages are rendered as sanitized text (no tracking pixels / no HTML injection).
- Spam-tagged tickets are hidden from the queue.
