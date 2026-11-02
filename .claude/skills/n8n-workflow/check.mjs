#!/usr/bin/env node
// Static checks of an example workflow: what a script can verify of the skill's rules and of n8n's
// pages. Prints one line per problem and exits 1 when there is one.
// Usage: node check.mjs <workflow.json> [more.json ...]
import { readFileSync } from 'node:fs';

const REDUCK = '@reduck-ai/n8n-nodes-reduck.reduck';
const LATEST = 1.2;
// n8n's "Add sticky notes to templates": the overview note's headings and length, a section note's
// length. Re-read that page when it changes (the skill loads it).
const HEADINGS = ['### How it works', '### Setup'];
const OVERVIEW_WORDS = [100, 300];
const SECTION_WORDS = 50;
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
	if (work.length >= 4 && !sections.length) say('notes', `${work.length} nodes and no section note`);
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
