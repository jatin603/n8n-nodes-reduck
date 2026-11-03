import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	sleep,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';

import { FILE_FIELD, PAIRED_BROWSER, getDevices, getScriptArgs, searchScripts, type Script } from './methods';
import { parseScriptAddress, reduckRequest, reduckUrl, scriptPath, type Run } from './transport';

const POLL_MS = 2000;
// Above the longest a run takes on Reduck: 16 minutes queued, then 15 held (the MCP's
// admission.ts). A run still open after it is one Reduck lost.
const MAX_WAIT_MINUTES = 32;
// The managed browser's budget, and 10 runs of 3 minutes on a 2-slot device still start inside the
// queue's 16-minute wait.
const BATCH = 10;

// One input item's run: its place in the output, its script, and where it runs.
interface ItemRun {
	i: number;
	script: IDataObject;
	target: IDataObject;
}

const AUTHENTICATIONS = [
	{ name: 'OAuth2', value: 'oAuth2' },
	{ name: 'API Key', value: 'apiKey' },
];

// The managed browser's own options. The API refuses them on a paired browser, so they show only
// while the managed browser is chosen. The regions are the API's (MANAGED_REGIONS in the MCP's
// browser.ts); it refuses any other and names the ones it has.
const REGION: INodeProperties = {
	displayName: 'Region',
	name: 'region',
	type: 'options',
	options: [
		{ name: 'Asia Pacific (Singapore)', value: 'ap-southeast-1' },
		{ name: 'Europe (Frankfurt)', value: 'eu-central-1' },
		{ name: 'US East', value: 'us-east-1' },
		{ name: 'US West', value: 'us-west-2' },
	],
	default: 'eu-central-1',
	description:
		'The datacenter of the managed browser: Europe (Frankfurt) by default. Choose the one nearest to the site.',
};
const COUNTRY: INodeProperties = {
	displayName: 'Country',
	name: 'country',
	type: 'string',
	default: '',
	placeholder: 'e.g. FR',
	description:
		'The ISO 3166 alpha-2 code of the country the managed browser connects to the site from, through a residential proxy. Use it for a site that changes by country. Leave it empty to connect from the datacenter.',
};

export class Reduck implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Reduck',
		name: 'reduck',
		icon: { light: 'file:reduck.svg', dark: 'file:reduck.dark.svg' },
		group: ['transform'],
		version: [1, 1.1, 1.2, 1.3, 1.4],
		subtitle: '={{$parameter["script"].value}}',
		description: 'Run Reduck browser scripts on any website',
		defaults: { name: 'Reduck' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'reduckApi',
				required: true,
				displayOptions: { show: { authentication: ['apiKey'] } },
			},
			{
				name: 'reduckOAuth2Api',
				required: true,
				displayOptions: { show: { authentication: ['oAuth2'] } },
			},
		],
		properties: [
			// n8n saves no parameter that equals its default, so a node saved with the default holds no
			// value here and reads whatever the default is now. Version 1 keeps API Key for those
			// nodes; a node added from 1.1 on starts with OAuth2. The versions are listed, not a
			// `_cnd`: n8n's credential window offers OAuth2 or API Key only from a literal list.
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: AUTHENTICATIONS,
				default: 'apiKey',
				displayOptions: { show: { '@version': [1] } },
			},
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: AUTHENTICATIONS,
				default: 'oAuth2',
				displayOptions: { show: { '@version': [1.1, 1.2, 1.3, 1.4] } },
			},
			// The one thing the node does. It names the action that the nodes panel and an AI agent show.
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Run',
						value: 'run',
						action: 'Run script',
						description: 'Run a browser script on a website',
					},
				],
				default: 'run',
			},
			{
				displayName: 'Script',
				name: 'script',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				description: 'The script to run',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select a script...',
						typeOptions: { searchListMethod: 'searchScripts', searchable: true },
					},
					{
						displayName: 'By Address',
						name: 'address',
						type: 'string',
						placeholder: 'e.g. reduck/google.com/get_ai_overview',
						hint: 'The owner handle, the site and the script, separated by slashes',
						validation: [
							{
								type: 'regex',
								properties: {
									regex: '^[^/\\s]+/[^/\\s]+/[^/\\s]+$',
									errorMessage: 'Use the form handle/host/slug',
								},
							},
						],
					},
				],
			},
			{
				displayName: 'Arguments',
				name: 'args',
				type: 'resourceMapper',
				noDataExpression: true,
				default: { mappingMode: 'defineBelow', value: null },
				required: true,
				typeOptions: {
					loadOptionsDependsOn: ['script.value'],
					resourceMapper: {
						resourceMapperMethod: 'getScriptArgs',
						mode: 'add',
						fieldWords: { singular: 'argument', plural: 'arguments' },
						addAllFields: true,
						supportAutoMap: false,
						allowEmptyValues: true,
						noFieldsError: 'This script takes no arguments',
						// A script's arguments change as it is improved: a saved node takes the new ones when
						// it is opened, with its values kept, as Refresh would do.
						refreshStaleSchemaOnOpen: true,
					},
				},
				displayOptions: { hide: { script: [''] } },
			},
			// Version 1 runs on the managed browser by default, which its saved nodes keep (see
			// Authentication). From 1.1 on, a node starts on the account's paired browser.
			{
				displayName: 'Browser Name or ID',
				name: 'deviceId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getDevices' },
				default: '',
				description:
					'Where the script runs: your paired browser (the Reduck extension), one of them by name when you have several, or a Reduck managed browser. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { '@version': [1] } },
			},
			{
				displayName: 'Browser Name or ID',
				name: 'deviceId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getDevices' },
				default: PAIRED_BROWSER,
				description:
					'Where the script runs: your paired browser (the Reduck extension), one of them by name when you have several, or a Reduck managed browser. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { '@version': [1.1, 1.2, 1.3] } },
			},
			{ ...REGION, displayOptions: { show: { deviceId: [''] } } },
			{ ...COUNTRY, displayOptions: { show: { deviceId: [''] } } },
			// From 1.4 on, the browser comes first, as the API's `browser`, then what fits it: the
			// device, or the managed browser's options. Up to 1.3, Browser Name or ID holds both, and
			// '' is the managed browser.
			{
				displayName: 'Browser',
				name: 'browser',
				type: 'options',
				options: [
					{
						name: 'Paired Browser',
						value: PAIRED_BROWSER,
						description: 'Your Chrome with the Reduck extension. Chrome must be open.',
					},
					{
						name: 'Managed Browser',
						value: 'managed',
						description: 'A browser that Reduck hosts. It runs without your computer.',
					},
				],
				default: PAIRED_BROWSER,
				description: 'Where the script runs',
				displayOptions: { show: { '@version': [1.4] } },
			},
			{
				displayName: 'Device Name or ID',
				name: 'deviceId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getDevices' },
				default: PAIRED_BROWSER,
				description:
					'The paired device to run on. Choose one by name when you have more than one. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { browser: [PAIRED_BROWSER] } },
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [REGION, COUNTRY],
				displayOptions: { show: { browser: ['managed'] } },
			},
			// Versions 1 and 1.1 return the whole run, which their saved nodes keep (see
			// Authentication). From 1.2 on, a node starts with the simplified item.
			{
				displayName: 'Simplify',
				name: 'simplify',
				type: 'boolean',
				default: false,
				description: 'Whether to return a simplified version of the response instead of the raw data',
				displayOptions: { show: { '@version': [{ _cnd: { lt: 1.2 } }] } },
			},
			{
				displayName: 'Simplify',
				name: 'simplify',
				type: 'boolean',
				default: true,
				description: 'Whether to return a simplified version of the response instead of the raw data',
				displayOptions: { show: { '@version': [{ _cnd: { gte: 1.2 } }] } },
			},
		],
	};

	methods = {
		listSearch: { searchScripts },
		resourceMapping: { getScriptArgs },
		loadOptions: { getDevices },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		// Below 1.3, each item runs alone and in order, which a saved workflow may rely on.
		const size = this.getNode().typeVersion >= 1.3 ? BATCH : 1;
		const items = this.getInputData();
		const out = new Array<INodeExecutionData>(items.length);

		const fail = (error: unknown, i: number) => {
			// This node's own errors already carry their message; anything else came from the API.
			const failure =
				error instanceof NodeOperationError || error instanceof NodeApiError
					? error
					: new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			if (!this.continueOnFail()) throw failure;
			// n8n's own shape for a failed item: { error, details } and nothing else is what sends it
			// down the error output ("Continue (using error output)"). Not `item.error`: n8n then
			// rewrites json to the message alone and the run's link in `details` is lost.
			out[i] = {
				json: { error: failure.message, ...(failure.description ? { details: failure.description } : {}) },
				pairedItem: { item: i },
			};
		};

		// One request has one browser target, and stays under the API's 4.5 MB: a file goes alone.
		const groups = new Map<string, ItemRun[]>();
		const loggedIn = new Map<string, Promise<boolean>>();
		for (let i = 0; i < items.length; i++) {
			try {
				const item = await itemRunOf(this, i, loggedIn);
				const key = size === 1 || item.script.files ? `item ${i}` : JSON.stringify(item.target);
				groups.set(key, [...(groups.get(key) ?? []), item]);
			} catch (error) {
				fail(error, i);
			}
		}

		for (const group of groups.values()) {
			for (let at = 0; at < group.length; at += size) {
				const slice = group.slice(at, at + size);
				let runs: Run[] = [];
				try {
					runs = await runBatch(this, slice);
				} catch (error) {
					slice.forEach(({ i }) => fail(error, i));
				}
				for (const [j, run] of runs.entries()) {
					const { i } = slice[j];
					try {
						const runUrl = `${await reduckUrl(this)}/runs/${run.id}`;
						if (run.result && 'error' in run.result) {
							// The message says what happened; the description, what to do about it.
							throw new NodeOperationError(this.getNode(), run.result.error, {
								itemIndex: i,
								description: [run.external_message, `The run's steps and screenshots: ${runUrl}`]
									.filter(Boolean)
									.join('\n'),
							});
						}
						const simplify = this.getNodeParameter('simplify', i, false) as boolean;
						out[i] = { json: simplify ? simplifyRun(run, runUrl) : toItem(run), pairedItem: { item: i } };
					} catch (error) {
						fail(error, i);
					}
				}
			}
		}
		return [out];
	}
}

// Starts the runs and reads them again until they end, or until MAX_WAIT_MINUTES. The run request
// holds for the API's default wait, under the 60 s after which VPNs and proxies drop a connection
// that carries no byte.
async function runBatch(ctx: IExecuteFunctions, items: ItemRun[]): Promise<Run[]> {
	const batch = await reduckRequest<{ batch_id: string; runs: Run[] }>(ctx, 'POST', '/api/runs', {
		body: { scripts: items.map((item) => item.script), ...items[0].target },
	});
	let { runs } = batch;
	const deadline = Date.now() + MAX_WAIT_MINUTES * 60_000;
	while (runs.some((run) => run.finished_at === null)) {
		if (Date.now() > deadline) {
			throw new NodeOperationError(ctx.getNode(), `The runs did not end in ${MAX_WAIT_MINUTES} minutes`, {
				description: `Their state on Reduck: ${await reduckUrl(ctx)}/runs`,
			});
		}
		await sleep(POLL_MS);
		({ data: runs } = await reduckRequest<{ data: Run[] }>(ctx, 'GET', '/api/runs', {
			qs: { batch_id: batch.batch_id, page_size: BATCH },
		}));
	}
	// An item finds its run by position.
	if (runs.length !== items.length) {
		throw new NodeOperationError(ctx.getNode(), `Asked for ${items.length} runs, and Reduck answered for ${runs.length}`);
	}
	return runs;
}

// `loggedIn` holds whether each script needs a sign-in, read once per execution.
async function itemRunOf(
	ctx: IExecuteFunctions,
	i: number,
	loggedIn: Map<string, Promise<boolean>>,
): Promise<ItemRun> {
	const address = ctx.getNodeParameter('script', i, '', { extractValue: true }) as string;
	const script = parseScriptAddress(address);
	if (!script) {
		throw new NodeOperationError(ctx.getNode(), `"${address}" is not a script address (handle/host/slug)`, {
			itemIndex: i,
		});
	}
	// The form sends every field, a blank one as null. A blank field is one the caller did not give:
	// left out, the script's schema fills in its default or refuses a required argument by name,
	// where null would be coerced to 0 or "" and pass.
	const form = (ctx.getNodeParameter('args', i, {}) as { value?: IDataObject | null }).value ?? {};
	const args: IDataObject = {};
	const files: IDataObject = {};
	for (const [key, value] of Object.entries(form)) {
		if (value === null || value === undefined || value === '') continue;
		if (!key.startsWith(FILE_FIELD)) {
			args[key] = value;
			continue;
		}
		const property = String(value);
		const { mimeType } = ctx.helpers.assertBinaryData(i, property);
		const bytes = await ctx.helpers.getBinaryDataBuffer(i, property);
		files[key.slice(FILE_FIELD.length)] = { b64: bytes.toString('base64'), mime: mimeType };
	}
	// '' is the managed browser, which from 1.4 on is chosen in Browser.
	const deviceId =
		ctx.getNodeParameter('browser', i, '') === 'managed'
			? ''
			: (ctx.getNodeParameter('deviceId', i, '') as string);
	// A managed browser has no sign-in yet, so a script that needs one fails there.
	if (!deviceId) {
		if (!loggedIn.has(address))
			loggedIn.set(
				address,
				reduckRequest<Script>(ctx, 'GET', scriptPath(script)).then((s) => !!s.current_version?.logged_in),
			);
		if (await loggedIn.get(address))
			throw new NodeOperationError(ctx.getNode(), 'Managed runs are not supported yet for scripts that require login', {
				itemIndex: i,
				description: 'Run it on a paired browser instead.',
			});
	}
	// From 1.4 on, in Options; up to 1.3, at the top level.
	const options = ctx.getNodeParameter('options', i, {}) as IDataObject;
	const region = String(options.region ?? ctx.getNodeParameter('region', i, ''));
	const country = String(options.country ?? ctx.getNodeParameter('country', i, '')).trim();

	return {
		i,
		script: { ...script, args, ...(Object.keys(files).length ? { files } : {}) },
		// A paired browser, or the managed one with its options: never a mix the API refuses.
		target:
			deviceId === PAIRED_BROWSER
				? { browser: PAIRED_BROWSER }
				: deviceId
					? { device_id: deviceId }
					: { ...(region ? { region } : {}), ...(country ? { country } : {}) },
	};
}

const scriptOutput = (run: Run): IDataObject | null =>
	run.result && 'result' in run.result ? (run.result.result as IDataObject) : null;

// The run, with the script's output as `result` (the API wraps it as { result }).
const toItem = (run: Run): IDataObject => ({ ...run, result: scriptOutput(run) });

// What a workflow or an AI agent reads of a run: its output first, then where to see it.
const simplifyRun = (run: Run, url: string): IDataObject => ({
	result: scriptOutput(run),
	status: run.status,
	id: run.id,
	url,
	script: run.script ? `${run.script.handle}/${run.script.host}/${run.script.slug}` : null,
	started_at: run.started_at,
	finished_at: run.finished_at,
});
