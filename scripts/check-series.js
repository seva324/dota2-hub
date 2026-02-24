import fs from 'fs';

const t = JSON.parse(fs.readFileSync('./public/data/tournaments.json', 'utf-8'));

// Find series with multiple games
const multiGameSeries = t.seriesByTournament['dreamleague-s28'].filter(s => s.games.length > 1);

console.log('Series with multiple games in dreamleague-s28:');
console.log('Total:', multiGameSeries.length);

if (multiGameSeries.length > 0) {
  console.log('\nSample multi-game series:');
  multiGameSeries.slice(0, 3).forEach(s => {
    console.log('Series:', s.series_id);
    console.log('  Games:', s.games.length);
    console.log('  Radiant:', s.radiant_team_name);
    console.log('  Dire:', s.dire_team_name);
    console.log('');
  });
}
