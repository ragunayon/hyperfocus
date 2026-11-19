#!/usr/bin/env node
/**
 * hyperfocus — keeps a Claude Code session on one task.
 *
 * UserPromptSubmit:
 *   - The first substantive prompt of a session is recorded as the session's task.
 *   - A prompt starting with "task:" replaces the recorded task explicitly.
 *   - Every later prompt gets the recorded task injected as context, so Claude flags
 *     a prompt that looks like a different task and suggests /clear or a new session.
 * SessionStart (source "clear"): forgets the task, so the next prompt records a new one.
 *
 * State: ~/.claude/hyperfocus/tasks/<session_id>.txt — local only, pruned after 30 days.
 * The hook never blocks: any error exits 0 silently.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const TASKS = path.join(os.homedir(), '.claude', 'hyperfocus', 'tasks');
const MAX_TASK_CHARS = 300;
const MIN_TASK_CHARS = 15; // "hi", "continue", "yes" are not tasks
const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function taskFile(sessionId) {
  // session ids are uuids; strip anything else so the path can't escape TASKS
  return path.join(TASKS, `${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '')}.txt`);
}

function oneLine(text) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > MAX_TASK_CHARS ? `${flat.slice(0, MAX_TASK_CHARS)}…` : flat;
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
}

function pruneOld() {
  const cutoff = Date.now() - PRUNE_AFTER_MS;
  for (const name of fs.readdirSync(TASKS)) {
    const file = path.join(TASKS, name);
    if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
  }
}

function onSessionStart(input) {
  if (input.source === 'clear' && input.session_id) fs.rmSync(taskFile(input.session_id), { force: true });
  pruneOld();
}

function onUserPrompt(input) {
  const prompt = String(input.prompt || '').trim();
  if (!input.session_id || !prompt) return;
  const file = taskFile(input.session_id);

  const explicit = prompt.match(/^task:\s*([\s\S]+)/i);
  if (explicit) {
    const task = oneLine(explicit[1]);
    fs.writeFileSync(file, task);
    emit({
      systemMessage: `hyperfocus: task set: ${task}`,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `The user set this session's task to: "${task}". Acknowledge it in one line, then work on it.`,
      },
    });
    return;
  }

  if (!fs.existsSync(file)) {
    const isBareCommand = /^\/\S+$/.test(prompt); // /clear, /compact, /cost …
    if (isBareCommand || prompt.length < MIN_TASK_CHARS) return;
    const task = oneLine(prompt);
    fs.writeFileSync(file, task);
    emit({ systemMessage: `hyperfocus: task recorded: ${task}  (change it with "task: …")` });
    return;
  }

  const task = fs.readFileSync(file, 'utf8');
  emit({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: [
        `[hyperfocus] This session's task: "${task}".`,
        'Follow-ups, clarifications, questions about work done in this session, and closely related next steps belong to it.',
        'If this prompt is clearly a different task, begin your reply with one line saying so and suggest /clear or a new',
        'session (or "task: …" to re-scope this one), then ask whether to continue here before doing the work.',
        'If it belongs to the task, do not mention this check.',
      ].join(' '),
    },
  });
}

try {
  fs.mkdirSync(TASKS, { recursive: true });
  const input = readStdin();
  if (input.hook_event_name === 'SessionStart') onSessionStart(input);
  else if (input.hook_event_name === 'UserPromptSubmit') onUserPrompt(input);
} catch {
  // never block a prompt or a session start because of this hook
}
process.exit(0);
