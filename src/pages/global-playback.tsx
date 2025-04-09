import { useEffect, useState } from "react";
import { PlaybackInformation } from "./loopstation";

export default function GlobalPlayback({
  audioBuffers,
  audioContext,
  playbackInformation,
  setPlaybackInformation,
}: {
  audioBuffers: AudioBuffer[];
  audioContext: AudioContext;
  playbackInformation: PlaybackInformation;
  setPlaybackInformation: (playback: PlaybackInformation) => void;
}) {
  const [bpm, setBpm] = useState(playbackInformation.bpm);
  const [beatsPerBar, setBeatsPerBar] = useState(
    playbackInformation.beatsPerBar,
  );
  const [numBars, setNumBars] = useState(playbackInformation.numBars);

  useEffect(() => {
    setPlaybackInformation(new PlaybackInformation(bpm, beatsPerBar, numBars));
  }, [bpm, beatsPerBar, numBars]);

  function playAll() {
    audioBuffers.forEach((buffer) => {
      if (!buffer) return;
    });
  }

  return (
    <div>
      <input
        type="number"
        name="bpm"
        min="50"
        max="300"
        value={bpm}
        onChange={(e) => setBpm(+e.target.value)}
      />
      <input
        type="number"
        name="beats per bar"
        min="1"
        max="16"
        value={beatsPerBar}
        onChange={(e) => setBeatsPerBar(+e.target.value)}
      />
      <input
        type="number"
        name="number of bars"
        min="1"
        max="32"
        value={numBars}
        onChange={(e) => setNumBars(+e.target.value)}
      />
      <button onClick={() => playAll()}>Play</button>
    </div>
  );
}
