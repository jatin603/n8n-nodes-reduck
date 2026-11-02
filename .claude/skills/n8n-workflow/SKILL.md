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

## First principles

- **The JSON is the product.** A stranger imports it and runs it with nothing else, and with none
  of our accounts, data or help.
- **n8n's pages are the rules.** They are loaded below, as they are today. When this skill and
  them disagree, they win: fix this skill.
- **The notes are the manual.** Each claim in a note is true of the nodes, or it is a bug.
- **A run is repeated.** A schedule runs it again and again: a run with nothing to do does nothing,
  and a write happens once.
- **Test what ships.** The exact file, in an n8n that has never seen it.

## n8n's rules

<n8n-template-guidelines>
!`for d in "${CLAUDE_SKILL_DIR}" .claude/skills/n8n-workflow n8n-nodes-reduck/.claude/skills/n8n-workflow; do [ -f "$d/notion-page.mjs" ] && exec node "$d/notion-page.mjs" 9959894476734da3b402c90b124b1f77; done; echo "Could not load the page: read https://n8n.notion.site/9959894476734da3b402c90b124b1f77"`
</n8n-template-guidelines>

<n8n-sticky-notes>
!`for d in "${CLAUDE_SKILL_DIR}" .claude/skills/n8n-workflow n8n-nodes-reduck/.claude/skills/n8n-workflow; do [ -f "$d/notion-page.mjs" ] && exec node "$d/notion-page.mjs" 2aa5b6e0c94f8058b0aefddd02655887; done; echo "Could not load the page: read https://n8n.notion.site/2aa5b6e0c94f8058b0aefddd02655887"`
</n8n-sticky-notes>

## What the Reduck node adds

**Files**
- `examples/<what-it-does>.json`, listed in the README's **Examples**. A change to `examples/` is
  not a release.
- Its picture is required (n8n asks one for a community node): `images/<same-name>-workflow.png`.
- The type is `@reduck-ai/n8n-nodes-reduck.reduck`. The dev n8n names it `CUSTOM.reduck`: rewrite
  it in a copy to test there, never in the file.

**Config**
- One Set node named `Config`, after the trigger. Placeholders, never our values.
  Example: `subreddits` = `<subreddit>, <subreddit>`, not `mcp, n8n`.
- The first Code node checks it, and fails before any Reduck node runs.
  Example: `throw new Error('Config: set from and to as YYYY-MM-DD.')`.
- Every value the user writes is in Config, prompts and tone included.

**Repeated runs**
- Nothing to do: a Code node returns `[]`. The run ends with no error.
- A write (book, post, send) comes after a check that it is still needed.
  Example: Doctolib books only when no upcoming appointment with these doctors exists.
- A write that failed: say in the notes how to retry it.

**Each Reduck node**
- `typeVersion` 1.2, `simplify: true`, `credentials: {}`, script **By Address**
  (`reduck/<host>/<slug>`).
- The browser on purpose: `""` (managed, with `region`, and `country` when the site varies by
  country) to read public pages; `extension` (the user's Chrome) when it needs their account.
- A node note says where it runs and why. Example: "Your paired Chrome: Reddit blocks managed
  browsers."
- One credential: **Connect to Reduck** in one node, and n8n adds it to the others.

**The overview note**, in n8n's three headings, 100 to 300 words. Under `### Setup`:
- the package `@reduck-ai/n8n-nodes-reduck`, the version tested, self-hosted n8n only, and the
  link https://docs.reduck.ai/n8n/#quick-start;
- the Reduck account, and Connect to Reduck in one node;
- for `extension` nodes: the extension, the sites to sign in to, and Chrome kept open;
- each Config field, with an example;
- when the first run acts for real: "This is not a test."

Limits go in the note too: what the user pays (managed runs, model calls), what a site can refuse.

**Forms** need a `webhookId` per node: the editor adds it, an import does not.

**Text** that a user reads (notes, errors, forms, prompts): ASD-STE100, no em-dash.

## Test it

1. `node check.mjs <file>` (in this folder): the checks a script can do. Zero problems.
2. A fresh n8n: empty database, the node from npm, its own port (5692; the dev n8n is 5678, the
   clean one 5690).
   ```bash
   F=<scratchpad>/n8n-fresh; mkdir -p $F/.n8n/nodes
   (cd $F/.n8n/nodes && nvm exec 24 npm install @reduck-ai/n8n-nodes-reduck@<version>)
   N8N_USER_FOLDER=$F N8N_PORT=5692 N8N_HOST=127.0.0.1 N8N_LISTEN_ADDRESS=127.0.0.1 \
     N8N_EDITOR_BASE_URL=http://127.0.0.1:5692 N8N_RUNNERS_BROKER_PORT=5693 \
     N8N_SECURE_COOKIE=false nvm exec 24 n8n start
   ```
   Owner via `POST /rest/owner/setup` (a generated password, kept in that folder), then
   `n8n import:workflow`.
3. Set it up from the notes alone. A step you had to guess is a step to rewrite.
4. Run it, and check the result where it lands. A run that writes for real needs the user's go:
   say what it does, and as which account.
5. The picture: this canvas, credential set, pointer off it.
6. Stop that n8n, delete its folder. Note the n8n and node versions tested in the overview note.
