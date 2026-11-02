import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { REDUCK_TYPE, toHttp, toReduck } from './convert.mjs';

const examples = new URL('../examples/', import.meta.url);
const workflows = readdirSync(examples)
	.filter((file) => file.endsWith('.json'))
	.map((file) => [file, JSON.parse(readFileSync(new URL(file, examples), 'utf8'))]);

// What a Reduck node does, whatever its version: the same for a node and its round trip.
function behavior(node) {
	const p = node.parameters;
	const v = node.typeVersion;
	const deviceId = p.deviceId ?? (v >= 1.1 ? 'extension' : '');
	const args = Object.fromEntries(
		Object.entries(p.args?.value ?? {}).filter(([, value]) => value !== null && value !== ''),
	);
	return {
		name: node.name,
		authentication: p.authentication ?? (v >= 1.1 ? 'oAuth2' : 'apiKey'),
		script: p.script.value,
		args,
		deviceId,
		...(deviceId ? {} : { region: p.region ?? 'eu-central-1', country: (p.country ?? '').trim() }),
		simplify: p.simplify ?? v >= 1.2,
		onError: node.onError,
		notes: node.notes,
	};
}

const reduckNodes = (workflow) => workflow.nodes.filter((node) => node.type === REDUCK_TYPE);

for (const [file, workflow] of workflows) {
	test(`${file}: every Reduck node converts, and converts back to what it was`, () => {
		const http = toHttp(workflow);
		assert.deepEqual(http.report.kept, []);
		assert.equal(http.report.converted.length, reduckNodes(workflow).length);
		assert.equal(reduckNodes(http.workflow).length, 0);

		const back = toReduck(http.workflow);
		assert.deepEqual(back.report.kept, []);
		assert.deepEqual(back.report.converted.sort(), [...http.report.converted].sort());
		assert.deepEqual(back.workflow.connections, workflow.connections);
		assert.deepEqual(
			back.workflow.nodes.map((node) => node.name),
			workflow.nodes.map((node) => node.name),
		);
		assert.deepEqual(reduckNodes(back.workflow).map(behavior), reduckNodes(workflow).map(behavior));
		for (const node of reduckNodes(back.workflow)) {
			const original = workflow.nodes.find((n) => n.name === node.name);
			assert.equal(node.id, original.id);
			assert.deepEqual(node.position, original.position);
		}
	});

	test(`${file}: converting twice changes nothing more`, () => {
		const once = toHttp(workflow).workflow;
		const twice = toHttp(once);
		assert.deepEqual(twice.report.converted, []);
		assert.deepEqual(toReduck(workflow).report.converted, []);
	});
}

const node = (parameters, extra = {}) => ({
	id: 'n1',
	name: 'Run',
	type: REDUCK_TYPE,
	typeVersion: 1.2,
	position: [0, 0],
	parameters: {
		script: { __rl: true, mode: 'address', value: 'reduck/example.com/ping' },
		...parameters,
	},
	...extra,
});
const workflowOf = (...nodes) => ({ nodes, connections: {} });
const fields = (workflow) =>
	Object.fromEntries(
		workflow.nodes
			.find((n) => n.type === 'n8n-nodes-base.httpRequest')
			.parameters.bodyParameters.parameters.map((f) => [f.name, f.value]),
	);

test('the body is the one the Reduck node sends', () => {
	const paired = toHttp(
		workflowOf(
			node({ args: { value: { q: '={{ $json.q }}', n: 5, all: true, empty: '', none: null } } }),
		),
	).workflow;
	assert.deepEqual(fields(paired), {
		'args.q': '={{ $json.q }}',
		'args.n': '={{ 5 }}',
		'args.all': '={{ true }}',
		browser: 'extension',
		wait_seconds: '={{ 55 }}',
	});
	const managed = toHttp(workflowOf(node({ deviceId: '', country: ' FR ' }))).workflow;
	assert.deepEqual(fields(managed), {
		region: 'eu-central-1',
		country: 'FR',
		wait_seconds: '={{ 55 }}',
	});
	const device = toHttp(
		workflowOf(node({ deviceId: '3f1c0b1e-0000-4000-8000-000000000000' })),
	).workflow;
	assert.deepEqual(fields(device), {
		device_id: '3f1c0b1e-0000-4000-8000-000000000000',
		wait_seconds: '={{ 55 }}',
	});
});

test('a version 1 node keeps the defaults of version 1', () => {
	const { workflow } = toHttp(workflowOf({ ...node({}), typeVersion: 1 }));
	const request = workflow.nodes[0];
	assert.equal(request.parameters.genericAuthType, 'httpHeaderAuth');
	assert.deepEqual(fields(workflow), { region: 'eu-central-1', wait_seconds: '={{ 55 }}' });
	assert.match(workflow.nodes[1].parameters.jsCode, /^const simplify = false;$/m);
});

test('what an HTTP Request node cannot do stays a Reduck node, with the reason', () => {
	const cases = [
		[node({ script: { __rl: true, mode: 'address', value: '={{ $json.script }}' } }), /expression/],
		[node({ deviceId: '={{ $json.device }}' }), /browser is given by an expression/],
		[node({ args: { value: { 'file:upload': 'data' } } }), /file/],
		[node({ args: { value: { 'a.b': 1 } } }), /path/],
		[
			node({ script: { __rl: true, mode: 'list', value: 'reduck/example.com' } }),
			/not a script address/,
		],
	];
	for (const [reduck, reason] of cases) {
		const { workflow, report } = toHttp(workflowOf(reduck));
		assert.deepEqual(workflow.nodes, [reduck]);
		assert.match(report.kept[0].reason, reason);
	}
	const tool = {
		...workflowOf(node({})),
		connections: { Run: { ai_tool: [[{ node: 'Agent', type: 'ai_tool', index: 0 }]] } },
	};
	assert.match(toHttp(tool).report.kept[0].reason, /AI tool/);
});

test('a pair edited by hand stays as it is', () => {
	const { workflow } = toHttp(workflowOf(node({ args: { value: { q: 'x' } } })));
	const editedBody = structuredClone(workflow);
	editedBody.nodes[0].parameters.bodyParameters.parameters.push({ name: 'version_id', value: 'v' });
	const editedCode = structuredClone(workflow);
	editedCode.nodes[1].parameters.jsCode += '\n// mine';
	for (const edited of [editedBody, editedCode]) {
		const { workflow: back, report } = toReduck(edited);
		assert.deepEqual(back, edited);
		assert.match(report.kept[0].reason, /edited/);
	}
	const moved = structuredClone(workflow);
	moved.nodes[0].position = [500, 500];
	assert.deepEqual(toReduck(moved).report.converted, ['Run']);
});

// The Code node of a converted node, as n8n runs it once for each item.
const outputOf = (reduck) => {
	const code = toHttp(workflowOf(reduck)).workflow.nodes[1].parameters.jsCode;
	return (answer) => new Function('$json', code)(answer);
};
const run = {
	id: 'r1',
	status: 'success',
	result: { result: { title: 'Example Domain' } },
	started_at: 's',
	finished_at: 'f',
	external_message: null,
	script: { handle: 'reduck', host: 'example.com', slug: 'ping' },
	browser: { type: 'managed' },
};
const failed = {
	...run,
	status: 'error',
	result: { error: 'The browser is not signed in.' },
	external_message: 'Sign in to the site again.',
};
// Reduck's answers when it refuses a run.
const refused = { status: 400, code: 'invalid_request', error: 'seconds must be number' };
const limited = { status: 429, code: 'too_many_requests', error: 'Too many requests' };
// What the HTTP Request node gives when it continues after a request with no answer.
const hungUp = {
	error: {
		message: 'socket hang up',
		name: 'Error',
		stack: 'Error: socket hang up\n    at TLSSocket',
	},
};

test('the Code node gives the item the Reduck node gives', () => {
	assert.deepEqual(outputOf(node({}))(run), {
		json: {
			result: { title: 'Example Domain' },
			status: 'success',
			id: 'r1',
			url: 'https://reduck.ai/runs/r1',
			script: 'reduck/example.com/ping',
			started_at: 's',
			finished_at: 'f',
		},
	});
	assert.deepEqual(outputOf(node({ simplify: false }))(run), {
		json: { ...run, result: { title: 'Example Domain' } },
	});
	assert.deepEqual(outputOf(node({}))({ ...run, result: null }).json.result, null);
});

test('the Code node fails the way the Reduck node fails', () => {
	const continued = outputOf(node({}, { onError: 'continueErrorOutput' }));
	assert.deepEqual(continued(failed), {
		json: {
			error: 'The browser is not signed in.',
			details:
				"Sign in to the site again.\nThe run's steps and screenshots: https://reduck.ai/runs/r1",
		},
	});
	assert.deepEqual(continued(refused), {
		json: { error: 'seconds must be number', details: 'Request failed with status code 400' },
	});
	assert.deepEqual(continued(limited), {
		json: { error: 'Too many requests', details: 'Request failed with status code 429' },
	});
	assert.deepEqual(continued(hungUp), {
		json: { error: 'socket hang up', details: 'socket hang up' },
	});
	assert.match(continued({ ...run, finished_at: null }).json.error, /did not end in 55 s/);
	assert.deepEqual(
		outputOf(node({}, { continueOnFail: true }))(refused).json.error,
		'seconds must be number',
	);

	const stops = outputOf(node({}));
	assert.throws(() => stops(failed), { message: 'The browser is not signed in.' });
	assert.throws(() => stops(refused), { message: 'seconds must be number' });
	assert.throws(() => stops({ error: { message: 'timeout of 65000ms exceeded' } }), {
		message: 'timeout of 65000ms exceeded',
	});
});

test('settings go where they act, and a URL and a credential carry over', () => {
	const { workflow } = toHttp(
		workflowOf(
			node({}, { onError: 'continueErrorOutput', retryOnFail: true, maxTries: 3, notes: 'n' }),
		),
		{ url: 'http://localhost:5173/', credential: { id: 'c1', name: 'Reduck key' } },
	);
	const [request, output] = workflow.nodes;
	assert.equal(
		request.parameters.url,
		'http://localhost:5173/api/scripts/reduck/example.com/ping/runs',
	);
	assert.deepEqual(request.credentials, { oAuth2Api: { id: 'c1', name: 'Reduck key' } });
	assert.equal(request.onError, 'continueRegularOutput');
	assert.equal(request.retryOnFail, true);
	assert.equal(request.maxTries, 3);
	assert.equal(output.onError, 'continueErrorOutput');
	assert.equal(output.notes, 'n');
	assert.equal(output.retryOnFail, undefined);
	assert.match(output.parameters.jsCode, /'http:\/\/localhost:5173\/runs\/'/);
	const back = toReduck(workflow, { credential: { id: 'c2', name: 'k' } }).workflow.nodes[0];
	assert.deepEqual(back.credentials, { reduckOAuth2Api: { id: 'c2', name: 'k' } });
	assert.equal(back.onError, 'continueErrorOutput');
	assert.equal(back.maxTries, 3);
});
