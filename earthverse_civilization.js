/*
 * EARTHVERSE Phase 7 — Local AI Civilization Simulation
 * Zero API cost. Deterministic/local rule-based simulation, not an LLM.
 *
 * Usage:
 * import { createCivilization } from './earthverse_civilization.js';
 * const civilization = createCivilization({
 *   citizens: humans.npcs, // roots returned by createEarthverseHumans()
 *   worldName: 'EARTHVERSE',
 *   citizenCount: 5
 * });
 * // In the render loop, after humans.update(dt):
 * civilization.update(dt);
 * // When the player taps an NPC:
 * const reply = civilization.talkTo(civilization.citizens[0].id, 'hello');
 * // Optional UI:
 * document.querySelector('#ev-civ-status').textContent = civilization.getStatusText();
 */
const STORAGE_KEY = 'earthverse.civilization.v1';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = a => a[Math.floor(Math.random() * a.length)];
const uid = i => `citizen-${String(i + 1).padStart(4, '0')}`;

const PERSONALITIES = [
  { name: 'Friendly', sociability: .9, ambition: .5, curiosity: .7 },
  { name: 'Ambitious', sociability: .5, ambition: .95, curiosity: .6 },
  { name: 'Quiet', sociability: .25, ambition: .55, curiosity: .5 },
  { name: 'Curious', sociability: .7, ambition: .6, curiosity: .95 },
  { name: 'Helpful', sociability: .85, ambition: .65, curiosity: .65 }
];
const JOBS = ['Shop assistant', 'Mechanic', 'Teacher', 'Medic', 'Engineer',
              'Gardener', 'Courier', 'Artist', 'Researcher', 'Chef'];
const ACTIVITIES = ['sleeping', 'commuting', 'working', 'eating', 'socializing',
                    'shopping', 'relaxing', 'exploring'];
const DAY_LENGTH = 24 * 60; // simulated minutes

function activityAt(minute) {
  const h = minute / 60;
  if (h < 6 || h >= 23) return 'sleeping';
  if (h < 8) return 'commuting';
  if (h < 12) return 'working';
  if (h < 13) return 'eating';
  if (h < 17) return 'working';
  if (h < 19) return 'commuting';
  if (h < 21) return 'socializing';
  if (h < 23) return 'relaxing';
  return 'sleeping';
}

export function createCivilization({
  citizens = [], worldName = 'EARTHVERSE', citizenCount = citizens.length,
  simulatedMinutesPerSecond = 3, saveIntervalSeconds = 15
} = {}) {
  const count = Math.min(citizens.length, Math.max(0, citizenCount));
  let state = {
    minute: 8 * 60,
    day: 1,
    elapsed: 0,
    citizens: []
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.citizens)) state = { ...state, ...saved };
  } catch (_) { /* storage may be unavailable in private browsing */ }

  const people = [];
  for (let i = 0; i < count; i++) {
    const root = citizens[i];
    let data = state.citizens.find(c => c.id === uid(i));
    if (!data) {
      const p = PERSONALITIES[i % PERSONALITIES.length];
      data = {
        id: uid(i), name: ['Asha', 'Mira', 'Arun', 'Dev', 'Nila', 'Kavin',
                           'Ira', 'Ravi', 'Tara', 'Noah'][i % 10],
        personality: p.name, sociability: p.sociability,
        ambition: p.ambition, curiosity: p.curiosity,
        job: JOBS[i % JOBS.length], money: 500 + i * 125,
        energy: 80, hunger: 15, happiness: 70,
        activity: 'working', goal: 'Go to work',
        memories: [], relationships: {}, lastActivity: '',
        decisionTimer: Math.random() * 4
      };
    }
    const citizen = { ...data, root };
    if (root) {
      root.userData = root.userData || {};
      root.userData.earthverseCitizen = citizen;
    }
    people.push(citizen);
  }

  function decide(c) {
    const scheduled = activityAt(state.minute);
    // Needs can override the daily schedule.
    if (c.energy < 14) c.activity = 'sleeping';
    else if (c.hunger > 88) c.activity = 'eating';
    else if (c.happiness < 18 && c.sociability > .55) c.activity = 'socializing';
    else c.activity = scheduled;

    const goals = {
      sleeping: 'Rest and recover energy',
      commuting: `Travel to ${c.job}`,
      working: `Work as ${c.job}`,
      eating: 'Find food and eat',
      socializing: 'Meet other citizens',
      shopping: 'Visit local shops',
      relaxing: 'Enjoy free time',
      exploring: 'Explore the neighbourhood'
    };
    c.goal = goals[c.activity] || 'Continue daily life';
    c.lastActivity = c.activity;
  }

  function updateNeeds(c, dt) {
    const hours = dt * simulatedMinutesPerSecond / 60;
    c.hunger = clamp(c.hunger + hours * 2.1, 0, 100);
    if (c.activity === 'sleeping') c.energy = clamp(c.energy + hours * 17, 0, 100);
    else c.energy = clamp(c.energy - hours * (c.activity === 'working' ? 3.0 : 1.6), 0, 100);
    if (c.activity === 'eating') c.hunger = clamp(c.hunger - hours * 34, 0, 100);
    if (c.activity === 'socializing') c.happiness = clamp(c.happiness + hours * 7, 0, 100);
    else c.happiness = clamp(c.happiness - hours * .22, 0, 100);
    if (c.activity === 'working') c.money += hours * (2 + c.ambition * 2);
  }

  function save() {
    const serial = {
      minute: state.minute, day: state.day, elapsed: state.elapsed,
      citizens: people.map(({ root, ...c }) => c)
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serial)); } catch (_) {}
  }

  let saveTimer = 0;
  function update(deltaSeconds) {
    const dt = clamp(Number(deltaSeconds) || 0, 0, .1);
    state.elapsed += dt;
    const advance = dt * simulatedMinutesPerSecond;
    state.minute += advance;
    while (state.minute >= DAY_LENGTH) { state.minute -= DAY_LENGTH; state.day++; }
    for (const c of people) {
      updateNeeds(c, dt);
      c.decisionTimer -= dt;
      if (c.decisionTimer <= 0) {
        decide(c);
        c.decisionTimer = 5 + Math.random() * 8;
      }
    }
    saveTimer += dt;
    if (saveTimer >= saveIntervalSeconds) { save(); saveTimer = 0; }
  }

  function remember(c, text) {
    c.memories.push({ day: state.day, minute: Math.floor(state.minute), text: String(text).slice(0, 140) });
    if (c.memories.length > 12) c.memories.shift();
  }

  function talkTo(id, message = 'hello') {
    const c = people.find(x => x.id === id);
    if (!c) return 'This citizen is not available.';
    const msg = String(message).toLowerCase();
    let reply;
    if (/hello|hi|hey|வணக்கம்/.test(msg)) {
      reply = pick([`Hello! I'm ${c.name}.`, `Hi there! I work as a ${c.job}.`, `Good to meet you!`]);
    } else if (/job|work/.test(msg)) {
      reply = `I work as a ${c.job}. I try to do my best every day.`;
    } else if (/name/.test(msg)) {
      reply = `My name is ${c.name}. I'm ${c.personality.toLowerCase()} by nature.`;
    } else if (/how are|feel/.test(msg)) {
      reply = `I'm feeling ${c.happiness > 60 ? 'pretty good' : 'a little tired'} today.`;
    } else if (/remember|memory/.test(msg)) {
      reply = c.memories.length ? `I remember: ${c.memories[c.memories.length - 1].text}` : `We haven't met before, have we?`;
    } else {
      reply = pick([`Interesting. What do you think?`, `I should get back to ${c.activity}.`, `Tell me more!`]);
    }
    remember(c, `Player said "${String(message).slice(0, 70)}". ${reply}`);
    return reply;
  }

  function getStatusText() {
    const h = Math.floor(state.minute / 60), m = Math.floor(state.minute % 60);
    return `${worldName} · Day ${state.day} · ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} · ${people.length} citizens`;
  }

  return {
    citizens: people, update, talkTo, save, getStatusText,
    getWorldState: () => ({
      worldName, day: state.day, minute: state.minute,
      citizens: people.map(({ root, ...c }) => ({ ...c }))
    }),
    dispose() { save(); }
  };
}
