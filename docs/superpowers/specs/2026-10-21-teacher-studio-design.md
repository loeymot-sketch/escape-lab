# Teacher Studio — design (2026-10-21)

## Goal (owner, 2026-10-21)
Give teachers a real authoring and results space before the upcoming laboratories open: create and edit rooms, add questions,
upload an image, write choices and **trap answers**, place a **click zone on a photo with a pixel tolerance** (for example 5 px),
and see **every student's results**. It must be convincing in a live faculty demonstration.

## Decision: a parallel, teacher-owned room system
The ten built-in missions are a hardened, tested catalogue (fragments, exit codes, badges, competencies, analytics all key off it).
Making that catalogue editable would put every existing guarantee at risk. Teacher rooms therefore live in their own tables and
their own play flow, with the same server-authoritative rules (keys never leave the server, scoring on the server, snapshots).
A teacher who wants to change a built-in mission **imports it as a room** and edits the copy.

## Data model (migration 8)
- `media`: uploaded images (PNG / JPEG / WebP / GIF, magic bytes and dimensions checked on the server, at most 4 MB),
  random 128-bit ids, served publicly by id (capability URL) with strict headers. SVG is refused (script risk).
- `rooms`: one JSON document per room (validated on every write), `status` draft / published / archived, `version` for
  optimistic concurrency, `assign_all` or `room_classes` for who can play it.
- `room_attempts`: a **snapshot of the room document** taken at start, so editing a published room never breaks an attempt in
  progress or rewrites past results; per-attempt shuffled order.
- `room_answers`: every submitted answer (correctness, trap hit, earned points, raw response) for the results views and the heatmap.

## Question types
choice (single or multiple answers, per-option feedback, **trap options**), true/false, short text (accepted answers, accents and
case folded, optional one-typo tolerance), number (value, tolerance, unit), **hotspot** (circle or rectangle zones in the image's
natural pixels, a tolerance in pixels, trap zones, "any" or "all" zones, a mandatory text alternative listing labelled zones for
non-visual learners), order, match.

## Modes
- **escape**: retry until correct, each solved question reveals a fragment of the room's vault code, the room ends when the code is
  entered. Score: points × (1 − 25 % per wrong try − 10 % per hint − 15 % per trap hit), never below 0.
- **exam**: one answer per question, partial credit for multiple choice, order, match and "all zones" hotspots, no feedback until the end
  unless the teacher allows it.

## Teacher surfaces
Studio list (cards, status, attempts, average), room editor (settings, cover, question list with reorder, per-type editors, hotspot
zone editor with live tolerance ring and test clicks), **quality check** (deterministic lint: missing explanation, trap without
feedback, tiny zones, alt text, answer position bias…), preview as a student (server check, nothing recorded), results (attempts
table, per-question success, trap rates, option distribution, hotspot click heatmap, per-student answers, CSV export).

## Student surfaces
"Teacher rooms" page and a full-screen player (timer, fragments, hints, trap feedback, explanations, vault, result review).

## Out of scope
Changing the built-in catalogue in place; AI-generated questions (no provider in the demo); real-time multiplayer.
