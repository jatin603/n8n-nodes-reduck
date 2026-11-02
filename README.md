# Official [Reduck](https://reduck.ai) node for [n8n](https://n8n.io)

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/reduck-ai/n8n-nodes-reduck/main/images/reduck-x-n8n-dark.png" />
    <img src="https://raw.githubusercontent.com/reduck-ai/n8n-nodes-reduck/main/images/reduck-x-n8n-light.png" alt="Reduck × n8n" width="460" />
  </picture>
</p>

n8n is a powerful automation framework but faces key challenges:

- **No API exists**, e.g. Facebook groups have none since 2024.
- **Hard to get APIs**, e.g. Reddit gives an API key only after reviewing applications.
- **Inadequate APIs**, e.g. Facebook's API reads only Pages you manage.
- **Hard to set up credentials**, e.g. Google requires you to make an OAuth app first.

Reduck solves this by making it easy to automate sites with no API by writing browser automation scripts with Agents and running them with a n8n node.

With Reduck you can:

- Find LinkedIn profiles, qualify them and send connection requests.
- Read and post in Facebook groups.
- Search Reddit and read every comment of a thread.
- ... or create your own workflow on top of any site without API!

You can run scripts from the [Reduck library](https://reduck.ai/explore), or from ones you create yourself for custom integrations (see
[Building your own script](#building-your-own-script-and-using-it)) using Reduck MCP.

A script runs in a browser. You choose which one in the node's **Browser** field:

- **Your paired browser**: your own Chrome, with the Reduck extension. The script uses your
  sessions, so it is signed in where you are. Chrome must be open.
- **A Reduck managed browser**: a browser in the Reduck cloud. It runs 24/7 without your
  computer.

> [!NOTE]
> A managed browser does not store any credentials and starts fresh, so it can only read public pages. We will provide cookie storage and reuse soon to allow to run scripts with managed browsers.

To choose between the two, see the [FAQ](#faq).

## Requirements

- An [n8n](https://docs.n8n.io/hosting/) instance where you can install community nodes.
- A [Reduck account](https://reduck.ai/#signin).
- The [Reduck extension](https://chromewebstore.google.com/detail/reduck/koccidjchcojlmgkdhibpgjbnhcoopio),
  paired with your account (see [pairing](https://docs.reduck.ai/#quick-start)). Scripts run on
  this browser by default. To run without it, set **Browser** to **Reduck Managed Browser**.

## Quick start

<!-- tabs -->

### CLI

1. **Stop n8n, then install the node.** You need n8n 2 or later:

   ```bash
   mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes && npm install @reduck-ai/n8n-nodes-reduck
   ```

2. **Add your API key as a credential.** Get a key from [API keys](https://reduck.ai/api-keys).
   n8n encrypts it when it imports the file:

   ```bash
   cat > reduck-credential.json <<EOF
   [{"id": "reduckQuickStart", "name": "Reduck API", "type": "reduckApi", "data": {"apiKey": "$REDUCK_API_KEY"}}]
   EOF
   n8n import:credentials --input=reduck-credential.json && rm reduck-credential.json
   ```

3. **Import and publish the workflow.** It answers a webhook with the Google AI Overview for a
   search. It runs on a Reduck managed browser, so you do not need the extension:

   ```bash
   curl -sO https://raw.githubusercontent.com/reduck-ai/n8n-nodes-reduck/main/examples/google-ai-overview-webhook.json
   n8n import:workflow --input=google-ai-overview-webhook.json
   n8n publish:workflow --id=reduckAiOverview
   ```

4. **Start n8n, then call the workflow** from another terminal. n8n reads published workflows
   only when it starts:

   ```bash
   n8n start
   ```

   ```bash
   curl "http://localhost:5678/webhook/ai-overview?q=best+crm+for+small+business"
   ```

   The answer is the run. `result` holds the overview's answer and the pages it cites, and `id`
   links to the run's steps and screenshots at `https://reduck.ai/runs/<id>`. If the run fails,
   the answer is `{ "error", "details" }`: what went wrong, and the link to the run.

### n8n editor

1. **Install the node**, then restart n8n:

   ```bash
   mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes && npm install @reduck-ai/n8n-nodes-reduck
   ```

   For Docker and other setups, see the
   [n8n guide](https://docs.n8n.io/integrations/community-nodes/installation/).

2. **Sign in.** Add a **Reduck** node to a workflow. In **Credential**, select **Connect to
   Reduck**, then **Connect**, and approve n8n on Reduck. If **Browser** then shows an error,
   close the node and open it again.

   ![The new Reduck OAuth2 API credential, with its Connect button](https://raw.githubusercontent.com/reduck-ai/n8n-nodes-reduck/main/images/quick-start-connect.png)

   To use an API key instead, create a **Reduck API** credential with a key from
   [API keys](https://reduck.ai/api-keys), and select it in **Credential**.

3. **Run a script.** In **Script**, search `ai overview` and select **Get Google AI Overview**.
   In **query**, type a search, for example `best crm for small business`. Then select
   **Execute step**. The script runs on your paired browser, and `result` holds the overview's
   answer and the pages it cites:

   ![The Reduck node after Execute step: the run succeeded, and result holds the overview's answer](https://raw.githubusercontent.com/reduck-ai/n8n-nodes-reduck/main/images/quick-start-run.png)

<!-- /tabs -->

## Node reference

The node has one operation, **Run script**: it runs a script and waits until the run ends.

- **Script**: the script to run. Select it from the list, or type its address
  (`handle/host/slug`, for example `reduck/google.com/get_ai_overview`).
- **Arguments**: one field for each input of the script. A file input names the binary property
  of the input item that holds the file.
- **Browser**: your paired browser (the default), one of your paired browsers by name, or a
  Reduck managed browser.
- **Region** and **Country**: for a managed browser only. **Region** is its datacenter.
  **Country** makes it connect from a home address in that country.
- **Simplify**: on by default. The node then returns `result` (the output of the script),
  `status`, `id`, `url` (the run's steps and screenshots), `script`, `started_at` and
  `finished_at`. Set it off to get all the fields of the run. In a node that you added before
  version 0.2.8 of this package, it is off.

## Examples

Import a workflow from [examples](https://github.com/reduck-ai/n8n-nodes-reduck/tree/main/examples)
(**Workflows > Import from File**), then select your Reduck credential in its Reduck node.

- [Book a Doctolib appointment](https://github.com/reduck-ai/n8n-nodes-reduck/blob/main/examples/doctolib-book-appointment.json):
  every hour, looks for a free slot with the doctors you list, inside your dates, weekdays and
  hours. It books the earliest slot that fits from your paired browser and emails you from your
  Gmail. When you already have an upcoming appointment with one of these doctors, it books
  nothing, so you always get one appointment. Before you activate it, fill in its **Config**
  node.
- [Does ChatGPT cite your brand?](https://github.com/reduck-ai/n8n-nodes-reduck/blob/main/examples/chatgpt-brand-visibility.json):
  every morning, asks ChatGPT your buyers' questions in the ChatGPT app and records whether the
  answer cites your site, names you, or cites others. The rows go to an n8n data table.
- [Google AI Overview, on a webhook](https://github.com/reduck-ai/n8n-nodes-reduck/blob/main/examples/google-ai-overview-webhook.json):
  answers `GET /webhook/ai-overview?q=<search>` with the AI Overview Google shows for that search,
  as JSON. The CLI [quick start](#quick-start) uses it.
- [Reddit replies, with a review page](https://github.com/reduck-ai/n8n-nodes-reduck/blob/main/examples/reddit-engage.json):
  every day, reads the new threads in your subreddits, keeps the threads where the author has
  the problem you solve, and drafts one reply for each person with Google Gemini. You read each
  draft next to its thread at `<your n8n>/form/reddit-review`, then approve, edit, reject or skip
  it. An approved reply goes on Reddit from your paired browser. Before you activate it, fill in
  its **Config** node and select a Google Gemini credential in its **Pre-screen** and **Decide and
  draft** nodes.

## n8n Cloud

n8n Cloud installs only the community nodes that n8n has verified, and this node is not
verified yet. On n8n Cloud, run your scripts with nodes that n8n has: a converter changes each
Reduck node of a workflow into two nodes.

- **`<name> request`**, an HTTP Request node, starts the run and waits for it.
- **`<name>`**, a Code node, gives the same item and the same errors as the Reduck node. It
  keeps the name, so the nodes after it do not change.

1. Download the workflow to a file (**Download** in the workflow menu), for example
   `workflow.json`.
2. Convert it:

   ```bash
   curl -sO https://raw.githubusercontent.com/reduck-ai/n8n-nodes-reduck/main/convert/convert.mjs
   node convert.mjs --to http < workflow.json > workflow-http.json
   ```

   The converter writes each node it converts, and each node it keeps with the reason.
3. Import `workflow-http.json` in n8n Cloud. In each HTTP Request node, select a credential:
   - For a node that used an API key: a **Header Auth** credential, with the name `X-API-Key`
     and your [API key](https://reduck.ai/api-keys) as the value.
   - For a node that used OAuth2: an **OAuth2 API** credential, with **Use Dynamic Client
     Registration** on and the server URL `https://reduck.ai`.

To go back to Reduck nodes, for example when n8n verifies this node, use `--to reduck`. A pair
that you edited after the conversion stays as it is.

Some nodes stay Reduck nodes, because an HTTP Request node cannot do what they do:

- A script or a browser that comes from an expression.
- A file input: n8n Cloud gives no file to an expression.
- A node that an AI agent uses as a tool.

A converted node also has these differences:

- A run that takes more than 55 seconds fails: reduck.ai closes a request after 60 seconds. The
  run continues, and the error gives its link. The Reduck node waits for the run until it ends.
- On the error output (**Continue (using error output)**), the item has the fields of the
  Reduck answer, not those of the item that came into the node.

## FAQ

<details>
<summary>Paired browser or managed browser?</summary>

|              | Paired browser                  | Managed browser                                |
| ------------ | ------------------------------- | ---------------------------------------------- |
| Volume       | Under ~100 script runs per hour | Deployment at scale                            |
| Cost         | Cheaper                         | More expensive                                 |
| Credentials  | Never leave your browser        | None: public pages only                        |
| Availability | Needs your browser open         | 24/7                                           |
| Network      | Your connection                 | Datacenter, or a home address per **Country**  |

If a site refuses the managed browser, set **Country**: the browser then connects from a home
address in that country, not from a datacenter.

</details>

<details>
<summary>What happens when a site signs me out?</summary>

The run fails and says that the browser is not signed in. Sign in to the site again in your
browser, and the next run works.

</details>

<details>
<summary>How do I handle a failed run in my workflow?</summary>

By default, a failed run stops the workflow. The node shows what went wrong and links to the
run's steps and screenshots. To continue, open the node's **Settings** and set **On Error**:

- **Continue**: the item goes on as `{ "error", "details" }`, where `error` says what went wrong
  and `details` links to the run.
- **Continue (using error output)**: the same item goes to a second output, so you can send
  failures to another branch, for example to alert you.

</details>

<details>
<summary>How much does it cost?</summary>

Reduck has a free plan. See [pricing](https://reduck.ai/pricing).

</details>