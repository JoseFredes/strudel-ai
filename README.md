# Strudel AI

A desktop live-coding environment for electronic music, powered by [Strudel](https://strudel.cc) and OpenAI.

Write and edit Strudel patterns in a code editor, then use natural-language chat to let GPT-4o compose or modify them in real time — while the music keeps playing.

![screenshot placeholder](./docs/screenshot.png)

## Features

- **Live code editor** with CodeMirror 6 and syntax highlighting
- **AI chat** — describe what you want and GPT-4o rewrites the pattern: *"add a rolling bassline in C minor"*, *"make the hats faster and more panned"*
- **Revert** any AI change with one click
- **BPM slider** that reads and patches `setcps()` directly in the code
- **Built-in examples** — deep house, driving techno, acid 303, minimal dub
- **Persistent state** — editor code and chat history survive restarts (localStorage)
- **Desktop app** via Tauri 2 (Mac, Windows, Linux)

## Stack

| Layer | Tech |
|---|---|
| Desktop shell | Tauri 2 (Rust) |
| Frontend | TypeScript + Vite |
| Code editor | CodeMirror 6 |
| Audio engine | Strudel / TidalCycles (WebAudio) |
| AI backend | OpenAI GPT-4o via Rust `reqwest` |

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- [Rust](https://rustup.rs) (stable)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS

### Run in development

```bash
git clone https://github.com/JoseFredes/strudel-ai.git
cd strudel-ai
npm install
npm run tauri dev
```

### Using AI generation

Paste your OpenAI API key in the key field at the top right of the app, or set it in a `.env.local` file:

```
VITE_OPENAI_API_KEY=sk-...
```

Then type a prompt in the chat panel and press **Enter** or **✨ Add**.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + Enter` | Evaluate and play |
| `Enter` (chat) | Send prompt |
| `Shift + Enter` (chat) | Newline in prompt |

## License

MIT
