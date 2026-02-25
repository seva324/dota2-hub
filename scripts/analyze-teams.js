import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const TEAM_IDS = [
  9467224, 2163, 9338413, 9247354, 8255888, 9572001, 8261500, 8291895,
  2586976, 8254145, 36, 9964962, 7119388, 67, 9823272, 9351740, 9303484,
  9828897, 726228, 9885310, 9579337, 10007878, 10008067, 9885928, 9885315,
  9886289, 9444076, 9894442, 10014579, 9895695, 10014586, 10014526, 10008012,
  9895392, 9255039, 7554697, 9691969, 9872667, 9989179, 9640842, 9247798, 9758040
];

async function fetchTeamName(id) {
  try {
    const res = await fetch(`https://api.opendota.com/api/teams/${id}`);
    if (!res.ok) return `ERROR ${res.status}`;
    const data = await res.json();
    return data.name || 'UNKNOWN';
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

async function main() {
  console.log('Fetching team names from OpenDota API...\n');
  const results = [];
  
  for (const id of TEAM_IDS) {
    const name = await fetchTeamName(id);
    results.push({ id, name });
    console.log(`${id} -> ${name}`);
  }
  
  console.log('\n=== Current KNOWN_TEAMS mapping ===');
  const known = require('./scripts/fetch-real-data.js').KNOWN_TEAMS;
  
  console.log('\n=== Comparison ===');
  console.log('ID       | OpenDota API        | Current Mapping');
  console.log('---------|---------------------|----------------------');
  for (const r of results) {
    const current = known[String(r.id)]?.name || 'NOT IN MAPPING';
    const match = current === r.name ? '' : ' <-- MISMATCH';
    console.log(`${r.id} | ${r.name.padEnd(19)} | ${current}${match}`);
  }
}

main();
