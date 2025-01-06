const { HLTV } = require('hltv');
const fs = require('fs');
const path = require('path');

const dataFilePath = path.join(__dirname, 'playerStats.json');

async function getTeamIdByName(teamName) {
  const team = await HLTV.getTeamByName(teamName)
  return team.id
}

// Function to get players for a team
async function getPlayersForTeam(name) {
  try {
    let i = 0;
    const { TrueSkill, Rating } = await import('ts-trueskill');
    // Initialize TrueSkill environment
    const ts = new TrueSkill();

    let team;
    const cachedTeam1 = getTeamFromFile(name);

    // Fetch team data
    if (cachedTeam1) {
      console.log('Fetching data from cache')
      team = cachedTeam1

    } else {
      team = await HLTV.getTeamByName({ name: name })
      i=1;
    }

    const teamRank = team.rank;

    // Clean up team data
    const teamWithNewsAndRankingDev = { ...team }
    if (teamWithNewsAndRankingDev.news) {
      delete teamWithNewsAndRankingDev.news
    }
    if (teamWithNewsAndRankingDev.rankingDevelopment) {
      delete teamWithNewsAndRankingDev.rankingDevelopment
    }
    if ( i === 1) {
      for (let i = 0; i < teamWithNewsAndRankingDev.players.length; i++) {
        delete teamWithNewsAndRankingDev.players[i].timeOnTeam
        delete teamWithNewsAndRankingDev.players[i].mapsPlayed
        delete teamWithNewsAndRankingDev.players[i].type
      }
      if (teamWithNewsAndRankingDev.players.length === 5) {
        delete teamWithNewsAndRankingDev.players[5]
      }
    }

    // Prepare newPlayers array
    let newPlayers = [];
    let newPlayersCache = [];
    if (i === 1) {
      newPlayers = [
        teamWithNewsAndRankingDev.players[0],
        teamWithNewsAndRankingDev.players[1],
        teamWithNewsAndRankingDev.players[2],
        teamWithNewsAndRankingDev.players[3],
        teamWithNewsAndRankingDev.players[4]
      ]
    } else {
      // Prepare newPlayers array
        newPlayersCache = [
        team.playersStats[0],
        team.playersStats[1],
        team.playersStats[2],
        team.playersStats[3],
        team.playersStats[4]
      ]
    }


    let playersStats = [];
    let playersMu = [];

    const kdWeight = 20;
    const damageWeight = 0.3;
    const killsWeight = 50;
    const assistWeight = 10;
    const deathWeight = 20;
    let sigma = 25 / 3
    let rankWeight;

    if (teamRank <= 10) {
      rankWeight = 1.01 - (0.001*teamRank);
    } else if (teamRank <= 20) {
       rankWeight = 1.01 - (0.005*teamRank);
    } else if (teamRank >= 100) {
        rankWeight = 0.01;
    } else {
        rankWeight = 1.01 - (0.01*teamRank);
    }


    console.log('Team Rank:', teamRank, 'Rank Weight:', rankWeight);

    if (i===1) {
      console.log('Players:', newPlayers)
    }
    else {
      console.log('Players:', newPlayersCache)
    }

    let teamMu;

    // Fetch stats for each player
    for (const player of newPlayers) {
      try {
        let stats;
        let playerName;
        let kdRatio;
        let damagePerRound;
        let killsPerRound;
        let assistsPerRound;
        let deathsPerRound;


        let mu;
        let indivStat;

        if (i === 1) {
          stats = await HLTV.getPlayerStats({id: player.id})
           playerName = player.name;
           kdRatio = stats.overviewStatistics.kdRatio;
           damagePerRound = stats.overviewStatistics.damagePerRound;
           killsPerRound = stats.overviewStatistics.killsPerRound;
           assistsPerRound = stats.overviewStatistics.assistsPerRound;
           deathsPerRound = stats.overviewStatistics.deathsPerRound;
          if (stats.matches) {
            delete stats.matches
          }
          mu = (kdRatio * kdWeight) +
              (damagePerRound* damageWeight) +
              (killsPerRound * killsWeight) -
              (assistsPerRound* assistWeight) -
              (1 / deathsPerRound * deathWeight);
          playersMu.push(mu);

          console.log('Player mu:', mu);

        } else {
          playerName = team.playerStats.playerName;
          kdRatio = team.playerStats.kdRatio;
            damagePerRound = team.playerStats.damagePerRound;
            killsPerRound = team.playerStats.killsPerRound;
            assistsPerRound = team.playerStats.assistsPerRound;
            deathsPerRound = team.playerStats.deathsPerRound;
            teamMu = team.teamMu;

          console.log('Team mu:', teamMu);

        }

        indivStat = { playerName, kdRatio, damagePerRound, killsPerRound, assistsPerRound, deathsPerRound }
        playersStats.push(indivStat);


        console.log(
            'Stats for ' + playerName + ':',
            'KD',
            kdRatio,
            'DPR',
            damagePerRound,
            'KPR',
            killsPerRound,
            'APR',
            assistsPerRound,
            'DPR',
            deathsPerRound
        )

      } catch (err) {
        console.error(`Failed to fetch stats for player ${player.name}:`, err)
      }
    }

    let teamRating;
    if (i === 1) {
      const teamMu = calculateTeamMu(playersMu)*rankWeight;
      console.log('Teams mu:', teamMu);
      teamRating = new Rating(teamMu, sigma);
      console.log('Team rating:', teamRating)
    } else {
        const teamMu = team.teamMu;
        console.log('Teams mu:', teamMu);
        teamRating = new Rating(teamMu, sigma);
        console.log('Team rating:', teamRating)
    }


    // Log team data to file
    logDataToFile({
      team: name,
      rank: teamRank,
      playersStats: playersStats,
      teamRating: teamRating,
      teamMu: teamMu
    });

    return teamRating;

  } catch (err) {
    console.error('Error fetching team:', err)
    return null; // Return null if there's an error
  }
}

function calculateTeamMu(teamMuArray) {
  const totalMu = teamMuArray.reduce((sum, mu) => sum + mu, 0);
  return totalMu / teamMuArray.length; // Average
}

function winProbability1(team1Rating, team2Rating) {
let deltaMu = team1Rating.mu - team2Rating.mu;
let rsss = Math.sqrt(Math.pow(team1Rating.sigma, 2) + Math.pow(team2Rating.sigma, 2));
return cdf(deltaMu / rsss);
}

function cdf(x) {
  return (1.0 + erf(x / Math.sqrt(2))) / 2.0;
}

function erf(x) {
  // Approximation of the error function
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const tau = t * Math.exp(-x * x - 1.26551223 +
      t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
          t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 +
              t * 0.17087277)))))))));
  return x >= 0 ? 1 - tau : tau - 1;
}

function logDataToFile(data) {
  try {
    // Read the existing data from the file if it exists
    let existingData = [];
    if (fs.existsSync(dataFilePath)) {
      const fileContent = fs.readFileSync(dataFilePath, 'utf-8');
      existingData = JSON.parse(fileContent);
    }

    // Check if the team name already exists in the data
    const isTeamPresent = existingData.some(team => team.team === data.team);

    console.log('Is team present:', data.team);

    if (!isTeamPresent) {
      // Append new data if the team is not already present
      existingData.push(data);

      // Write updated data to the file
      fs.writeFileSync(dataFilePath, JSON.stringify(existingData, null, 2));
      console.log(`Data for team ${data.team} successfully logged to file.`);
    } else {
      console.log(`Data for team ${data.team} already exists in the file.`);
    }
  } catch (err) {
    console.error("Error logging data to file:", err);
  }
}


function getTeamFromFile(teamName) {
  try {
    if (fs.existsSync(dataFilePath)) {
      const fileContent = fs.readFileSync(dataFilePath, 'utf-8');
      const existingData = JSON.parse(fileContent);
      //console.log('File content:', existingData);

      // Ensure the data is an array
      if (!Array.isArray(existingData)) {
        console.error('Unexpected data structure in file:', existingData);
        return null;
      }

      // Search for the team in the file
      const team = existingData.find(team => team.team.toLowerCase() === teamName.toLowerCase());
      console.log('Matching team data found');

      return team || null; // Return the team or null if not found
    }
    return null;
  } catch (err) {
    console.error("Error reading data from file:", err);
    return null;
  }
}


(async () => {
  let team1Rating
  let team2Rating
  try {
    const { TrueSkill } = await import('ts-trueskill')
    const { winProbability, quality_1vs1, rate_1vs1 } = await import('ts-trueskill')
    const ts = new TrueSkill()

    const teamName1 = 'Spirit' // Replace with team 1 name
    const teamName2 = 'Natus Vincere' // Replace with team 2 name

    console.log(`Fetching data for ${teamName1}...`)
    team1Rating = await getPlayersForTeam(teamName1)

    console.log(`Fetching data for ${teamName2}...`)
    team2Rating = await getPlayersForTeam(teamName2)


    // Check if both team ratings were fetched successfully
    if (!team1Rating || !team2Rating) {
      throw new Error('Failed to fetch ratings for one or both teams.')
    }

    // Calculate win probabilities
    const probTeam1Wins = winProbability([team1Rating], [team2Rating])
    const quality = quality_1vs1(team1Rating, team2Rating)
    //Personal implementation
    //const probTeam1Wins = winProbability1(team1Rating, team2Rating)


    console.log(`Win Probability - ${teamName1}:`, probTeam1Wins)
    console.log(`Win Probability - ${teamName2}:`, 1 - probTeam1Wins)
    console.log(`Quality:`, quality)

    const rate = rate_1vs1(team1Rating, team2Rating);
    console.log(`Updated Team 1 rating:`,  rate[0])
    console.log(`Updated Team 2 rating:`,  rate[1])

    const probTeam2Wins = winProbability([rate[0]], [rate[1]])
    console.log(`Win Probability - ${teamName1}:`, probTeam2Wins)
    console.log(`Win Probability - ${teamName2}:`, 1 - probTeam2Wins)

  } catch (err) {
    console.error(
      'Failed to fetch player stats or calculate probabilities:',
      err
    )
  }
})();
