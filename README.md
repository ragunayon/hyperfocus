# hyperfocus

A Claude Code plugin that keeps a session on one task.

Long sessions drift. You fix a bug, then ask about a deploy, then start a refactor, all in one session.
Facts from the first task start leaking into the third, and every turn pays to re-read history it no
longer needs. hyperfocus remembers what the session is for and has Claude say so when a prompt looks
like a different task, so you can `/clear` or open a new session at the right moment.

## Install

```
/plugin marketplace add YOUR_GITHUB_USERNAME/hyperfocus
/plugin install hyperfocus@hyperfocus
```

Requires Node.js on your `PATH` (any current LTS).

## How it works

| You do                          | hyperfocus does                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| Send the first prompt           | Records it as the session's task and shows `hyperfocus: task recorded: …`             |
| Keep working on that task       | Nothing visible. Claude gets a one-line reminder of the task with each prompt          |
| Ask for something unrelated     | Claude says it looks like a different task, suggests `/clear` or a new session, asks  |
| Type `task: <description>`      | Replaces the recorded task (use when you deliberately change focus)                   |
| Run `/clear`                    | Forgets the task; your next prompt records a new one                                  |

Prompts shorter than 15 characters ("yes", "continue") and bare slash commands (`/compact`) are never
recorded as the task.

It nudges; it never blocks. Whether a prompt is "a different task" is Claude's call, so expect the
occasional miss or false flag.

## Cost

About 150 input tokens added per prompt and ~25 ms per hook run. A single `/clear` that drops tens of
thousands of tokens of unrelated history pays for hundreds of reminders.

## Privacy

The first 300 characters of each session's task are saved to `~/.claude/hyperfocus/tasks/` on your
machine and deleted after 30 days. Nothing is sent anywhere.

## Turn it off

```
/plugin disable hyperfocus@hyperfocus      # pause
/plugin uninstall hyperfocus@hyperfocus    # remove
```

## Development

```
node --test test/
claude plugin validate .
claude --plugin-dir .      # try the working copy without installing it
```

## License

MIT
