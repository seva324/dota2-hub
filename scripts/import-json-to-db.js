import initSqlJs from 'sql.js';
import fs from 'fs';

const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync('data/dota2.db'));

// Read matches from JSON
const matches = JSON.parse(fs.readFileSync('public/data/matches.json', 'utf-8'));
console.log(`Loading ${matches.length} matches from JSON...`);

// Insert matches
for (const m of matches) {
  db.run(`INSERT INTO matches (match_id, radiant_team_id, dire_team_id, radiant_team_name, radiant_team_name_cn, dire_team_name, dire_team_name_cn, radiant_score, dire_score, radiant_game_wins, dire_game_wins, start_time, duration, series_type, league_id, status, lobby_type, radiant_win)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [m.match_id, m.radiant_team_id, m.dire_team_id, m.radiant_team_name, m.radiant_team_name_cn, m.dire_team_name, m.dire_team_name_cn, m.radiant_score, m.dire_score, m.radiant_game_wins, m.dire_game_wins, m.start_time, m.duration, m.series_type || 2, m.leagueid, m.status, m.lobby_type || 0, m.radiant_win]
  );
}
console.log(`Inserted ${matches.length} matches`);

// Read tournaments from JSON
const tournamentsData = JSON.parse(fs.readFileSync('public/data/tournaments.json', 'utf-8'));

// The format is { "tournaments": [], "seriesByTournament": { "tourney_name": [series] } }
const seriesByTournament = tournamentsData.seriesByTournament || {};
console.log(`Tournaments: ${Object.keys(seriesByTournament).join(', ')}`);

// Extract unique tournament info from series data
const tournamentMap = new Map();
for (const [tourneyName, seriesList] of Object.entries(seriesByTournament)) {
  if (Array.isArray(seriesList) && seriesList.length > 0) {
    const firstSeries = seriesList[0];
    tournamentMap.set(tourneyName, {
      name: tourneyName,
      league_id: firstSeries.tournament_id,
      start_date: firstSeries.games?.[0]?.start_time || Math.floor(Date.now() / 1000),
      end_date: firstSeries.games?.[firstSeries.games.length - 1]?.start_time || Math.floor(Date.now() / 1000)
    });
  }
}

console.log(`Loading ${tournamentMap.size} tournaments from JSON...`);

// Insert tournaments
for (const [name, t] of tournamentMap) {
  db.run(`INSERT INTO tournaments (id, name, name_cn, tier, start_date, end_date, status, prize_pool, location, format, logo_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [t.league_id, t.name, t.name, 'S', t.start_date, t.end_date, 'finished', '', '', '', '']
  );
}
console.log(`Inserted ${tournamentMap.size} tournaments`);

// Save database
fs.writeFileSync('data/dota2.db', db.export());
console.log('Database saved!');
