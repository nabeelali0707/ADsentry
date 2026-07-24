from __future__ import absolute_import
import time

from . import fingerprint
from . import decoder


class BaseRecognizer(object):
    def __init__(self, dejavu):
        self.dejavu = dejavu
        self.Fs = fingerprint.DEFAULT_FS

    def _recognize(self, *data):
        matches = []
        for d in data:
            matches.extend(self.dejavu.find_matches(d, Fs=self.Fs))
        return self.dejavu.align_matches(matches)

    def recognize(self):
        pass  # base class does nothing


class FileRecognizer(BaseRecognizer):
    """
    Trimmed from upstream bcollazo/dejavu: MicrophoneRecognizer (which
    requires pyaudio/PortAudio — unavailable in this deployment without a
    native build toolchain) has been dropped since AdSentry only ever
    recognizes uploaded audio files, never live microphone input.
    """

    def __init__(self, dejavu):
        super(FileRecognizer, self).__init__(dejavu)

    def recognize_file(self, filename):
        frames, self.Fs = decoder.read(filename, self.dejavu.limit)

        t = time.time()
        match = self._recognize(*frames)
        t = time.time() - t

        if match:
            match['match_time'] = t

        return match

    def recognize(self, filename):
        return self.recognize_file(filename)
