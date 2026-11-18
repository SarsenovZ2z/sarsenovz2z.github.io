// Pulls the article list from anygroup.kz/llms.txt, reads each publish date from the
// article's JSON-LD and rewrites the list and the counter in index.html.
// Run: node scripts/sync-articles.mjs  (Node 18+)
import { readFile, writeFile } from "node:fs/promises";

const SITE = "https://anygroup.kz";
const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? "статья" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "статьи" : "статей");

async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": "sarsenovz2z.github.io article sync" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

const llms = await get(`${SITE}/llms.txt`);
const section = llms.split(/^## /m).find((part) => part.startsWith("Публикации"));
if (!section) throw new Error("llms.txt: no «Публикации» section");
const found = [...section.matchAll(/^- \[(.+?)\]\((https:\/\/anygroup\.kz\/publications\/[^)]+)\)/gm)].map((m, i) => ({ title: m[1], url: m[2], i }));
if (found.length < 5) throw new Error(`llms.txt: only ${found.length} articles, refusing to update`);

for (const a of found) {
  const html = await get(a.url);
  const date = html.match(/"datePublished":"(\d{4}-\d{2}-\d{2})/);
  if (!date) throw new Error(`${a.url}: no datePublished`);
  a.date = date[1];
}
found.sort((x, y) => y.date.localeCompare(x.date) || x.i - y.i);

const items = found.map((a) => {
  const [y, m, d] = a.date.split("-").map(Number);
  return `        <li><a href="${esc(a.url)}"><span class="t">${esc(a.title)}</span><time datetime="${a.date}">${d} ${months[m - 1]} ${y}</time></a></li>`;
}).join("\n");

let page = await readFile("index.html", "utf8");
const before = page;
page = page.replace(/(<!-- articles:start -->\n)[\s\S]*?(\s*<!-- articles:end -->)/, `$1${items}$2`);
page = page.replace(/<b data-count="\d+" data-articles>\d+<\/b>/, `<b data-count="${found.length}" data-articles>${found.length}</b>`);
page = page.replace(/(<span class="mono" data-articles-label>)[^<]*(<\/span>)/, `$1${plural(found.length)}$2`);

if (page === before) {
  console.log(`No changes (${found.length} articles).`);
} else {
  await writeFile("index.html", page);
  const sitemap = await readFile("sitemap.xml", "utf8");
  const today = new Date().toISOString().slice(0, 10);
  await writeFile("sitemap.xml", sitemap.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${today}</lastmod>`));
  console.log(`Updated: ${found.length} articles.`);
}
