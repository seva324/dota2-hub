import initSqlJs from 'sql.js';
import fs from 'fs';

const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync('data/dota2.db'));
const r = db.exec('SELECT radiant_team_name, radiant_team_logo FROM matches WHERE radiant_team_name = "Aurora Gaming" LIMIT 1');
console.log(JSON.stringify(r[0]?.values));
