# Kodelet dictate

Local speech-to-text dictation for the native Kodelet TUI. Audio is recorded and transcribed on the machine running the extension; only reviewed text is submitted to Kodelet.

## Installation

Requirements: Kodelet 0.5.33-beta or newer, Node.js 22 or newer, and a supported microphone backend.

Install from npm:

```bash
npm install -g kodelet-dictate --allow-scripts=kodelet-dictate
```

Or install directly from GitHub into a persistent prefix. This keeps the package available to the generated wrapper without adding it to an unrelated project's dependencies:

```bash
mkdir -p ~/.local/share/kodelet-dictate
npm install --prefix ~/.local/share/kodelet-dictate \
  git+https://github.com/jingkaihe/kodelet-dictate.git
```

Append `#COMMIT` to the GitHub URL to pin a specific commit. npm runs the package's `prepare` build and then the same postinstall hook. Do not use `--ignore-scripts`.

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

## Development

From a checkout, install dependencies and run the checks:

```bash
KODELET_SKIP_DICTATE_PLUGIN_INSTALL=1 npm install
npm run check
npm run build
```

Install the development build into the global Kodelet plugin directory:

```bash
npm run install-extension
```

Create the publishable tarball:

```bash
npm pack
```

## Uninstall

```bash
npm uninstall -g kodelet-dictate
rm -rf ~/.kodelet/plugins/kodelet@dictate
```
