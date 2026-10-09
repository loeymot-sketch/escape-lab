import { MASTER_SCORING, STANDARD_SCORING } from './content.ts';
import { HINT_PENALTY, TIME_PAR_SHARE, WRONG_PENALTY, maxScore } from './scoring.ts';

export function scoringRules() {
  return {
    standardMission: { ...STANDARD_SCORING, maxScore: maxScore(STANDARD_SCORING, 1) },
    masterLab: { ...MASTER_SCORING, maxScore: maxScore(MASTER_SCORING, 4) },
    wrongAnswerPenalty: -WRONG_PENALTY,
    hintPenalty: -HINT_PENALTY,
    scoreFloor: 'Penalties are applied only up to the points a mission has earned: a mission never scores below 0, and a ledger row marked "capped" says so.',
    timeBonus: `Full bonus up to ${TIME_PAR_SHARE * 100}% of the time limit, then linear down to 0 at the limit.`,
    xp: 'Total XP is the sum of your best score per mission, so replays can improve but never farm XP.',
    levels: 'Level n starts at 250 x n x (n - 1) XP: 0, 500, 1500, 3000, 5000, 7500 and so on.',
    accuracy: 'Mission accuracy = steps solved / (steps solved + wrong answers), taken from your best attempt. Lab and overall accuracy are the mean of mission accuracies.',
    labsCompleted: 'Labs completed counts the three standard labs (Hematology, Microbiology, Clinical Biochemistry) whose exit code you have entered, out of 3, on the dashboard, the profile, the leaderboard and the teacher views. The Master Lab is the capstone: it has its own Clinical Detective badge and is not counted in this figure.',
    needsAttention: 'Teacher view: a student needs attention after 7 days without activity while unfinished, or with accuracy under 60%.',
    success: 'Teacher view: a mission\'s success is the class mean accuracy (best attempts). The server flags only the hardest mission (the lowest success), and only when it falls under 70%. The share of clean first tries is shown separately.',
  };
}
