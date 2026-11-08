# Krewe of Vaporwave — project memory

Static site for a New Orleans Mardi Gras krewe. Plain HTML, no build step, no
backend. GitHub Pages, `CNAME` → kreweofvaporwave.com. Pages share `vkvcss.css`
+ `vkvjs.js` (`randombg()` picks a background at load); the nav `<ul>` is
copy-pasted into every page rather than included.

Membership is pseudonymous on purpose — members set real identities aside when
publishing. Keep that in mind before exposing rosters or archives anywhere.

## The mailing list

The krewe communicates via **kreweofvaporwave@googlegroups.com** — a *consumer*
Google Group, NOT a Workspace group. That distinction drives everything below.

### What is impossible (verified Sept 2026, don't re-litigate)

Consumer `@googlegroups.com` groups have **no membership API at all**:

- Admin SDK Directory API and Cloud Identity Groups API are Workspace-domain
  only. Google's docs say to use the web interface for non-business groups.
- No mail command adds a third party. The complete set is `+subscribe`,
  `+unsubscribe` (both act on **the sender only**), `+owner`/`+owners`,
  `+manager`/`+managers` (mail routing), `+noreply`.
- No CSV/bulk import (that's Admin console = Workspace). GAM is Workspace-only.

So: **a one-click web form that adds a member cannot be built.** Adding someone
is always one human in the Groups web UI. Netlify/Apps Script/service-account
designs all die on this — don't design one.

Corollary: "one click" and "no spam" are in tension. Blocking abuse requires
knowing the submitter is a member, which requires a sign-in.

### The join flow that works

```
mail enlist@kreweofvaporwave.com  →  relays to kreweofvaporwave+subscribe@
  →  Google replies asking to confirm  →  REPLY to it  →  member
```

**Reply, never click.** The confirm mail's "Join This Group" button is a
groups.google.com URL — it 404s ("Content unavailable") because the group is
invisible, and also breaks on multi-account Google sessions. Replying touches
no web page and needs no Google account. Verified end to end.

The confirm mail is subject `Join request for kreweofvaporwave` + a random
token, from `+subconfirm@googlegroups.com`. It reads as phishing and lands near
spam; anything user-facing must name it in advance or people delete it.

Deliverability note: self-subscribe beats invites. The subscriber mails the
group first, so the reply arrives in a thread they started. Cold invites from
`noreply@groups.google.com` are the ones that get spam-foldered.

### enlist@ relay — a Google Group CANNOT do this job

`enlist@kreweofvaporwave.com` exists to mask the ugly `+subscribe` address.
Implementing it as a **Workspace group is a dead end** (tested, Sept 2026):

Google Groups rewrites the `From` header when the *author's* domain publishes
DMARC `p=quarantine` or `p=reject`, because relaying it intact would fail DMARC
at the receiver. `+subscribe` acts on `From`, so it then subscribes **the alias
instead of the person**, and the confirmation mail comes back to the group.
Confirmed against a strict-DMARC sender. This is compliance behavior, not a
setting — no group configuration disables it, and `Default sender: Author's
address` does not save you. Gmail is `p=none` so it passes, which makes this
fail for *some* senders only: the worst possible failure shape.

Use a **routing rule** instead: Admin → Gmail → Routing → Recipient address
map, `enlist@` → `kreweofvaporwave+subscribe@googlegroups.com`. SMTP-level
recipient rewriting preserves `From` and the original DKIM signature. An
address cannot be both a group and a routing target, so the group must go.

### The auto-reply must send AS enlist@

Group auto-replies are hardcoded to send from `<group>+noreply@<domain>` and
get spam-filtered almost everywhere — a short automated message telling you to
check your spam folder and reply with a code is phishing-shaped, and a `+noreply`
address has no sending reputation to overcome it. A dedicated `enlist-notify`
group was built and abandoned for exactly this.

What works: `enlist@` is an **alias on a real user**, so mail to it lands in a
mailbox, and a Gmail filter on `to:enlist@` sends a template **from `enlist@`**.
The sender just mailed that address, so the reply arrives in a thread they
started — the same correspondence signal that gets `+subconfirm` delivered.

This forces the routing rule to use **Also deliver to** rather than *Replace
recipient*: replacing sends the mail away from the mailbox, so no filter fires.
Set Options to "non-recognized and recognized addresses" since `enlist@` now
resolves. Routing does not rewrite `From` — that is a Groups redistribution
behavior, and routing is not redistribution.

Join instructions therefore live in the auto-reply, not on the website. There
is no join page; `vkvmembers.html` just names the address.

Last resort if the routing rule also fails: publish
`kreweofvaporwave+subscribe@googlegroups.com` directly. No relay hop means
nothing can rewrite anything. Ugly and unsayable, but universal.

## Domain mail

`kreweofvaporwave.com` is on Google Workspace (MX + SPF). DKIM and DMARC were
absent until Sept 2026 — Workspace does NOT enable DKIM for you, and mail from
the domain was being spam-foldered as a result. Now published:

- `google._domainkey` — DKIM, generated via Admin → Gmail → Authenticate email
- `_dmarc` — `p=none` monitoring only. **Do not move to `p=reject`**; strict
  DMARC on this domain would create new relay problems.

Cross-domain `rua` needs the report domain to opt in with a TXT record at
`kreweofvaporwave.com._report._dmarc.<report domain>`, or reports never arrive.

### Deliberate settings (don't "fix" these)

- **Group stays invisible** (`Who can see group` restricted). Making it visible
  would fix the dead confirm button and add a true one-click join for Google
  users — but discovery doesn't roll back once people have found and joined it.
  Asymmetric, so the fence stays until there's evidence of real drop-off.
- Archive and roster are closed to members already, via visibility. No need to
  touch `Who can view conversations` — doing so would also break archive search
  for the ~123 existing members.
- New members' posts are moderated. That, plus the closed archive, is what
  contains a bot that joins.
- `Who can manage members` is left at managers. It is a **combined** permission
  — add, remove, ban, approve — with no way to grant add alone, so opening it
  would let any of 123 pseudonymous members drop anyone.

### Migration

The domain already has Google Workspace MX + SPF, so moving to a Workspace
group (which *does* have the API, and thus the one-click form) is cheaper than
it first appears. Still rejected: re-subscribing ~123 members and breaking
everyone's existing mail filters costs more than the manual paste it saves.

**There is no API to restore membership.** Before any settings change that
warns about removing members, export the roster first — recovery is manual,
one member at a time, each generating mail to someone who thought they were
already subscribed.

## The members roster

`vkvmembers.html` renders a union of two sources, shuffled on every load:

1. The `<li>`s hardcoded in `<ul id="roster">` — the legacy krewe. These are
   credits, not a directory; a 2019 pseudonym is still a real credit, so they
   are never pruned. They double as the **fallback**: if `members.json` is
   missing or malformed the page renders exactly as it did before `loadroster()`
   existed.
2. `members.json` — `{"names": [...]}`, written by the Apps Script project
   described below.

### Contract with the Google side

The Apps Script project that writes `members.json` is `rosterSync/` in
`media-arts-collective/wavebucks` (moved there per wavebucks#59, landed in
wavebucks#120 — it used to be `tools/roster-sync/` in this repo; that copy is
deleted as of this PR, superseded, not duplicated). This repo keeps
`members.json` and the rendering code; that repo keeps the source that writes
it. Full design rationale and the mailbox-based identity model stay in this
file; `rosterSync/README.md` covers only what runs from there.

`Setup.js:setup()` installs the polling trigger and nothing else. There is no
Form: members mail `roster@kreweofvaporwave.com` and **the `From` header is the
identity** — the address someone mails from is the one they are on the list
with. Nothing is typed, nothing is verified, nothing needs a login, and mailing
again is how a pseudonym changes.

A mailbox beat a Google Form on every axis that mattered: no URL to distribute,
no Google sign-in that would have excluded members on non-Google addresses, and
no second place for member addresses to accumulate. It is also the house
pattern — `scribaSenatus` in `media-arts-collective/wavebucks` is the same
shape, a trigger scanning an inbox.

- `roster@kreweofvaporwave.com` is an **alias on a real user**, so mail to it
  lands in a mailbox a Gmail search can reach. No routing rule, unlike
  `enlist@` — this address must not be forwarded anywhere.
- `Setup.js:ensureAlias_()` creates that alias itself through the Admin SDK.
  The Directory API **does** cover this, because it is a Workspace user in a
  domain we control — the impossibility recorded above is specific to the
  consumer `@googlegroups.com` group, and the two must not be conflated.
  Needs a super admin; falls back to a named console path in the error.
- The whole file is rebuilt from every message to that address on each run, so
  nothing depends on read state or labels surviving. Latest message per sender
  wins.
- Sender addresses are read only to key that dedupe. They are never written to
  `members.json`, never committed, never leave Google.
- Auth is a fine-grained GitHub PAT in Script Properties, scoped `Contents:
  read/write` on this repo alone. No Google credential is created and none
  leaves the account — which is why this runs in Apps Script rather than a
  GitHub Action, where the Google key would have to live in repo secrets.

### Rejected designs

- **Netlify portal with member accounts.** Auth for ~75 pseudonyms is the same
  identity-vs-friction trap as the one-click join form, for a smaller payoff.
- **A Sheet published to web, fetched client-side.** Worked, but staked the page
  on a CORS behavior and on never misclicking "Entire document" in the publish
  dialog — with member emails one tab away. Committing a names-only JSON file
  removes both risks and the runtime dependency.
- **A Google Form.** Needed a URL distributed to everyone, and its identity was
  a typed, unverified email field — strictly worse than a `From` header. Its
  sign-in option would have excluded the external members on the list entirely,
  and its response sheet was a second place for member addresses to sit.
- **Manual paste from the Groups member table.** Google Groups does have a
  member-editable Display Name, but no API on a consumer group to read it back,
  so the sync would be a recurring human step. Those do not happen.

### Two repos share this name

- **`media-arts-collective/kreweofvaporwave.github.io`** -- this clone's
  `origin`, created 2026-08-30, actively pushed, Pages-served. **This is the
  live site** (hf7y/realisateur#1221) and the only correct target for anything
  writing through the GitHub API.
- **`kreweofvaporwave/kreweofvaporwave.github.io`** -- a *different* repo on the
  `kreweofvaporwave` **user** account, the 2019 original, last pushed
  2025-12-10. Shares history, so commit SHAs resolve in both and a lookup
  "succeeding" proves nothing.

`gh repo view` reports the **user** repo, because this clone has an `upstream`
remote marked `gh-resolved = base`. Trust `git remote get-url origin`, not `gh`.
A sync pointed at the user repo would commit successfully to a site nobody
serves.

### Why Apps Script, and why it moved

`GmailApp` reads the mailbox and `ScriptApp` installs the trigger; neither is
reachable from outside Apps Script. The one browser step left is authorizing
the Gmail scope on the first run, which no credential avoids.

It used to be checked in here as `tools/roster-sync/`, the only one of the
estate's four clasp projects not living with the other three. wavebucks#59
settled that split was legibility debt, not a functional need, and Zach
ordered the move (wavebucks#59, 2026-09-29: "merge the work into the mono
repo"); wavebucks#120 landed it as `rosterSync/`. Credential details (the
`unattended-vaporwave` GitHub App, Script Properties, the vaporwave-host
preference for `WebApp.js` over `syncRoster()`) now live in
`media-arts-collective/wavebucks`'s `rosterSync/README.md` next to the code
that uses them, rather than duplicated here where they'd drift.

### Nothing enforces the review but the habit of asking for one

`master` protection, measured directly rather than assumed (`gh api
repos/media-arts-collective/kreweofvaporwave.github.io/branches/master/protection`,
2026-11-08): **no required reviews, no required status checks.** This
contradicts an earlier version of this section that claimed one approving
review was required — it was not re-measured before being written down, and
nothing here enforces it; only a prior commit's claim did.

Consequences worth knowing before reasoning about a PR here:

- A merge publishes to the public web immediately — Pages serves `master`.
- Nothing on GitHub's side stops `--auto` or a direct merge from landing
  unreviewed the moment a PR is mergeable. Issue #4's ban on merging it
  yourself or arming auto-merge is therefore the *only* control, not a second
  belt alongside branch protection — treat it accordingly.
- "Checks are green" means nothing: there are none. A PR reading as mergeable
  proves nothing about whether anyone has looked at it.
