# Roadmap

Atlas reads the checkboxes in this file: each heading becomes a progress bar.

## v0.1 — Foundation
- [x] Tauri v2 + React + Tailwind shell with native macOS chrome
- [x] Config file at ~/.config/atlas/config.json
- [x] Project telemetry: git activity + roadmap checklists
- [x] Sentry: unresolved issues + crash-free rate per project
- [x] Revenue: RevenueCat overview metrics
- [x] Production health checks
- [x] Local agents on Ollama with live project context, streaming
- [x] API keys in macOS Keychain, never exposed to the webview
- [ ] Connect Sentry token
- [ ] Connect RevenueCat key + project ID
- [x] Release build installed in /Applications

## v0.2 — Command center
- [x] Seven modes in a top nav, each with its own accent and layout
- [x] Launchers for every school, dev, ops, career and creator tool, with real app icons
- [x] ⌘K palette over launchers, modes, courses, projects and agents
- [x] 1–9 favorites everywhere, letter hotkeys per mode, ⌃⌥Space summon
- [x] School: live day timeline, week grid, course cards, focus timer
- [x] Career: internship pipeline tracker + interview drills
- [x] Build: commit stream across every repo
- [ ] Verify summon hotkey and launchers on the live desktop

## v0.3 — Missions (agent swarms)
- [x] Missions mode: brief + references → planner → parallel local researchers → cited report
- [x] Local search via SearXNG (Docker, capped at 2 GB), video captions via yt-dlp
- [x] Mechanical citation check: quotes must appear verbatim on the fetched page
- [x] Orchestrator reads pages itself when a small model skips it (0/20 → 15/20 verified)
- [ ] Source-quality pass: official-site queries (site:.gov), demote sellers of courses/leads
- [ ] Gap critic: compare report to the brief's explicit asks, send researchers back for gaps
- [ ] Local Whisper for videos without captions (TikTok)

## v0.3.5 — Nested agents
- [x] Concentric Orbit home with the orchestrator at the centre
- [x] Every folder is its own orbit with its own agent character
- [x] Folder-scoped context packs and sandboxed read-only tools
- [x] Search-first retrieval (IDF + densest window): 0/7 → 7/7 on ground truth
- [x] Orchestrator delegates to project agents
- [x] Handshake feed ranked from a real inbox (17 emails, 33 opportunities)
- [x] Every mode is its own concentric world with an agent at its centre
- [x] School: week clock, course planets → per-course tutor agents (teaching rules)
- [x] Career: the funnel as rings (offer at the centre), Handshake as an incoming ring
- [ ] Orchestrator delegates to folder agents, not just project roots
- [ ] Boost "employer sees you as a top applicant" emails in the Handshake ranking
- [ ] Per-agent memory: notes an agent keeps about its own folder

## v0.3.6 — Tasks: content and career
- [x] Task engine with a review queue: agents draft, you approve, nothing auto-posts
- [x] Post tasks for X / LinkedIn / Threads from real commits, roadmaps and resume
- [x] Resume tailoring and recruiter outreach for Handshake matches or pasted postings
- [x] Rust checker: channel limits, ungrounded numbers/tech, hype language, claims to verify
- [x] Every draft cites its basis; lesson posts only from a lesson you supply
- [ ] Goals: group tasks under a goal (a new project idea) and track them on a ring
- [ ] Learn your voice from posts you approve and edit
- [ ] Short-form video scripts from the content machine's verified brief

## v0.3.7 — n8n
- [x] Local n8n in Docker, Atlas API with token auth, Flows world
- [x] Approval gate: Wait node → Atlas → resume with edited text (tested end to end)
- [x] Starter workflows: morning brief, Handshake → outreach, approve → X, Sunday content
- [x] Facts from code: today's classes computed, not model-written
- [ ] First-run guide for n8n: owner account, API key, X/LinkedIn credentials, activate workflows
- [ ] Per-workflow autonomy setting (ask first / just do it)
- [ ] Workflow builder agent: describe a flow, Atlas drafts the n8n JSON for review

## v0.3.8 — CODE (interview practice)
- [x] Java judge: fixed tests, stress against a reference, benchmark with a fitted log-log slope
- [x] 45 problems across 14 patterns, each validated against a real JDK
- [x] 36 output-prediction drills captured from JDK 17; pattern guides; Java toolkit
- [x] Java red-flag linter, spaced repetition, coach and timed mock interview with a verified scorecard
- [x] Cheat sheet (`?`) from one source, mirrored to docs/CHEATSHEET.md

## Next — end to end
- [ ] First-run onboarding: profile, pick project folders, import a schedule, check Ollama models and the JDK
- [ ] Doctor screen: one place showing what's connected (Ollama, models, JDK, Docker, SearXNG, n8n, Mail access, keys)
- [ ] Voice mock interviews: local speech-to-text (whisper.cpp), because real interviews are spoken
- [ ] Mistake log: every stress counterexample and lint hit becomes a drill, verified by running it
- [ ] System design practice in CODE, grounded in your own repos (the interview agent, moved here)
- [ ] Learn your voice from the drafts you approve and edit
- [ ] Nightly local check: validate.py plus the live tests on a schedule, with a toast when something breaks
- [ ] SQLite instead of JSON/JSONL stores (atomic, queryable, one file)
- [ ] Signed, notarized releases with auto-update through GitHub Releases (needs an Apple Developer ID)

## v0.4 — Jobs (agents that do work)
- [ ] Job runner + approval queue: nothing posts, sends or spends without a click
- [ ] Brand content agent: content machine → local voice + Remotion render → queue
- [ ] Personal tweet agent: drafts from commits/projects → queue → X API

## v0.5 — Depth
- [ ] Revenue history chart (RevenueCat charts API)
- [ ] Subscriber split by entitlement
- [ ] Canvas assignments and due dates (Canvas API token)
- [ ] Agent tools: read files, run git log, query Sentry on demand
- [ ] Persist chat history to SQLite instead of localStorage
- [ ] Menu-bar mini view (MRR + crash-free + prod status)

## v0.6 — Automation
- [ ] Morning brief generated by Chief of Staff on launch
- [ ] Notifications when a production check fails or a new Sentry issue spikes
- [ ] Global shortcut to summon an agent
