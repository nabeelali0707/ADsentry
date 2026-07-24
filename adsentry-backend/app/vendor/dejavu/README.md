# Vendored: bcollazo/dejavu

Trimmed, compatibility-patched copy of https://github.com/bcollazo/dejavu (MIT
licensed, see LICENSE.md) — a SQLAlchemy/Postgres-based fork of the original
worldveil/dejavu audio fingerprinting library.

Vendored here (rather than installed via pip) because the upstream package is
unmaintained and doesn't import cleanly on current Python/SQLAlchemy/SciPy:

- `sqlalchemy.Binary` was removed in SQLAlchemy 2.0 — dropped from the
  unused import in `database.py`.
- `scipy.ndimage.filters` / `scipy.ndimage.morphology` submodule paths are
  deprecated — `fingerprint.py` now imports directly from `scipy.ndimage`.
- `matplotlib.pyplot` needs a non-interactive backend on headless deploy
  targets (Render/Railway) — `fingerprint.py` now calls `matplotlib.use('Agg')`
  before importing `pyplot`.
- `recognize.py` is a trimmed rewrite containing only `FileRecognizer` —
  upstream's `MicrophoneRecognizer` requires `pyaudio`/PortAudio, which needs
  a native build toolchain AdSentry never needs since it only recognizes
  uploaded audio files, never live microphone input.
- `Song`/`Fingerprint` tables are named `dejavu_songs` / `dejavu_fingerprints`
  (upstream hardcodes `songs/fingerprints`) so they can never collide with
  AdSentry's own tables in the same Postgres database.

Also requires the `audioop-lts` package installed alongside (stdlib `audioop`,
used transitively via pydub, was removed in Python 3.13).
