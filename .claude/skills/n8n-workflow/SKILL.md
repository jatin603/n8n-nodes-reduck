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
- **The notes are the manual.** Each claim is true: of the nodes, or, for another product, with a
  source. A claim you cannot check goes.
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
- A picture is required (n8n asks one for a community node): a PNG in `images/`, named after the
  example.
- The type is `@reduck-ai/n8n-nodes-reduck.reduck`. The dev n8n names it `CUSTOM.reduck`: rewrite
  it in a copy to test there, never in the file.

**Config**
- One Set node named `Config`. Every trigger leads to it. Placeholders, never our values.
  Example: `subreddits` = `<subreddit>, <subreddit>`, not `mcp, n8n`.
- Everything a user would change is there: values held in a Code node, prompts, tone, a node
  setting such as a country. A list is one string, one item per line or comma-separated.
- The first Code node after it checks it, and fails before any Reduck node runs.
  Example: `throw new Error('Config: set from and to as YYYY-MM-DD.')`.

**Repeated runs**
- Nothing to do: a Code node returns `[]`. The run ends with no error.
- To know what is done, read the earlier results first. A read that finds no row ends the run,
  unless the node has `alwaysOutputData`.
- A write (book, post, send, a row) comes after a check that it is still needed.
  Example: Doctolib books only when no upcoming appointment with these doctors exists.
- A write that failed: the notes say how to retry it.

**Each Reduck node**
- The node's latest `typeVersion`, `simplify: true`, `credentials: {}`, script **By Address**
  (`reduck/<host>/<slug>`). An upgrade changes the defaults (authentication, browser) and the
  output (`simplify`): set them explicitly, and fix the expressions after the node.
- The browser on purpose: `""` (managed) or `extension` (the user's Chrome, for their accounts).
  The script's contract (`read_script`: its note and its success per browser) says which one
  works, and whether a managed browser needs a `country`.
- A node note says where it runs and why. Example: "Your paired Chrome: Reddit blocks managed
  browsers."
- One credential: **Connect to Reduck** in one node, and n8n adds it to the others.

**Notes**
- Overview: yellow (no `color`), top-left. Section notes: white (`color: 7`).
- The overview has the structure of n8n's sticky-note page. Its `### Setup` adds, one line each:
  - the package `@reduck-ai/n8n-nodes-reduck`, with no version: the user installs the latest,
    self-hosted n8n only, https://docs.reduck.ai/n8n/#quick-start;
  - the Reduck account, and Connect to Reduck in one node;
  - for `extension` nodes: the extension, the sites to sign in to, Chrome kept open;
  - each Config field, with an example;
  - when the first run acts for real: "This is not a test."
- Limits, in a line or two at the end of `### How it works`: what the user pays (managed runs,
  model calls), what a site can refuse. The word limit is tight: say each thing once.

**Layout**
- The canvas is the first thing a user sees, and the picture shows it: the layout matters as much
  as the notes.
- Left to right, one section note per step, with its nodes inside it.
- A long flow goes on two rows when that looks better than one wide row. Row 2 starts under row 1,
  with a gap for the wire that goes back. Example: `chatgpt-brand-visibility.json`.
- The layout is the `position` of each node and the `width` and `height` of each note, in the
  JSON. Change only those, then look at the canvas.

**Forms** need a `webhookId` per node: the editor adds it, an import does not.

**Text** that a user reads (notes, errors, forms, prompts): ASD-STE100, no em-dash.

## Test it

The scripts are in this folder.

1. `node check.mjs <file>`: every rule a script can verify, read live from n8n's page and the
   node's code. Zero problems. When it says a rule could not be read, fix the check, not the
   workflow.
2. `./fresh-n8n.sh up <node version>`, then `./fresh-n8n.sh import <file>`: an empty n8n with the
   node from npm, and the workflow in it with a Reduck credential set. Its login is in the file it
   names.
3. Set it up from the notes alone. A step you had to guess is a step to rewrite.
4. Run it, and check the result where it lands. A run that writes for real needs the user's go:
   say what it does, and as which account. A workflow that has not run does not ship.
5. The picture: that canvas, pointer off it.
6. `./fresh-n8n.sh down`.
