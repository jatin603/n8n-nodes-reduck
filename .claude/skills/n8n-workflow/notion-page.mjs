#!/usr/bin/env node
// Prints a public Notion page as Markdown, through the API notion.site pages load themselves from.
// The skills inject n8n's own pages with it, so they read n8n's current rules, never a copy.
// Usage: node notion-page.mjs <page id or notion.site url>
const arg = process.argv[2];
const hex = arg?.match(/[0-9a-f]{32}(?=[^0-9a-f]*$)/i)?.[0] ?? arg?.replace(/-/g, '');
if (!hex || hex.length !== 32) {
	console.error('Usage: node notion-page.mjs <page id or notion.site url>');
	process.exit(1);
}
const pageId = hex.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
const API = 'https://n8n.notion.site/api/v3';

const post = async (path, body) => {
	const r = await fetch(`${API}/${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (!r.ok) throw new Error(`Notion answered ${r.status} to ${path}`);
	return r.json();
};

// A record is wrapped once or twice depending on the endpoint.
const unwrap = (rec) => rec?.value?.value ?? rec?.value;
const blocks = {};
let cursor = { stack: [] };
for (let chunk = 0; chunk < 20; chunk++) {
	const page = await post('loadPageChunk', { pageId, limit: 100, cursor, chunkNumber: chunk, verticalColumns: false });
	for (const [id, rec] of Object.entries(page.recordMap?.block ?? {})) blocks[id] = unwrap(rec);
	cursor = page.cursor;
	if (!cursor?.stack?.length) break;
}
// The page's own blocks all come with it. A block it names but does not send belongs to another
// page (a link to it); counted, so a page that grows past what the chunks send is noticed.
const missing = [...new Set(Object.values(blocks).flatMap((b) => (b?.type === 'page' && b.id !== pageId ? [] : b?.content ?? [])))].filter((id) => !blocks[id]);

const text = (rich = []) =>
	rich
		.map(([s, marks = []]) => {
			let out = s;
			for (const [m, v] of marks) {
				if (m === 'b') out = `**${out}**`;
				if (m === 'i') out = `*${out}*`;
				if (m === 'c') out = `\`${out}\``;
				if (m === 'a') out = `[${out}](${v.startsWith('/') ? `https://n8n.notion.site${v}` : v})`;
				if (m === 'p') out = `[${blocks[v]?.properties?.title?.[0]?.[0] ?? 'page'}](https://n8n.notion.site/${v.replace(/-/g, '')})`;
			}
			return out;
		})
		.join('');

const lines = [];
const render = (id, depth, n) => {
	const b = blocks[id];
	if (!b || b.alive === false) return;
	const t = text(b.properties?.title);
	const pad = '  '.repeat(Math.max(0, depth));
	const kids = () => {
		let i = 0;
		for (const c of b.content ?? []) render(c, depth + 1, blocks[c]?.type === 'numbered_list' ? ++i : 0);
	};
	switch (b.type) {
		case 'header': lines.push('', `## ${t}`); break;
		case 'sub_header': lines.push('', `### ${t}`); break;
		case 'sub_sub_header': lines.push('', `#### ${t}`); break;
		case 'bulleted_list': lines.push(`${pad}- ${t}`); kids(); return;
		case 'numbered_list': lines.push(`${pad}${n}. ${t}`); kids(); return;
		case 'to_do': lines.push(`${pad}- [ ] ${t}`); kids(); return;
		case 'toggle': lines.push(`${pad}- ${t}`); kids(); return;
		case 'callout': lines.push('', `> ${b.format?.page_icon ?? ''} ${t}`.trim()); kids(); return;
		case 'quote': lines.push('', `> ${t}`); break;
		case 'code': lines.push('', '```', t, '```'); break;
		case 'divider': lines.push('', '---'); break;
		case 'page':
			if (id !== pageId) { lines.push(`${pad}- [${t}](https://n8n.notion.site/${id.replace(/-/g, '')})`); return; }
			lines.push(`# ${t}`, `Source: https://n8n.notion.site/${id.replace(/-/g, '')}`);
			break;
		case 'image': lines.push('', `![image](${b.format?.display_source ?? b.properties?.source?.[0]?.[0] ?? ''})`); break;
		case 'text': if (t) lines.push('', `${pad}${t}`); break;
		default: if (t) lines.push('', `${pad}${t}`);
	}
	kids();
};
render(pageId, -1, 0);
if (missing.length) lines.push('', `(${missing.length} blocks of this page were not sent by Notion: read the page itself.)`);
console.log(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
