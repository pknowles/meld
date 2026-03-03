# Meld 3-Way Merge for VS Code

[![Install](https://img.shields.io/badge/VS%20Code-Install%20Extension-blue?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=pknowles.meld-auto-merge)
![Installs](https://img.shields.io/visual-studio-marketplace/i/pknowles.meld-auto-merge?style=flat-square)
![Rating](https://img.shields.io/visual-studio-marketplace/r/pknowles.meld-auto-merge)
![Build](https://github.com/pknowles/meld/actions/workflows/ci.yml/badge.svg)
![Verified](https://img.shields.io/badge/publisher-verified-brightgreen)
![License](https://img.shields.io/github/license/pknowles/meld)

![Meld Extension Three-Way View](./images/screenshot_meld_conflicteg.png)
*Boost developer productivity with an intuitive layout, clear connections, and automated resolutions that standard git tools miss.*

This extension brings the power of [Meld's](https://meldmerge.org/) intuitive frontend diff viewer and advanced auto-merge heuristics directly into Visual Studio Code. If you're looking for a dedicated 3-way merge tool and superior Git merge conflict resolution, this Visual Studio Code Git extension provides an unmatched developer experience.

## Table of Contents
- [Alpha Release Notice](#️-alpha-release-notice)
- [Installation](#installation)
- [Why Use This?](#why-use-this)
- [Features](#features)
- [How It Works](#how-it-works)
- [How to Use the Extension](#how-to-use-the-extension)
- [Configuration Settings](#configuration-settings)
- [Developer Setup](#developer-setup)
- [Credits](#credits)
- [License](#license)
- [Feedback & Support](#feedback--support)

## ⚠️ Alpha Release Notice

This extension is currently in **alpha**.

While the core Meld algorithms have been carefully ported and tested, the VS Code UI integration is under active development. Features may be incomplete, behavior may change without notice, and **bugs are expected**.

Please review your merges carefully and report any bugs you find!

Use at your own discretion.

## Installation

As this extension is currently in Alpha, it may not be published to the public VS Code Marketplace.

Currently, you must download the `.vsix` file from the [GitHub Releases](https://github.com/pknowles/meld/releases) page and install it manually:

1. Download the latest `meld-auto-merge*.vsix` file.
2. In VS Code, open the Extensions view (`Ctrl+Shift+X`).
3. Click the "..." menu in the top-right corner.
4. Select **Install from VSIX...**
5. Locate the downloaded file and click Install.

## Why Use This?

VS Code's built-in Git conflict resolution is excellent, but its standard interface can sometimes be visually noisy and challenging to navigate during complex merges:

![VS Code Default (noisy)](./images/screenshot_vscode_default.png)
*Standard VS Code 3-way view.*

Even the improved built-in 3-way view can still feel less intuitive than dedicated desktop tools like Meld:

![VS Code Three-Way View](./images/screenshot_vscode_threeway.png)
*Improved VS Code 3-way view.*

**Meld for VS Code** provides a cleaner, dedicated 3-way merge editor modeled right after the Meld application. Beyond the improved UI, it brings Meld's highly-tuned conflict resolution algorithm that is capable of:

- Resolving changes separated by whitespace.
- Handling complex insert/delete overlaps with unambiguous resolutions.
- Automatically interpolating conflict blocks to find common ground.

The end result? An intuitive merge experience that handles the tedious work for you.

![Teaser](./images/screenshot_meld_threeway.png)
*Conflict resolution made intuitive – Meld resolves conflicts automatically when VS Code cannot.*

## Features

### 🔀 3-Way Merge Editor
A seamless, visually distinct 3-way merge interface opening directly inside your editor for any conflicted files. See local, base, and remote versions side-by-side with clear connections to the merged output.

### ✨ Auto-Merge Conflicted Files
Manually trigger auto-merge at any time via the Command Palette: **"Meld: Auto-Merge Current File"**. This extracts the **LOCAL**, **BASE**, and **REMOTE** versions via Git and runs them through the Meld `AutoMergeDiffer`, applying the highly-optimized merged result to your editor.

### 🛠️ Quality of Life Git Tools (Source Control UI)
The extension contributes a **Meld Conflicted Files** view to the native Source Control (SCM) panel, displaying all current conflicts. Each file has inline actions:
- 🚀 **Checkout Conflicted (-m)**: Quickly reset a botched merge attempt in the active file back to its original conflicted state with `git checkout -m`. (Asks for confirmation)
- 🧠 **Rerere Forget File**: Tell Git to forget any automatically recorded resolution for the file using `git rerere forget`. (Asks for confirmation)
- ✅ **Smart Git Add**: A safer `git add` that verifies absolutely no conflict markers (`<<<<<<<`) remain in the file before staging it.
- 🔀 **Open 3-Way Merge Editor**: Opens the file in the custom Meld 3-way setup.

## How It Works

To ensure maximum performance and zero external dependencies, we have **ported Meld's core Python logic to pure TypeScript**.

This includes:
- **`myers.ts`**: A high-performance `O(NP)` diff algorithm with Meld's custom k-mer inline matching.
- **`diffutil.ts`**: Advanced sequence management and chunk tracking.
- **`merge.ts`**: The 3-way merge logic and powerful `AutoMergeDiffer` heuristics.

The logic runs entirely within the VS Code extension host process—no Python installation or background daemons required.

## How to Use the Extension

### From the Source Control Tab
1. Open a project that currently has Git merge conflicts.
2. Click on the Source Control icon in your Activity Bar (or press `Ctrl+Shift+G`).
3. Under the standard "Source Control" view, you will see a new collapsible section titled **Meld Merge : Conflicted Files**.
4. Expanding this tab will show a list of all files currently marked as conflicted.
5. Hover over any conflicted file in this list to reveal its inline action buttons:
   - 🔀 **Open Custom Merge** (`Meld: Open Custom Merge`): Opens the file in the dedicated 3-way interactive Meld interface.
   - 🚀 **Checkout Conflicted (-m)**: Quickly resets any botched manual merge attempts in the file back to its original raw conflicted state via `git checkout -m`.
   - 🧠 **Rerere Forget File**: Discards any saved `git-rerere` resolutions for the file.
   - ✅ **Git Add Resolved**: A "smart add" button that verifying absolutely no conflict markers (`<<<<<<<`, `======`, `>>>>>>>`) remain in the text before safely staging the file.

### From the Command Palette (`Ctrl+Shift+P`)
If you already have a conflicted file actively open in your regular VS Code editor:
1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to open the Command Palette.
2. Type **Meld: Open Custom Merge** and hit Enter.
3. The custom 3-way merge viewer will open up immediately for that file.
4. *(Optional)* Alternatively, you can run the **Meld: Auto-Merge Current File** command to bypass the UI entirely and let Meld's highly optimized algorithm attempt to resolve the merge automatically.

## Configuration Settings

You can customize the extension using the following VS Code settings (accessible via `File > Preferences > Settings`):

| Setting | Default | Description |
|---|---|---|
| `meld.mergeEditor.debounceDelay` | `300` | Delay in milliseconds before recomputing diff highlights while typing. |
| `meld.mergeEditor.syntaxHighlighting` | `true` | Enable or disable syntax highlighting in the merge editor. |

### Theme Colors

All diff highlight colors are fully themeable via the workbench `colorCustomizations` setting in your `settings.json`:

| Color Token | Default | Description |
|---|---|---|
| `meldMerge.diffInsertBackground` | `#00c80026` | Background for inserted lines. |
| `meldMerge.diffDeleteBackground` | `#00c80026` | Background for deleted lines. |
| `meldMerge.diffReplaceBackground` | `#0064ff26` | Background for replaced lines. |
| `meldMerge.diffReplaceInlineBackground` | `#0064ff59` | Highlight for inline changed text within replaced lines. |
| `meldMerge.diffConflictBackground` | `#ff000026` | Background for unresolved conflict lines. |
| `meldMerge.diffCurtainInsertFill` | `#00c80033` | Fill color for insert regions in the connecting curtain SVG. |
| `meldMerge.diffCurtainInsertStroke` | `#00c80080` | Stroke color for insert regions in the connecting curtain SVG. |
| `meldMerge.diffCurtainReplaceFill` | `#0064ff33` | Fill color for replace regions in the connecting curtain SVG. |
| `meldMerge.diffCurtainReplaceStroke` | `#0064ff80` | Stroke color for replace regions in the connecting curtain SVG. |
| `meldMerge.diffCurtainConflictFill` | `#ff000033` | Fill color for conflict regions in the connecting curtain SVG. |
| `meldMerge.diffCurtainConflictStroke` | `#ff000080` | Stroke color for conflict regions in the connecting curtain SVG. |

Example `settings.json` snippet to tweak colors:

```json
"workbench.colorCustomizations": {
    "meldMerge.diffConflictBackground": "#ff00001a",
    "meldMerge.diffInsertBackground": "#00ff001a"
}
```

## Developer Setup

To run this extension locally:

1. **Clone the repository** and open the root folder in VS Code.
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Compile the extension**:
   ```bash
   npm run compile
   ```
4. **Launch**: Press `F5` to open an "Extension Development Host" window with the extension loaded.

### Testing & Packaging

We use Jest to verify the TypeScript port against Meld's original Python logic:

```bash
npm test         # run unit tests
npm run lint     # lint and format check
npm run compile  # type-check
npx vsce package # build the .vsix
```

## Credits

This VS Code extension is authored and maintained by Pyarelal Knowles, 2026.

It is a port of the [Meld](https://meldmerge.org/) visual diff and merge tool,
originally written in Python. All credit for the core algorithm design, advanced
diffing heuristics, and 3-way merge logic and fantastic UI belongs to the
original Meld developers. This extension aims to bring their hard work and
excellent merge experience into the VS Code ecosystem.

## License

GPL Version 2; see [LICENSE](LICENSE).

## Feedback & Support

If you encounter a bug, have a feature request, or just want to share feedback, please file an issue on our GitHub repository at:  
[https://github.com/pknowles/meld/issues](https://github.com/pknowles/meld/issues)
