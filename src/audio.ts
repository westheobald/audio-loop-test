import Queue from "yocto-queue";
import { slice } from "audio-buffer-utils"; // TODO: declaration file ts?

export default class LoopStation {
  audioContext: AudioContext;
  microphoneStream: MediaStream;
  bpm: number;
  beatLength: number;
  beatsPerBar: number;
  numberOfBars: number;
  loopLength: number;
  startTime: number;
  isRunning: boolean;
  metronome: AudioTrack;
  metronomeOn: boolean;
  countIn: boolean;
  audioTracks: AudioTrack[];
  constructor(audioContext: AudioContext, stream: MediaStream) {
    this.audioContext = audioContext;
    this.microphoneStream = stream;

    this.bpm = 60;
    this.beatsPerBar = 4;
    this.numberOfBars = 1;
    this.beatLength = 1 / (this.bpm / 60); // in seconds
    this.loopLength = this.beatLength * this.beatsPerBar * this.numberOfBars; // in seconds
    this.startTime = audioContext.currentTime;
    this.isRunning = false;

    this.metronomeOn = true;
    this.countIn = false;
    this.metronome = this.createMetronome();
    this.audioTracks = new Array(5)
      .fill(undefined)
      .map(
        (_, i) => new AudioTrack(i, this.audioContext, this.microphoneStream),
      );
  }
  createMetronome() {
    // creates an audio buffer containing rotating sine wave and silence set to bpm
    const sampleRate = this.audioContext.sampleRate;
    const samples = this.loopLength * sampleRate;
    const buffer = this.audioContext.createBuffer(1, samples, sampleRate);
    const channelData = buffer.getChannelData(0);
    const noiseSamples = 0.03 * sampleRate;
    const silenceSamples = (this.beatLength - 0.03) * sampleRate;

    let currentSample = 0;
    while (currentSample < samples) {
      for (let i = 0; i < noiseSamples && currentSample < samples; i++) {
        channelData[currentSample] = Math.sin(
          (2 * Math.PI * 500 * i) / sampleRate,
        );
        currentSample++;
      }
      for (let i = 0; i < silenceSamples && currentSample < samples; i++) {
        channelData[currentSample] = 0; // Silence (0)
        currentSample++;
      }
    }

    const audioTrack = new AudioTrack(
      -1,
      this.audioContext,
      this.microphoneStream,
    );
    audioTrack.buffer = buffer;
    return audioTrack;
  }
  adjustSong(bpm: number, beatsPerBar: number, numberOfBars: number) {
    // used for adjusting tempo/loop length state when editing UI
    this.bpm = bpm;
    this.beatsPerBar = beatsPerBar;
    this.numberOfBars = numberOfBars;
    this.beatLength = 1 / (bpm / 60);
    this.loopLength = this.beatLength * beatsPerBar * numberOfBars;
  }
  getNextLoopStart() {
    // get the next start time for the loop
    const currentTime = this.audioContext.currentTime;
    if (currentTime <= this.startTime) return this.startTime;
    const currentLoopsCompleted = Math.floor(
      (currentTime - this.startTime) / this.loopLength,
    );
    const nextLoop =
      (currentLoopsCompleted + 1) * this.loopLength + this.startTime;
    return nextLoop;
  }
  start() {
    // reset start time and turn on metronome if enabled
    this.isRunning = true;
    this.startTime = this.audioContext.currentTime; //TODO: Add extra buffer?
    if (this.metronomeOn) this.startMetronome();
  }
  playAll() {
    // start looper if off and play all recorded audio tracks
    if (!this.isRunning) this.start();
    for (let i = 0; i < this.audioTracks.length; i++) this.playTrack(i);
  }
  stopAll() {
    // stop metronome and all audio tracks
    this.isRunning = false;
    this.stopMetronome();
    for (let i = 0; i < this.audioTracks.length; i++) this.stopTrack(i);
  }
  startMetronome() {
    this.metronome.scheduleLoop(this.getNextLoopStart(), this.loopLength);
  }
  stopMetronome() {
    this.metronome.stopLoop();
  }
  playTrack(trackIndex: number) {
    // play and loop given audio track (starts at next loop start currently)
    // TODO: Start immediately? Or next loop
    const audioTrack = this.audioTracks[trackIndex];
    if (!audioTrack.buffer) return;
    if (!this.isRunning) this.start();
    audioTrack.scheduleLoop(this.getNextLoopStart(), this.loopLength);
    // TODO: Might need to run one truncated playthrough before loop, see extra buffer for start
  }
  stopTrack(trackIndex: number) {
    // stop given audio track and any queued loops
    const audioTrack = this.audioTracks[trackIndex];
    audioTrack.stopLoop();
  }
  recordTrack(trackIndex: number) {
    // record audio track (starting at next loop) then begin playing loop
    const audioTrack = this.audioTracks[trackIndex];
    const recorder = new MediaRecorder(this.microphoneStream);
    if (!this.isRunning) this.start();
    if (audioTrack.intervalId) this.stopTrack(trackIndex);
    const startLoop = this.getNextLoopStart();

    const waitTime = startLoop - this.audioContext.currentTime;
    recorder.start();
    setTimeout(
      () => recorder.stop(),
      (waitTime + this.loopLength * this.numberOfBars) * 1000,
    );
    recorder.addEventListener("dataavailable", async (ev) => {
      const array = await ev.data.arrayBuffer();
      const audio = await this.audioContext.decodeAudioData(array);
      if (!this.audioContext.outputLatency) {
        console.error("Output latency not detected, synchonization may be off");
      }
      const latency =
        this.audioContext.outputLatency ?? this.audioContext.baseLatency;
      const startSample = (waitTime + latency) * this.audioContext.sampleRate;
      const endSample =
        startSample + this.loopLength * this.audioContext.sampleRate;
      const sliced = slice(audio, startSample, endSample);
      audioTrack.buffer = sliced;
      if (!audioTrack.buffer) throw Error("No audio buffer");
      audioTrack.scheduleOne(
        this.audioContext.currentTime,
        audioTrack.getStartOffset(this.getNextLoopStart()),
      );
      this.playTrack(trackIndex);
    });
  }
}

class AudioTrack {
  id: number;
  audioContext: AudioContext;
  microphoneStream: MediaStream;
  buffer: AudioBuffer | undefined;
  gain: GainNode;
  pan: StereoPannerNode;
  schedule: Queue<AudioBufferSourceNode>;
  nextTime: number;
  intervalId: ReturnType<typeof setInterval> | null;
  constructor(
    id: number,
    audioContext: AudioContext,
    microphoneStream: MediaStream,
  ) {
    this.id = id;
    this.audioContext = audioContext;
    this.microphoneStream = microphoneStream;
    this.buffer = undefined;
    this.gain = this.audioContext.createGain();
    this.pan = this.audioContext.createStereoPanner();
    this.gain.connect(this.pan);
    this.pan.connect(audioContext.destination);
    this.schedule = new Queue();
    this.intervalId = null;
    this.nextTime = 0;
  }
  createSource() {
    // create new source buffer node and conenct to audio chain
    // reason: source can only be started once
    if (!this.buffer) throw Error("No buffer found");
    const source = this.audioContext.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.gain);
    return source;
  }
  scheduleLoop(startTime: number, length: number) {
    // loop audio track starting from startTime
    // stays one queued audio source ahead of playback to prevent
    // timing issues
    if (this.intervalId) throw Error("Already playing");
    this.nextTime = startTime;
    const addToQueue = () => {
      const source = this.createSource();
      source.start(this.nextTime);
      this.schedule.enqueue(source);
      source.addEventListener("ended", () => this.schedule.dequeue(), {
        once: true,
      });
      this.nextTime += length;
    };
    addToQueue(); // will stay one ahead of playback
    addToQueue();
    this.intervalId = setInterval(addToQueue, length * 1000);
  }
  scheduleOne(startTime: number, startOffset: number) {
    // play one playthrough of audio track from startOffset (in seconds)
    // beginning at startTime
    const firstRun = this.createSource();
    firstRun.start(startTime, startOffset);
    this.schedule.enqueue(firstRun);
    firstRun.addEventListener("ended", () => this.schedule.dequeue(), {
      once: true,
    });
  }
  stopLoop() {
    // immediately muted gain node, stop interval, and disconnect
    // all queued source nodes
    const previousGain = this.gain.gain.value;
    this.gain.gain.value = 0;
    if (this.intervalId) clearInterval(this.intervalId);
    for (const source of this.schedule.drain()) {
      source.disconnect();
    }
    this.intervalId = null;
    this.gain.gain.value = previousGain;
  }
  getStartOffset(nextLoopStart: number) {
    // return start offset for the buffer so that buffer ends a nextLoopStart
    if (!this.buffer) {
      throw Error(`No audio buffer found for track: ${this.id}`);
    }
    const offset =
      this.buffer.duration - (nextLoopStart - this.audioContext.currentTime);
    console.log(offset);
    return offset;
  }
}
