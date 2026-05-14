import { execSync } from 'child_process';
const prompt = 'Compare these two screenshots for visual QA. First is production second is prototype. Output JSON with score(0-100)';
const prod = 'scripts/visual-qa/artifacts/round0/match-detail.desktop.png';
const proto = 'Prototype/Desktop Match detail.png';
const out = 'scripts/visual-qa/artifacts/round0/qa-r1-md.json';
const cmd = `echo ${prompt} | codex exec -i "${prod}" -i "${proto}" --output-last-message "${out}" -`;
console.log('Running QA...');
const r = execSync(cmd, { cwd: process.cwd(), timeout: 120000, encoding: 'utf8', shell: true, maxBuffer: 1024 * 1024 });
console.log(r.slice(0, 500));
