#!/usr/bin/env node
// Converts the Reduck nodes of an n8n workflow to nodes that n8n has without this package, and
// back. n8n Cloud installs only community nodes that n8n has verified: there, a workflow runs
// Reduck through an HTTP Request node.
//
// A Reduck node becomes two nodes. "<name> request", an HTTP Request node, starts the run and
// waits for it. "<name>", a Code node, gives the Reduck node's output: the same item, the same
// errors. The Code node keeps the name, so connections and $('<name>') expressions downstream do
// not change.
//
// Back to Reduck, a pair converts only if converting the result gives that pair again: a pair
// edited by hand stays as it is, and the report says why.
//
// What does not convert, and stays a Reduck node: a script or a browser given by an expression,
// a file input (n8n Cloud gives no file bytes to an expression), a node an AI agent uses as a tool.
//
// Usage: node convert/convert.mjs --to http|reduck [--url https://reduck.ai] [--credential <id>]
//        < workflow.json > converted.json
// The report goes to stderr. --credential selects the credential of each converted node.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REDUCK_TYPE = '@reduck-ai/n8n-nodes-reduck.reduck';
// The package's name in a node type; CUSTOM when n8n loads it from its custom folder (local
// development). n8n names the AI tool form of a node "<node>Tool".
const PACKAGES = ['@reduck-ai/n8n-nodes-reduck', 'CUSTOM'];
const HTTP_TYPE = 'n8n-nodes-base.httpRequest';
const CODE_TYPE = 'n8n-nodes-base.code';
// An API key, whatever the Reduck node used: n8n's own OAuth2 credential keeps dynamic client
// registration off, so it cannot register with Reduck.
const AUTH_TYPE = 'httpHeaderAuth';
const PAIRED_BROWSER = 'extension';
// How long the run request waits for the run (wait_seconds): the longest wait the API takes
// (RUN_WAIT_SECONDS.max in the app). A longer run fails here, where the Reduck node reads it again
// until it ends: a Code node cannot make a request with a credential.
const WAIT_SECONDS = 55;
// The two nodes sit on each side of where the Reduck node was.
const HALF_GAP = 100;
// What makes a node, apart from its settings (notes, onError, retryOnFail, ...).
const NODE_KEYS = ['id', 'name', 'type', 'typeVersion', 'position', 'parameters', 'credentials'];
// The settings that act on the request go to the HTTP Request node, the others to the Code node,
// which gives the output.
const REQUEST_SETTINGS = ['retryOnFail', 'maxTries', 'waitBetweenTries', 'executeOnce'];
const MARKER = '// @reduck-ai/n8n-nodes-reduck: the output of a Reduck node.';

const pick = (object, keep) =>
	Object.fromEntries(Object.entries(object).filter(([key]) => keep(key)));
const isSetting = (key) => !NODE_KEYS.includes(key);
const isRequestSetting = (key) => REQUEST_SETTINGS.includes(key);
const isExpression = (value) => typeof value === 'string' && value.startsWith('=');

// "reduck" for a Reduck node, "reduckTool" for one an AI agent uses, null for any other node.
function reduckKind(node) {
	const dot = node.type.lastIndexOf('.');
	return PACKAGES.includes(node.type.slice(0, dot)) ? node.type.slice(dot + 1) : null;
}

// The parameters the Reduck node runs with: each one as it is saved, or its default for the
// node's version (n8n saves no parameter that equals its default).
function reduckSettings(node) {
	const p = node.parameters ?? {};
	const v = node.typeVersion ?? 1;
	return {
		script: (typeof p.script === 'object' ? p.script?.value : p.script) ?? '',
		args: p.args?.value ?? {},
		deviceId: p.deviceId ?? (v >= 1.1 ? PAIRED_BROWSER : ''),
		region: p.region ?? 'eu-central-1',
		country: p.country ?? '',
		simplify: p.simplify ?? v >= 1.2,
	};
}

// Why the node cannot be an HTTP Request node, or null when it can.
function refusal(node, s) {
	if (reduckKind(node) !== 'reduck') return 'an AI agent uses it as a tool';
	if (isExpression(s.script)) return 'its script is given by an expression';
	if (s.script.split('/').length !== 3 || s.script.split('/').some((part) => !part.trim()))
		return `"${s.script}" is not a script address (handle/host/slug)`;
	if (isExpression(s.deviceId)) return 'its browser is given by an expression';
	const keys = Object.keys(s.args);
	if (keys.some((key) => key.startsWith('file:')))
		return 'it sends a file, and n8n Cloud gives no file bytes to an HTTP Request node';
	if (keys.some((key) => /[.[\]]/.test(key)))
		return 'an argument name has ".", "[" or "]", which the HTTP Request node reads as a path';
	return null;
}

// A value as the HTTP Request node sends it: a string as it is (an expression stays one), any
// other value as an expression, so that it keeps its type.
const toField = (value) => (typeof value === 'string' ? value : `={{ ${JSON.stringify(value)} }}`);

function fromField(value) {
	const literal = typeof value === 'string' && /^=\{\{ (.*) \}\}$/s.exec(value);
	if (!literal) return value;
	try {
		const parsed = JSON.parse(literal[1]);
		return typeof parsed === 'string' ? value : parsed;
	} catch {
		return value;
	}
}

// The body the Reduck node sends, as HTTP Request body fields. The node leaves out an empty
// argument: the script's schema then gives its default, or refuses it by name.
function bodyFields(s) {
	const fields = Object.entries(s.args)
		.filter(([, value]) => value !== null && value !== undefined && value !== '')
		.map(([key, value]) => ({ name: `args.${key}`, value: toField(value) }));
	if (s.deviceId === PAIRED_BROWSER) fields.push({ name: 'browser', value: PAIRED_BROWSER });
	else if (s.deviceId) fields.push({ name: 'device_id', value: s.deviceId });
	else {
		if (s.region) fields.push({ name: 'region', value: s.region });
		const country = isExpression(s.country) ? s.country : s.country.trim();
		if (country) fields.push({ name: 'country', value: country });
	}
	fields.push({ name: 'wait_seconds', value: toField(WAIT_SECONDS) });
	return fields;
}

const continues = (settings) =>
	settings.continueOnFail === true ||
	settings.onError === 'continueRegularOutput' ||
	settings.onError === 'continueErrorOutput';

// The Reduck node's execute(), after its request: the run as the item, or its failure. It runs
// once for each item, so each output item stays paired with its input item.
//
// A Code node cannot read its own On Error setting, so the code holds it: on a failure, the node
// that continues gives { error, details }, which n8n sends to the error output when there is
// one, and the node that stops throws the error alone, as the Reduck node's message; the run it
// names is in the HTTP Request node's output. A thrown error gets no stack, so that n8n shows its
// message whole, without a line number of this code.
//
// On the error output, n8n adds the fields of the node's input item to { error, details }: the
// fields of Reduck's answer here, where the Reduck node gives those of the workflow's own item.
const outputCode = (origin, simplify, continueOnFail) => `${MARKER}
// It reads the run that the HTTP Request node before it starts. Convert the two nodes back to a
// Reduck node to edit them: convert/convert.mjs in @reduck-ai/n8n-nodes-reduck.
const simplify = ${simplify};
const continueOnFail = ${continueOnFail};
const fail = (error, details) => {
  if (continueOnFail) return { json: { error, ...(details ? { details } : {}) } };
  const thrown = new Error(error);
  thrown.stack = 'Error: ' + thrown.message;
  throw thrown;
};
const run = $json;
if (run.id === undefined) {
  // No run: Reduck refused it ({ status, code, error }), or the request got no answer (a timeout,
  // a closed connection) and the HTTP Request node continued with its error.
  if (typeof run.error === 'string')
    return fail(run.error, run.status ? 'Request failed with status code ' + run.status : undefined);
  const failure = run.error ?? {};
  return fail(String(failure.message ?? 'Reduck gave no run.'), String(failure.stack ?? '').split('\\n')[0].replace(/^\\w*Error: /, ''));
}
const url = '${origin}/runs/' + run.id;
if (run.finished_at === null)
  return fail('The run did not end in ${WAIT_SECONDS} s, the most that one request waits. It continues.', "The run's steps and screenshots: " + url);
if (run.result && 'error' in run.result)
  return fail(run.result.error, [run.external_message, "The run's steps and screenshots: " + url].filter(Boolean).join('\\n'));
const output = run.result && 'result' in run.result ? run.result.result : null;
if (!simplify) return { json: { ...run, result: output } };
const script = run.script ? run.script.handle + '/' + run.script.host + '/' + run.script.slug : null;
return { json: { result: output, status: run.status, id: run.id, url, script, started_at: run.started_at, finished_at: run.finished_at } };
`;

// The HTTP Request node and the Code node that replace a Reduck node.
function toPair(node, origin, credential) {
	const s = reduckSettings(node);
	const [x, y] = node.position ?? [0, 0];
	const settings = pick(node, isSetting);
	const request = {
		id: randomUUID(),
		name: `${node.name} request`,
		type: HTTP_TYPE,
		typeVersion: 4.2,
		position: [x - HALF_GAP, y],
		parameters: {
			method: 'POST',
			url: `${origin}/api/scripts/${s.script.split('/').map(encodeURIComponent).join('/')}/runs`,
			authentication: 'genericCredentialType',
			genericAuthType: AUTH_TYPE,
			sendBody: true,
			bodyParameters: { parameters: bodyFields(s) },
			// Reduck's answer, a refusal too, goes to the Code node as it is, which fails the way the
			// Reduck node fails, with Reduck's own message.
			options: {
				response: { response: { neverError: true } },
				timeout: (WAIT_SECONDS + 10) * 1000,
			},
		},
		...(credential ? { credentials: { [AUTH_TYPE]: credential } } : {}),
		...pick(settings, isRequestSetting),
		...(settings.disabled ? { disabled: true } : {}),
		// A request with no answer goes on to the Code node too.
		onError: 'continueRegularOutput',
	};
	const output = {
		id: node.id,
		name: node.name,
		type: CODE_TYPE,
		typeVersion: 2,
		position: [x + HALF_GAP, y],
		parameters: {
			mode: 'runOnceForEachItem',
			jsCode: outputCode(origin, s.simplify, continues(settings)),
		},
		...pick(settings, (key) => !isRequestSetting(key)),
	};
	return [request, output];
}

// The parameters and the settings of a node, to compare. Where the nodes are and which credential
// they use are free to change.
const shape = (node) =>
	JSON.stringify(
		Object.entries(node)
			.filter(([key]) => !['id', 'credentials', 'position'].includes(key))
			.sort(([a], [b]) => a.localeCompare(b)),
	);

// The Reduck node, at its latest version, that the pair came from; null when converting that node
// again does not give the same pair: the pair was edited.
function fromPair(request, output, type, credential) {
	const match = /^(.*)\/api\/scripts\/([^/]+)\/([^/]+)\/([^/]+)\/runs$/.exec(
		request.parameters.url,
	);
	if (!match) return null;
	const fields = Object.fromEntries(
		request.parameters.bodyParameters.parameters.map((f) => [f.name, f.value]),
	);
	const args = Object.fromEntries(
		Object.entries(fields)
			.filter(([name]) => name.startsWith('args.'))
			.map(([name, value]) => [name.slice('args.'.length), fromField(value)]),
	);
	const deviceId = fields.browser ?? fields.device_id ?? '';
	const [x, y] = output.position;
	const node = {
		id: output.id,
		name: output.name,
		type,
		typeVersion: 1.2,
		position: [x - HALF_GAP, y],
		parameters: {
			authentication: 'apiKey',
			script: {
				__rl: true,
				mode: 'address',
				value: match.slice(2).map(decodeURIComponent).join('/'),
			},
			args: {
				mappingMode: 'defineBelow',
				value: args,
				matchingColumns: [],
				// The node reads the script's schema again when it opens.
				schema: Object.entries(args).map(([id, value]) => ({
					id,
					displayName: id,
					required: false,
					defaultMatch: false,
					display: true,
					type: typeof value === 'boolean' || typeof value === 'number' ? typeof value : 'string',
					canBeUsedToMatch: false,
				})),
			},
			deviceId,
			...(deviceId ? {} : { region: fields.region ?? '', country: fields.country ?? '' }),
			simplify: /^const simplify = true;$/m.test(output.parameters.jsCode),
		},
		...(credential ? { credentials: { reduckApi: credential } } : {}),
		...pick(request, isRequestSetting),
		...pick(output, isSetting),
	};
	const [again, againOutput] = toPair(node, match[1]);
	return shape(again) === shape(request) && shape(againOutput) === shape(output) ? node : null;
}

// Why the Code node and the node named "<its name> request" are not a pair, or null.
function pairProblem(output, request, connections) {
	if (!request) return `no node is named "${output.name} request"`;
	if (request.type !== HTTP_TYPE) return `"${request.name}" is not an HTTP Request node`;
	const into = connections[request.name]?.main;
	if (into?.length !== 1 || into[0]?.length !== 1 || into[0][0].node !== output.name)
		return `"${request.name}" does not connect to it alone`;
	return null;
}

// Renames a node in the connections: what goes to `from` goes to `to`.
function retarget(connections, from, to) {
	for (const outputs of Object.values(connections))
		for (const branches of Object.values(outputs))
			for (const branch of branches ?? [])
				for (const link of branch ?? []) if (link.node === from) link.node = to;
}

export function toHttp(workflow, { url = 'https://reduck.ai', credential } = {}) {
	const out = structuredClone(workflow);
	const origin = url.replace(/\/+$/, '');
	const report = { converted: [], kept: [] };
	const names = new Set(out.nodes.map((node) => node.name));
	out.nodes = out.nodes.flatMap((node) => {
		if (!reduckKind(node)) return [node];
		const reason =
			refusal(node, reduckSettings(node)) ??
			(names.has(`${node.name} request`) ? `a node is named "${node.name} request" already` : null);
		if (reason) {
			report.kept.push({ name: node.name, reason });
			return [node];
		}
		const [request, output] = toPair(node, origin, credential);
		retarget(out.connections, node.name, request.name);
		out.connections[request.name] = { main: [[{ node: output.name, type: 'main', index: 0 }]] };
		report.converted.push(node.name);
		return [request, output];
	});
	return { workflow: out, report };
}

export function toReduck(workflow, { type = REDUCK_TYPE, credential } = {}) {
	const out = structuredClone(workflow);
	const report = { converted: [], kept: [] };
	const byName = new Map(out.nodes.map((node) => [node.name, node]));
	// The Reduck node of each converted pair, by the name of its request node.
	const reduckNodes = new Map();
	for (const output of out.nodes) {
		if (output.type !== CODE_TYPE || !output.parameters?.jsCode?.startsWith(MARKER)) continue;
		const request = byName.get(`${output.name} request`);
		const problem = pairProblem(output, request, out.connections);
		const node = problem ? null : fromPair(request, output, type, credential);
		if (!node) {
			report.kept.push({
				name: output.name,
				reason: problem ?? 'the two nodes were edited after the conversion',
			});
			continue;
		}
		reduckNodes.set(request.name, node);
		report.converted.push(output.name);
	}
	const converted = new Set(report.converted);
	out.nodes = out.nodes.flatMap((node) =>
		reduckNodes.has(node.name)
			? []
			: [converted.has(node.name) ? reduckNodes.get(`${node.name} request`) : node],
	);
	for (const [request, node] of reduckNodes) {
		delete out.connections[request];
		retarget(out.connections, request, node.name);
	}
	return { workflow: out, report };
}

function main(argv) {
	const option = (flag) => {
		const i = argv.indexOf(flag);
		return i === -1 ? undefined : argv[i + 1];
	};
	const to = option('--to');
	if (to !== 'http' && to !== 'reduck') {
		process.stderr.write(
			'Usage: node convert/convert.mjs --to http|reduck [--url <Reduck URL>] [--credential <id>] < workflow.json\n',
		);
		process.exit(2);
	}
	const id = option('--credential');
	const credential = id ? { id, name: id } : undefined;
	const workflow = JSON.parse(readFileSync(0, 'utf8'));
	const { workflow: converted, report } =
		to === 'http'
			? toHttp(workflow, { url: option('--url'), credential })
			: toReduck(workflow, { credential });
	for (const name of report.converted) process.stderr.write(`converted: ${name}\n`);
	for (const { name, reason } of report.kept) process.stderr.write(`kept: ${name}: ${reason}\n`);
	process.stdout.write(`${JSON.stringify(converted, null, '\t')}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
