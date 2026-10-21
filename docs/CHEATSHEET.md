# Atlas cheat sheet

_Generated from `~/Developer/atlas/src/cheatsheet.json` — edit that, not this. In Atlas, press `?`._

## Everywhere

| Keys | Does |
|---|---|
| `⌘K` | Command palette: tools, modes, agents, settings |
| `⌘1 … ⌘9` | Orbit · School · Build · Ops · Career · Content · AI · Missions · Flows |
| `⌘0` | Code |
| `⌘,` | Settings |
| `⌃⌥Space` | Summon Atlas from any app |
| `A–Z` | Launch a tool in the current mode (the letter on its rim icon) |
| `?` | This cheat sheet |
| `Esc` | Close the palette, settings or this sheet |

## Code — the world

| Keys | Does |
|---|---|
| `Click a pattern` | Its guide: the idea, signals, template, pitfalls, problems |
| `Click a problem` | Open it in the workbench (amber = due for review) |
| `L` | LeetCode |
| `N` | NeetCode roadmap |
| `C` | CoderPad sandbox |
| `J` | Java 17 API docs |
| `B` | Big-O cheat sheet |
| `I` | ~/Developer/interview-prep in your editor |

## Code — the workbench

| Keys | Does |
|---|---|
| `⌘↵` | Run: compile and run the fixed tests |
| `⌘⇧↵` | Submit: tests, then stress against the reference, then speed (a pass counts as a solve) |
| `Tab / ⇧Tab` | Indent / outdent |
| `⌘Z / ⌘⇧Z` | Undo / redo |
| `Click "line N"` | Jump to the line an error, exception or lint points at |
| `Hint button` | Next hint (nudge → insight → near-solution); brings the problem back sooner |
| `show target complexity` | Reveal the Big-O you're aiming for |
| `Coach` | Open the coach; Enter sends, ⇧Enter adds a line |
| `End interview` | Mock only: finish and get the scorecard |

## Code — drills

| Keys | Does |
|---|---|
| `⌘↵` | Check your answer, then ⌘↵ again for the next drill |
| `Topic chips` | Drill one topic (autoboxing, strings, overflow…) |

## Deep links

| Keys | Does |
|---|---|
| `?mode=code` | Open Atlas on Code |
| `?mode=code&problem=<id>` | Open a problem, e.g. problem=lru-cache |
| `…&as=mock` | Open it as a 45-minute mock interview |
| `?mode=code&tab=drills` | Tabs: today · pattern · drills · toolkit · progress |

## Terminal

| Keys | Does |
|---|---|
| `python3 ~/Developer/atlas/src-tauri/code/validate.py` | Check every problem and drill against a real JDK |
| `… validate.py two-sum lru-cache` | Check specific problems |
| `… validate.py --drills` | Check the drills only |
| `cd ~/Developer/atlas/src-tauri && cargo test --release judge_live -- --ignored --nocapture` | Live judge test: reference, brute force, wrong answer, compile error |
| `cd ~/Developer/atlas && pnpm mock` | The UI in a browser on :1430, with real data, no app |
| `cd ~/Developer/atlas && pnpm cheatsheet` | Regenerate the Markdown copies of this sheet |
