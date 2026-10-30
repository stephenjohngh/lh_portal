// src/lib/apps/guides/utils/starterGuides.js
// STARTER GUIDES — a seed, like the compliance register's: shipped in src/, added by the
// app (Manage tab) as DRAFTS the first time an administrator opens it, and never again
// (the keys already added are remembered in portal_settings, so deleting one on purpose
// is not undone). Not a migration: migrations do not ship.
//
// ⛔ These are DRAFTS WRITTEN WITHOUT SEEING THIS BUILDING. Every one must be walked
// through on site and corrected before it is published — the wording below is generic
// ("the panel", "the bin store") and the real names, places and equipment are yours to
// put in. They carry no codes, keys or passwords, and must never gain any.
//
// A guide says how a job is done. It is not a record that the job was done.

export const STARTER_SETTING_KEY = 'guides_starters_applied';

/**
 * @typedef {{ kind?: string, title: string, body?: string }} StarterStep
 * @typedef {{ key: string, title: string, category_key: string, audience: string, targets: string[],
 *   summary: string, you_need: string, minutes: number, steps: StarterStep[] }} StarterGuide
 */

/** @type {StarterGuide[]} */
export const STARTER_GUIDES = [
  {
    key: 'bins-collection',
    title: 'Moving the bins to the collection point',
    category_key: 'waste',
    audience: 'anyone',
    targets: ['weekend cleaner', 'holiday cleaner'],
    summary: 'Getting the bins from the bin store to where the council collects them, and back.',
    you_need: 'Gloves; the key or fob for the bin store',
    minutes: 15,
    steps: [
      { title: 'Check it is collection day', body: 'Look at the collection calendar. Only put bins out on the evening before, or the morning of, collection.' },
      { title: 'Wear gloves and open the bin store', body: 'Prop the door open so it cannot swing shut on you.' },
      { kind: 'caution', title: 'Check each bin before you move it', body: 'Do not move a bin that is overfilled, split, or leaking. Do not put your hand inside. Wheel only what you can steer comfortably.' },
      { title: 'Wheel the bins to the collection point', body: 'Keep the pavement and any access route clear. Put them where the crew can reach them, with the lids closed.' },
      { title: 'Close up', body: 'Close and secure the bin store. Check nothing is left on the floor of the store.' },
      { title: 'Bring them back', body: 'After collection, return each bin to the store, lids down, and note any that were missed or damaged.' },
      { kind: 'stop', title: 'If a bin is jammed, on fire, or something dangerous is inside', body: 'Do not try to deal with it. Move away and call the office or the managing agent. If there is fire or smoke, call 999.' },
    ],
  },
  {
    key: 'change-bulb',
    title: 'Changing a light bulb in a communal area',
    category_key: 'lighting',
    audience: 'anyone',
    targets: ['weekend cleaner', 'holiday cleaner'],
    summary: 'Replacing a failed bulb safely, and knowing when not to.',
    you_need: 'The right replacement bulb; a stable step ladder if needed; gloves',
    minutes: 10,
    steps: [
      { kind: 'caution', title: 'Is it a job for you?', body: 'Change a bulb only if you can reach it standing on the floor or on a proper step ladder. Never use a chair, a box, or a ladder that is not stable. If it is higher than a step ladder, stop and report it.' },
      { title: 'Switch the light off and let it cool', body: 'Switch it off at the wall. Wait a few minutes: bulbs and covers can be hot.' },
      { title: 'Open the cover and take out the old bulb', body: 'Support the cover as you open it. Turn the old bulb gently to remove it. Keep the old one to show the type.' },
      { title: 'Fit the same type of bulb', body: 'Match the shape, fitting and wattage. Do not use a higher wattage than the fitting says.' },
      { title: 'Close the cover and test', body: 'Refit the cover, switch on, and check it lights.' },
      { kind: 'stop', title: 'If the new bulb does not light, the fitting is damaged, or you smell burning', body: 'Switch it off and leave it. Do not try again or open anything else. Report it to the office. If it is an emergency light (a green running-man sign or a light that stays on in a power cut), report it, do not change it yourself.' },
    ],
  },
  {
    key: 'fire-alarm-test-mode',
    title: 'Putting the fire alarm panel into test mode',
    category_key: 'fire',
    audience: 'caretaker',
    targets: ['caretaker'],
    summary: 'Silencing and testing the fire alarm for the weekly test, then putting it back to normal.',
    you_need: 'The panel key if the panel is locked; the weekly test log',
    minutes: 20,
    steps: [
      { title: 'Tell people first', body: 'Let the office and anyone who may be affected know the time of the test. Check no contractor is working near the detectors.' },
      { kind: 'caution', title: 'Never leave the panel in test or disabled', body: 'A panel left in test mode will not raise the alarm in a real fire. Put it back to normal before you leave it.' },
      { title: 'Go to the panel and read its display', body: 'Note what it shows before you start. A fault already showing must be reported before you test.' },
      { title: 'Choose a different point each week', body: 'Use the log to pick the call point not tested last time. Write down which one.' },
      { title: 'Operate the call point and check the alarm', body: 'Operate the call point as it is marked. Check the panel shows the right zone and the sounders can be heard.' },
      { title: 'Reset the panel and the call point', body: 'Reset the call point with its key or tool, then reset the panel. Check it shows normal.' },
      { title: 'Record the test', body: 'Write the date, time, which call point, and anything that did not work, in the log.' },
      { kind: 'stop', title: 'If the alarm does not sound, the panel will not reset, or a fault shows', body: 'Report it to the office straight away, and say the alarm is not fully working. Follow the instructions in the fire risk assessment for a defective alarm.' },
    ],
  },
  {
    key: 'test-emergency-luminaire',
    title: 'Testing an emergency luminaire',
    category_key: 'lighting',
    audience: 'caretaker',
    targets: ['caretaker'],
    summary: 'The monthly short test of an emergency light, and what to record.',
    you_need: 'The test key or switch for the lights; the emergency lighting log',
    minutes: 20,
    steps: [
      { title: 'Know what you are looking for', body: 'An emergency light has a small indicator that shows it is charging, normally green. It should light when the normal power is simulated off.' },
      { kind: 'good', title: 'What good looks like', body: 'The indicator is on, the fitting is clean and undamaged, and it lights fully during the test.' },
      { kind: 'bad', title: 'What bad looks like', body: 'No indicator, a flashing or red indicator, a cracked cover, a dim or flickering light, or a light that goes out before the test ends.' },
      { title: 'Start the test', body: 'Use the test key or switch for that circuit. Walk the route and check each light comes on.' },
      { kind: 'caution', title: 'Finish the test promptly', body: 'A short test is fine, but do not leave the lights running on battery longer than the instructions say: they need time to recharge.' },
      { title: 'Restore normal power and check the indicators', body: 'Turn the test off. Check every indicator has returned to normal.' },
      { title: 'Record the result', body: 'Write the date, who tested, and which lights passed and failed.' },
      { kind: 'stop', title: 'If a light fails the test', body: 'Mark it in the log and report it to the office the same day. Do not try to repair it. A failed emergency light is a fault to be fixed promptly.' },
    ],
  },
  {
    key: 'isolate-lighting-circuit',
    title: 'Switching off a lighting circuit',
    category_key: 'lighting',
    audience: 'caretaker',
    targets: ['caretaker'],
    summary: 'Switching off one lighting circuit at the board for a safe, short job, and switching it back.',
    you_need: 'A torch; a "do not switch on" tag; the circuit chart for the board',
    minutes: 10,
    steps: [
      { kind: 'caution', title: 'Switching off is not the same as safe', body: 'This guide is only for switching a lighting circuit off and on. It does not make wiring safe to touch. Never open a light fitting to work on wiring: that is a job for a qualified electrician.' },
      { title: 'Find the right circuit', body: 'Use the circuit chart on or beside the board. Check the label matches the lights you need off.' },
      { title: 'Tell people and warn them', body: 'Tell anyone affected. Check that no emergency or exit light is on the same circuit; if it is, stop and ask the office.' },
      { title: 'Switch it off and tag it', body: 'Switch off the breaker for that circuit only and fix the "do not switch on" tag to it.' },
      { title: 'Check the lights are off', body: 'Go to the lights and check they are off before you start anything.' },
      { title: 'Put it back', body: 'When the job is finished and everyone is clear, remove the tag, switch the breaker on, and check the lights work.' },
      { kind: 'stop', title: 'If a breaker trips again, or you see burning, scorching or water', body: 'Leave it off. Do not keep resetting it. Report it to the office and, for burning or water near electrics, call the emergency number.' },
    ],
  },
];
