---
name: n8n-workflow
description: |
    Write or clean up an n8n workflow that uses the Reduck node, so a stranger can import it, set
    it up from its notes and run it. The rules are n8n's own for its template library, loaded live
    from n8n's pages, plus what is specific to the Reduck node. They apply to every workflow in
    `examples/`, published or not. Use when asked to write, add, clean up or review an example
    workflow, "make this workflow reusable", or before a workflow goes to the template library.
    NOT for submitting to the library (that is `n8n-template-publish`), and NOT for the node's own
    code (AGENTS.md and `.agents/`).
---

# n8n workflow

A workflow in `examples/` is a product: someone imports it, follows its notes, and runs it with
nothing else. It must work from the JSON alone, on an n8n that is not ours, for an account that is
not ours.

## The rules are n8n's

n8n's pages below are the standard, loaded as they are now. Where this skill and these pages
disagree, the pages win: fix this skill.

<n8n-template-guidelines>
!`for d in "${CLAUDE_SKILL_DIR}" .claude/skills/n8n-workflow n8n-nodes-reduck/.claude/skills/n8n-workflow; do [ -f "$d/notion-page.mjs" ] && exec node "$d/notion-page.mjs" 9959894476734da3b402c90b124b1f77; done; echo "Could not load the page: read https://n8n.notion.site/9959894476734da3b402c90b124b1f77"`
</n8n-template-guidelines>

<n8n-sticky-notes>
!`for d in "${CLAUDE_SKILL_DIR}" .claude/skills/n8n-workflow n8n-nodes-reduck/.claude/skills/n8n-workflow; do [ -f "$d/notion-page.mjs" ] && exec node "$d/notion-page.mjs" 2aa5b6e0c94f8058b0aefddd02655887; done; echo "Could not load the page: read https://n8n.notion.site/2aa5b6e0c94f8058b0aefddd02655887"`
</n8n-sticky-notes>

`notion-page.mjs <page id>` prints any public page of n8n's Notion the same way, for a page these
link to.

## What the Reduck node adds

**Where it lives.** `examples/<what-it-does>.json`, one workflow per file, listed in the README's
**Examples** section. GitHub serves it from `main`, so a change to `examples/` is not a release.
Its picture, when it has one, is `images/<same-name>-workflow.png`.

**Node type.** The file names the published type, `@reduck-ai/n8n-nodes-reduck.reduck`. The dev
n8n loads the node as `CUSTOM.reduck`: to test there, rewrite the type in a copy, never in the
file.

**The configuration node is named `Config`**, a Set node directly after the trigger, read with
`$('Config').first().json`. The README and the notes call it that, so it keeps that name when the
other nodes get descriptive ones. The first Code node after it fails on a missing or malformed
value with an error that starts with `Config:` and says what to put there: a run on an empty
Config stops before any Reduck node.

**A run that has nothing to do** returns `[]` from a Code node: it ends without an error, and the
next trigger tries again. A schedule runs a workflow many times: make a run after the job is done
do nothing (Doctolib: an upcoming appointment with one of the doctors stops the run), and put a
step that writes (book, post, send) behind a check that it is still needed.

**Each Reduck node:**
- `typeVersion` is the node's latest.
- The script in **By Address** mode (`reduck/<host>/<slug>`), so the workflow loads with no call.
- The browser set on purpose: `extension` (the user's paired Chrome: signed in where they are,
  Chrome must be open) or `""` (a managed browser, with `region`, and `country` for a site that
  changes by country). Read public pages on a managed browser; act on the paired Chrome when it
  needs the user's account.
- `simplify: true`.
- A node note (`notes`, `notesInFlow: true`) that says where it runs: "Your paired Chrome",
  "Reduck managed browser, France".
- `credentials: {}`. The user connects once: in one Reduck node, **Connect to Reduck** creates the
  credential, and n8n adds it to every other Reduck node of the workflow. An API key credential
  needs **Authentication** set to **API Key** in each Reduck node.

**What the notes must say for Reduck**, inside n8n's structure: the Reduck account and how to
connect it, the Reduck extension and the sites to sign in to in that Chrome (for each node on
`extension`), that Chrome must stay open, and, when the first run acts for real, that it is not a
test.

**A form** (Form Trigger, a Wait with a form) needs a `webhookId` on each of its nodes. The editor
adds it, an import does not: ship a fresh UUID in the JSON.

**Text** in notes, node notes and errors is published text: ASD-STE100, no em-dash.

## Test it

Test the exact file you ship.

1. **Static checks**, in one script: the JSON parses; each node name is unique; every
   `$('<name>')` and every connection names a node that exists; no `pinData`; each Reduck node
   has `credentials: {}`; no email address, sheet id, chat id, or webhook URL of ours in a value;
   the overview note's word count and headings are the ones n8n's sticky-note page asks for.
2. **A fresh n8n**: an empty database, the node from npm at the version you will state, on a port
   of its own (the dev n8n is on 5678 and the clean one on 5690, see `/init_n8n`; a third n8n on
   `localhost` or the same port would replace their session cookie).
   ```bash
   F=<scratchpad>/n8n-fresh; mkdir -p $F/.n8n/nodes
   (cd $F/.n8n/nodes && nvm exec 24 npm install @reduck-ai/n8n-nodes-reduck@<version>)
   N8N_USER_FOLDER=$F N8N_PORT=5692 N8N_HOST=127.0.0.1 N8N_LISTEN_ADDRESS=127.0.0.1 \
     N8N_EDITOR_BASE_URL=http://127.0.0.1:5692 N8N_RUNNERS_BROKER_PORT=5693 \
     N8N_SECURE_COOKIE=false nvm exec 24 n8n start
   ```
   Create its owner with `POST /rest/owner/setup` (a generated test password, kept in a file in
   that folder), import the file with `n8n import:workflow` and a fixed `id`, open it: it renders,
   and only the credential is missing.
3. **Set it up from its notes alone**, as a new user. A step you had to guess is a step to rewrite.
4. **Run it** on representative input, and check the result where it lands (the email, the
   booking, the row). Then the branches n8n's page lists. A run that writes for real (books,
   posts, sends) needs the user's go first: say what it will do, and as which account.
5. Stop that n8n and delete its folder.
