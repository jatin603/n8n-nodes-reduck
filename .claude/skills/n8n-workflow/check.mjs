#!/usr/bin/env node
// Static checks of an example workflow: what a script can verify of the skill's rules and of n8n's
// pages. Prints one line per problem and exits 1 when there is one.
// Usage: node check.mjs <workflow.json> [more.json ...]
import { readFileSync } from 'node:fs';
import { pageMarkdown } from './notion-page.mjs';

const REDUCK = '@reduck-ai/n8n-nodes-reduck.reduck';

// Each rule is read from where it is decided, never copied here: a copy goes stale silently, a
// rule that can no longer be read stops the check and says where to look.
const source = (what, where) => {
	throw new Error(`Could not read ${what} from ${where}: it changed. Update check.mjs to read it again.`);
};
// The latest node version: the node's own description.
const nodeTs = readFileSync(new URL('../../../nodes/Reduck/Reduck.node.ts', import.meta.url), 'utf8');
const versions = nodeTs.match(/version:\s*\[([^\]]+)\]/)?.[1].split(',').map(Number) ?? source('the node versions', 'Reduck.node.ts');
const LATEST = Math.max(...versions);
// The notes: n8n's "Add sticky notes to templates" page.
const STICKY = '2aa5b6e0c94f8058b0aefddd02655887';
const sticky = await pageMarkdown(STICKY);
const where = `https://n8n.notion.site/${STICKY}`;
const NUMBERS = { two: 2, three: 3, four: 4, five: 5, six: 6 };
const OVERVIEW_WORDS = sticky.match(/from (\d+) to (\d+) words/)?.slice(1).map(Number) ?? source('the overview length', where);
const HEADINGS = [...sticky.matchAll(/^- `(###[^`]+)`: (?!Optionally)/gm)].map((m) => m[1]);
if (!HEADINGS.length) source('the overview headings', where);
const SECTION_WORDS = Number(sticky.match(/note under (\d+) words/)?.[1] ?? source('the section note length', where));
const SECTION_FROM = NUMBERS[sticky.match(/with (\w+) or more nodes/)?.[1]] ?? source('when section notes are needed', where);
// Values of our own accounts and market that must not ship.
const OURS = /reduck\.ai\/runs|daniel@|conception\.dev|\b(mcp|n8n)\s*,\s*(mcp|n8n)\b/i;

let failed = false;
for (const file of process.argv.slice(2)) {
	const problems = [];
	const say = (where, what) => problems.push(`${where}: ${what}`);
	const w = JSON.parse(readFileSync(file, 'utf8'));
	const nodes = w.nodes ?? [];
	const names = new Set(nodes.map((n) => n.name));
	const text = JSON.stringify(w);

	if (names.size !== nodes.length) say('nodes', 'two nodes share a name');
	for (const [, name] of text.matchAll(/\$\(\\?['"]([^'"\\]+)\\?['"]\)/g))
		if (!names.has(name)) say(`$('${name}')`, 'names no node');
	for (const [from, outs] of Object.entries(w.connections ?? {})) {
		if (!names.has(from)) say(`connections.${from}`, 'names no node');
		for (const c of Object.values(outs).flat(2)) if (c && !names.has(c.node)) say(`connections.${from}`, `goes to "${c.node}", no such node`);
	}
	if (w.pinData && Object.keys(w.pinData).length) say('pinData', 'remove it');
	if (text.includes('—')) say('text', `${text.split('—').length - 1} em-dashes`);
	if (OURS.test(text)) say('text', `a value of ours: ${text.match(OURS)[0]}`);

	const notes = nodes.filter((n) => n.type === 'n8n-nodes-base.stickyNote');
	const work = nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote');
	const words = (n) => (n.parameters.content ?? '').split(/\s+/).filter(Boolean).length;
	const overview = notes.filter((n) => (n.parameters.color ?? 1) === 1);
	if (overview.length !== 1) say('notes', `${overview.length} yellow overview notes, n8n asks for one`);
	for (const n of overview) {
		const c = n.parameters.content ?? '';
		for (const h of HEADINGS) if (!c.includes(h)) say(n.name, `no "${h}" heading`);
		const count = words(n);
		if (count < OVERVIEW_WORDS[0] || count > OVERVIEW_WORDS[1]) say(n.name, `${count} words, n8n asks ${OVERVIEW_WORDS.join(' to ')}`);
		for (const must of ['@reduck-ai/n8n-nodes-reduck', 'self-hosted'])
			if (!c.includes(must)) say(n.name, `does not say "${must}"`);
	}
	const sections = notes.filter((n) => !overview.includes(n));
	if (work.length >= SECTION_FROM && !sections.length) say('notes', `${work.length} nodes and no section note`);
	for (const n of sections) if (words(n) >= SECTION_WORDS) say(n.name, `${words(n)} words, a section note stays under ${SECTION_WORDS}`);

	if (!names.has('Config')) say('Config', 'no node named Config');
	for (const n of work) {
		if (/^(Code|Set|HTTP Request|Edit Fields|If|Merge|Reduck)\d*$/.test(n.name)) say(n.name, 'a default name: say what the node does');
		if (/form/i.test(n.type) && !n.webhookId) say(n.name, 'no webhookId: the form does not load after an import');
		if (n.type !== REDUCK) continue;
		const p = n.parameters;
		if (n.typeVersion !== LATEST) say(n.name, `typeVersion ${n.typeVersion}, latest is ${LATEST}`);
		if (JSON.stringify(n.credentials ?? null) !== '{}') say(n.name, 'credentials must be {}');
		if (p.script?.mode !== 'address') say(n.name, 'script not in By Address mode');
		if (p.deviceId === undefined) say(n.name, 'no browser set');
		if (p.simplify !== true) say(n.name, 'simplify is not true');
		if (!n.notes) say(n.name, 'no node note saying where it runs');
	}

	console.log(`${file}: ${problems.length ? `${problems.length} problems` : 'OK'}`);
	for (const p of problems) console.log(`  - ${p}`);
	if (problems.length) failed = true;
}
process.exit(failed ? 1 : 0);
