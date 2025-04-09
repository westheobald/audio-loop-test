import { useState } from "react";
import GlobalPlayback from "./global-playback";

export default function LoopStation({
  audioContext,
  microphoneStream,
}: {
  audioContext: AudioContext;
  microphoneStream: MediaStream;
}) {
  const [audioBuffers, setAudioBuffers]: [
    AudioBuffer[],
    (audioBuffer: AudioBuffer[]) => void,
  ] = useState(new Array(5));
  const [playbackInformation, setPlaybackInformation]: [
    PlaybackInformation,
    (playback: PlaybackInformation) => void,
  ] = useState(new PlaybackInformation(100, 2, 4));
  return (
    <div>
      <GlobalPlayback
        audioContext={audioContext}
        audioBuffers={audioBuffers}
        playbackInformation={playbackInformation}
        setPlaybackInformation={setPlaybackInformation}
      />
    </div>
  );
}
export class PlaybackInformation {
  bpm: number;
  numBars: number;
  beatsPerBar: number;
  beatLength: number;
  loopLength: number;
  startTime: number | undefined;
  isPlaying: boolean;
  isRecording: boolean;
  metronomeOn: boolean;
  constructor(bpm: number, numBars: number, beatsPerBar: number) {
    this.bpm = bpm;
    this.numBars = numBars;
    this.beatsPerBar = beatsPerBar;
    this.beatLength = 1 / (this.bpm / 60); // in seconds
    this.loopLength = this.beatLength * this.beatsPerBar * this.numBars; // in seconds

    this.startTime;
    this.isPlaying = false;
    this.isRecording = false;
    this.metronomeOn = true;
    // this.metronome = new Metronome(this.audioContext);
  }
}
