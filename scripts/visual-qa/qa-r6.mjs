import { execSync } from 'child_process';
const prompt = 'Compare these two screenshots for visual QA. First is local build with updated design tokens. Second is prototype. Compare layout spacing fonts colors radius shadows hierarchy. Ignore dynamic content. Output JSON score(0-100) top_3_fixes.';
const prod = 'scripts/visual-qa/artifacts/local/match-detail.local.png';
const proto = 'Prototype/Desktop Match detail.png';
const out = 'scripts/visual-qa/artifacts/local/qa-r6b.json';
const cmd = `echo ${prompt} | codex exec -i "${prod}" -i "${proto}" --output-last-message "${out}" -`;
console.log('Running...');
const r = execSync(cmd, { cwd: process.cwd(), timeout: 120000, encoding: 'utf8', shell: true, maxBuffer: 1024 * 1024 });
console.log(r.slice(0, 600));
