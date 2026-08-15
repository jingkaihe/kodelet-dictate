# Kodelet dictate

Local speech-to-text dictation for the native Kodelet TUI. Audio is recorded and transcribed on the machine running the extension; only reviewed text is submitted to Kodelet.

## Installation

Requirements: Kodelet 0.5.33-beta or newer, Node.js 22 or newer, and a supported microphone backend.

Install from npm:

```bash
KODELET_SKIP_MCP_PLUGIN_INSTALL=1 \
npm install -g kodelet-dictate \
  --allow-scripts=kodelet-dictate,kodelet,koffi \
  --strict-allow-scripts
```

The allowlist permits Dictate to create its plugin wrapper and `koffi` to prepare the native transcription bridge. The Kodelet package's lifecycle script is covered by the policy but skips its unrelated MCP plugin installation.

To install directly from GitHub, keep a persistent checkout because the generated wrapper points to its compiled files:

```bash
git clone https://github.com/jingkaihe/kodelet-dictate.git \
  ~/.local/share/kodelet-dictate
(
  cd ~/.local/share/kodelet-dictate
  KODELET_SKIP_DICTATE_PLUGIN_INSTALL=1 \
  KODELET_SKIP_MCP_PLUGIN_INSTALL=1 \
    npm ci --strict-allow-scripts
  npm run install-extension
)
```

Check out a release tag or commit before `npm ci` to pin the GitHub installation. Do not use `--ignore-scripts`.

The npm postinstall hook creates this plugin wrapper:

```text
~/.kodelet/plugins/kodelet@dictate/extensions/dictate/kodelet-extension-dictate
```

Set `KODELET_SKIP_DICTATE_PLUGIN_INSTALL=1` to skip automatic installation. To regenerate the wrapper manually, run:

```bash
kodelet-dictate-install
```

Verify discovery:

```bash
kodelet extension list
kodelet extension inspect kodelet@dictate/dictate
```

Restart running Kodelet sessions after installation or upgrades.

## Usage

- Run `/dictate` to start recording.
- Press `Enter` to stop recording and transcribe locally, or `Esc` to cancel.
- Review and edit the transcription before submitting it as the next agent prompt.
- Press `Ctrl+R` in the review editor to record more speech and append it to the edited transcription.
- Run `/transcribe` to change the model, transcription language, microphone, or Chinese output style.

The first use asks for a preferred language and model. Model weights are downloaded from Hugging Face after confirmation, verified by size and SHA-256, and cached in the standard Hugging Face cache.

The interactive surfaces are currently available only in the native local Kodelet TUI. PvRecorder supports macOS on x64 and arm64, Linux on x64, and selected Raspberry Pi CPUs. Unsupported Linux arm64 systems report that the recorder backend is unavailable instead of attempting capture.

## Uninstall

```bash
npm uninstall -g kodelet-dictate
rm -rf ~/.local/share/kodelet-dictate \
  ~/.kodelet/plugins/kodelet@dictate
```
