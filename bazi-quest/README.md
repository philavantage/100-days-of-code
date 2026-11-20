# ⚔️ Bazi Quest

A pixel-art RPG character sheet + an **Oracle Owl** chat that uses your *anonymized* bazi (Four Pillars) chart and your skill levels to suggest cool things to build.

- **Scene:** an animated side-scrolling world. Your character's look depends on your day-master element, the sky on your strongest element, and element orbs orbit you sized by your balance. Arrow keys / click to walk, space to jump, click the owl to talk.
- **Character Info:** level, HP/MP/EXP and five element stats come from your skills and chart.
- **Skills:** raise or lower levels, learn new skills. Levels give EXP.
- **Oracle chat:** Claude (`claude-opus-5-5`) streams project ideas as **quest cards**. Click *Accept quest* to add one to your Quest Log, and *Done* to get +250 EXP. With no API key it falls back to a built-in offline idea generator.

## Run it

```bash
cd bazi-quest
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # optional; without it the Oracle runs offline
npm start                              # → http://localhost:5173
```

## Use your own bazi file

Either:
1. **Server:** copy `data/bazi.example.json` to `data/bazi.json` and fill in your chart. `data/bazi.json` is git-ignored. Or
2. **Browser:** click **Import Bazi**. The file is parsed and anonymized in your browser, and a preview shows exactly what is kept and which fields were discarded.

Accepted formats (JSON): `pillars` as `{year, month, day, hour}`, an array, or a string. Each pillar can be `"甲子"`, `"Jia Zi"` or `{stem, branch}`. You can also give `dayMaster` plus `elements` counts instead of pillars. `strength` and `favorable` are optional.

## Privacy model

`public/lib/anonymize.js` uses a **whitelist**. It builds a new object with only:
alias (generated), day-master element and polarity, five-element percentages, strongest/weakest/missing element, archetype, and optionally strength and favorable elements.
Names, birth date, time and place, emails and any unknown field are never copied.

- **Elements only** (default): this is all Claude sees. The pillars are left out because the four pillars can be reverse-engineered into a short list of possible birth dates.
- **+ pillars:** also sends the 8 stem and branch characters.

The server runs the same anonymizer again on every chat request, so even a modified client can't send more than this. Your API key stays on the server.

## Files

| Path | What |
|---|---|
| `server.js` | Static server, `/api/profile`, streaming `/api/chat` (Anthropic SDK) |
| `public/lib/anonymize.js` | Bazi parser + anonymizer (shared by browser & server) |
| `public/lib/ideas-offline.js` | Offline idea generator |
| `public/sprites.js` | Original pixel sprites + animated canvas scene |
| `public/app.js`, `index.html`, `style.css` | UI |
| `data/skills.json` | Starting skills (edit freely; in-app edits are saved in localStorage) |
