// Runs the hook as Claude Code does (JSON on stdin, JSON on stdout) against a throwaway HOME.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'hyperfocus.cjs');
let home;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperfocus-'));
});

function run(input) {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: raw,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.equal(res.status, 0);
  return res.stdout ? JSON.parse(res.stdout) : null;
}

const prompt = (text, session = 's1') => run({ hook_event_name: 'UserPromptSubmit', session_id: session, prompt: text });
const taskPath = (session = 's1') => path.join(home, '.claude', 'hyperfocus', 'tasks', `${session}.txt`);

test('skips short prompts and bare slash commands', () => {
  assert.equal(prompt('yes'), null);
  assert.equal(prompt('/compact'), null);
  assert.equal(fs.existsSync(taskPath()), false);
});

test('records the first substantive prompt as the task', () => {
  const out = prompt('fix the flaky login test in CI');
  assert.match(out.systemMessage, /task recorded: fix the flaky login test in CI/);
  assert.equal(fs.readFileSync(taskPath(), 'utf8'), 'fix the flaky login test in CI');
});

test('injects the task on later prompts', () => {
  prompt('fix the flaky login test in CI');
  const out = prompt('now rerun it');
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /\[hyperfocus\] This session's task: "fix the flaky login test in CI"/);
});

test('"task:" replaces the recorded task', () => {
  prompt('fix the flaky login test in CI');
  const out = prompt('task: write the release notes');
  assert.match(out.systemMessage, /task set: write the release notes/);
  assert.equal(fs.readFileSync(taskPath(), 'utf8'), 'write the release notes');
});

test('long prompts are flattened and capped', () => {
  prompt(`${'word '.repeat(200)}\n\nend`);
  const saved = fs.readFileSync(taskPath(), 'utf8');
  assert.ok(saved.length <= 301);
  assert.ok(!saved.includes('\n'));
});

test('/clear forgets the task', () => {
  prompt('fix the flaky login test in CI');
  run({ hook_event_name: 'SessionStart', session_id: 's1', source: 'clear' });
  assert.equal(fs.existsSync(taskPath()), false);
});

test('resume keeps the task', () => {
  prompt('fix the flaky login test in CI');
  run({ hook_event_name: 'SessionStart', session_id: 's1', source: 'resume' });
  assert.equal(fs.existsSync(taskPath()), true);
});

test('session ids cannot escape the tasks folder', () => {
  prompt('a prompt that is long enough', '../../evil');
  assert.equal(fs.existsSync(path.join(home, '.claude', 'evil.txt')), false);
  assert.equal(fs.existsSync(taskPath('evil')), true);
});

test('bad input never fails the hook', () => {
  assert.equal(run('not json'), null);
  assert.equal(run({}), null);
});
