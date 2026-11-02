---
name: n8n-template-publish
description: |
    Submit a workflow of `examples/` to the n8n template library (n8n.io/workflows) as Reduck's
    creator account, and follow it to publication: submit, read the AI review, finalize, wait for
    the human review, answer a "changes needed". Driven by the Reduck scripts of
    `reduck/creators.n8n.io`. Use when asked to "submit", "publish" or "share" a workflow as an
    n8n template, to check where a submission stands, or to answer n8n's review. NOT for making
    the workflow itself ready: that is `n8n-workflow`, and it comes first.
---

# Publish an n8n template

A template is a workflow of `examples/` that already meets `n8n-workflow`. This skill only moves
it through n8n's library. Load `n8n-workflow` first when the workflow has changed since its last
test.

## n8n's process

n8n's Creator hub, loaded as it is now. Where this skill and the page disagree, the page wins:
fix this skill.

<n8n-creator-hub>
!`for d in "${CLAUDE_SKILL_DIR}/../n8n-workflow" .claude/skills/n8n-workflow n8n-nodes-reduck/.claude/skills/n8n-workflow; do [ -f "$d/notion-page.mjs" ] && exec node "$d/notion-page.mjs" 7bd2cbe0fce0449198ecb23ff4a2f76f; done; echo "Could not load the page: read https://n8n.notion.site/7bd2cbe0fce0449198ecb23ff4a2f76f"`
</n8n-creator-hub>

## Where it stands now

<my-templates>
!`R=$(git rev-parse --show-superproject-working-tree 2>/dev/null); R=${R:-$(git rev-parse --show-toplevel 2>/dev/null)}; node "$R/integrations/ts/cli/dist/index.js" run --script reduck/creators.n8n.io/list_my_templates 2>/dev/null || echo "Not read: run reduck/creators.n8n.io/list_my_templates"`
</my-templates>

The account can have one template under review at a time (four once verified). A template in
`ai_review`, `in_review` or `changes_needed` blocks the next submission.

## The Creator Portal, as the scripts drive it

creators.n8n.io is a page over an API at api.n8n.io, as the creator signed in to the paired Chrome.
The scripts send the portal's own requests; read each one's contract with `read_script` before
the first use.

- `reduck/creators.n8n.io/list_my_templates`: every template, with its status.
- `reduck/creators.n8n.io/get_my_template`: one template: description, workflow, AI feedback.
- `reduck/creators.n8n.io/submit_template` (write): a new submission from a workflow JSON.
- `reduck/creators.n8n.io/update_template` (write): finalize, resubmit, a new version, the price.
- `reduck/creators.n8n.io/delete_template` (write): removes it, for everyone. Never without the
  user's go.

A workflow is too large to type into a tool call. Send the file's bytes through the CLI, from the
monorepo root:

```bash
node integrations/ts/cli/dist/index.js run --script reduck/creators.n8n.io/submit_template \
  "workflow=$(python3 -c 'import json;print(json.dumps(json.load(open("n8n-nodes-reduck/examples/<name>.json"))))')"
```

The statuses, in order:

1. **`ai_review`**, no feedback: the portal runs its AI check, in a few minutes. The name and the
   description are "New Submission" until then.
2. **`ai_review`**, `hasAiFeedback: true`: "Finalize submission". `aiFeedback` holds
   `suggestedTitle`, `suggestedDescription` and `suggestedJson`; the portal has already copied the
   title and the description into the template. Its scores and explanations can be empty: it
   edits, it does not judge.
3. **`in_review`**: a person reviews it, for 3 to 5 business days. n8n answers by email.
4. **`published`** (at `https://n8n.io/workflows/<id>`), **`changes_needed`**, or
   **`wont_publish`**.

## Steps

1. **Ready.** The workflow meets `n8n-workflow`, and the file in `examples/` is the one tested.
   Nothing is under review (see above).
2. **Submit** the file with `submit_template`, as above. It is only the AI check: nothing is public
   yet, but it takes the account's one review slot.
3. **Read the AI review** with `get_my_template` once `hasAiFeedback` is true. Diff `suggestedJson`
   against the file, node by node and by connection. Take what makes the workflow clearer (node
   names, section notes); refuse what is wrong. The AI does not know the Reduck node: it writes
   generic setup steps ("configure the email credentials") and drops warnings. Keep the
   `n8n-workflow` rules: a change to the workflow is a change to `examples/`, tested again.
4. **Write the description** from the AI's draft, in the portal's sections, each a `## ` heading:
   `Quick overview`, `How it works` (numbered), `Setup` (numbered), `Requirements` (bullets),
   `Customization` (bullets), `Additional info`. Requirements names what n8n's guidelines ask for
   a community node: `@reduck-ai/n8n-nodes-reduck` with the version tested and a link to
   https://docs.reduck.ai/n8n/#quick-start, self-hosted n8n only (until the node is verified),
   the Reduck account, and the Reduck extension with the sites to sign in to. Published text:
   ASD-STE100, no em-dash.
5. **The picture.** A community-node template needs one. A screenshot of the canvas from the
   fresh n8n of `n8n-workflow`'s test, with the credential set (no warning icons) and the pointer
   off the canvas, saved as `images/<name>-workflow.png`, at the end of the description as
   `![The workflow](https://raw.githubusercontent.com/reduck-ai/n8n-nodes-reduck/main/images/<name>-workflow.png)`.
   The portal's description editor also takes an upload (`fileId:`), which needs no repo.
6. **Commit** the example and the picture straight to `main` (see `/init_n8n`). `examples/` and
   `images/` are not a release. Check that the picture's URL answers 200.
7. **Show the user** the name, the description and the workflow diff, and wait for their go:
   finalizing sends it to n8n's reviewers.
8. **Finalize** with `update_template` and the name, the description and the workflow, each read
   from its file. Read it back with `get_my_template`: the status is `in_review`, and the stored
   description and workflow equal what was sent.

## After the review

- **`published`**: open its page and check the preview and the picture.
- **`changes_needed`**: read n8n's email (the user has it) and the template. Fix the workflow in
  `examples/` with `n8n-workflow`, test, commit, then `update_template` with the name, the
  description and the workflow. The portal refuses a workflow equal to the one sent before.
- A new version of a published template: `update_template` with the workflow alone; it goes back
  under review.
