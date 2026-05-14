import { execSync } from 'child_process';
import fs from 'fs';

const pairs = [
  { prod: 'scripts/visual-qa/artifacts/round0/match-detail.desktop.png', proto: 'Prototype/Desktop Match detail.png', out: 'scripts/visual-qa/artifacts/round0/qa-md-desktop.json' },
  { prod: 'scripts/visual-qa/artifacts/round0/team-flyout.desktop.png', proto: 'Prototype/Desktop Team Flyout.png', out: 'scripts/visual-qa/artifacts/round0/qa-tf-desktop.json' },
  { prod: 'scripts/visual-qa/artifacts/round0/team-flyout.mobile.png', proto: 'Prototype/Mobile Team Flyout.png', out: 'scripts/visual-qa/artifacts/round0/qa-tf-mobile.json' },
  { prod: 'scripts/visual-qa/artifacts/round0/player-profile-flyout.desktop.png', proto: 'Prototype/Desktop Player Profile.png', out: 'scripts/visual-qa/artifacts/round0/qa-pp-desktop.json' },
  { prod: 'scripts/visual-qa/artifacts/round0/player-profile-flyout.mobile.png', proto: 'Prototype/Mobile Player Profile.png', out: 'scripts/visual-qa/artifacts/round0/qa-pp-mobile.json' },
];

for (const p of pairs) {
  console.log(`QA: ${p.proto}`);
  const prompt = 'Compare these two screenshots for visual QA. First is production second is prototype. Compare layout spacing fonts colors border-radius shadows image sizing info hierarchy. Ignore dynamic content differences. Output JSON: score(0-100) differences(array) top_3_fixes(array) pass_90_threshold(bool)';

  try {
    const cmd = `echo ${prompt} | codex exec -i "${p.prod}" -i "${p.proto}" --output-last-message "${p.out}" -`;
    const stdout = execSync(cmd, { cwd: process.cwd(), timeout: 120000, maxBuffer: 1024 * 1024, encoding: 'utf8', shell: true });
    console.log(stdout.slice(0, 500));
    if (fs.existsSync(p.out)) {
      console.log(`  Output: ${fs.readFileSync(p.out, 'utf8').slice(0, 300)}`);
    }
  } catch (e) {
    console.error(`  Error: ${e.message}`);
  }
  console.log('---');
}
