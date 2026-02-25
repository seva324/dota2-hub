import initSqlJs from 'sql.js';
import fs from 'fs';

const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync('data/dota2.db'));

// Check matches table schema
const res = db.exec('PRAGMA table_info(matches)');
console.log('Matches columns:');
console.log(res[0].values.map(v => v[1]));

// Check tournaments table schema
const res2 = db.exec('PRAGMA table_info(tournaments)');
console.log('\nTournaments columns:');
console.log(res2[0].values.map(v => v[1]));
