import initSqlJs from 'sql.js';
import fs from 'fs';

const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync('data/dota2.db'));

const res = db.exec('SELECT name FROM sqlite_master WHERE type="table"');
console.log('Tables:', res[0].values.map(v => v[0]));

// Check matches count
const matchCount = db.exec('SELECT COUNT(*) FROM matches');
console.log('Matches:', matchCount[0]?.values[0][0] || 0);

// Check tournaments count
const tourneyCount = db.exec('SELECT COUNT(*) FROM tournaments');
console.log('Tournaments:', tourneyCount[0]?.values[0][0] || 0);
