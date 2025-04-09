import Queue from "yocto-queue";
import { slice } from "audio-buffer-utils";

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
    this.bpm = bpm;
    this.beatsPerBar = beatsPerBar;
    this.numberOfBars = numberOfBars;
    this.beatLength = 1 / (bpm / 60);
    this.loopLength = this.beatLength * beatsPerBar * numberOfBars;
  }
  getNextLoopStart() {
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
    this.isRunning = true;
    this.startTime = this.audioContext.currentTime; //TODO: Add extra buffer?
    if (this.metronomeOn) this.startMetronome();
  }
  playAll() {
    if (!this.isRunning) this.start();
    for (let i = 0; i < this.audioTracks.length; i++) this.playTrack(i);
  }
  stopAll() {
    this.isRunning = false;
    this.stopMetronome();
    for (let i = 0; i < this.audioTracks.length; i++) this.stopTrack(i);
    for (const track of this.audioTracks) {
      console.log(track.schedule);
    }
  }
  startMetronome() {
    if (!(this.metronome instanceof AudioTrack)) {
      throw Error("Metronome not loaded");
    }
    this.metronome.scheduler(this.getNextLoopStart(), this.loopLength);
  }
  stopMetronome() {
    if (!(this.metronome instanceof AudioTrack)) {
      throw Error("Metronome not loaded");
    }
    this.metronome.stopScheduler();
  }
  playTrack(trackIndex: number) {
    const audioTrack = this.audioTracks[trackIndex];
    if (!audioTrack.buffer) return;
    if (!this.isRunning) this.start();
    audioTrack.scheduler(this.getNextLoopStart(), this.loopLength);
  }
  stopTrack(trackIndex: number) {
    const audioTrack = this.audioTracks[trackIndex];
    audioTrack.stopScheduler();
  }
  recordTrack(trackIndex: number) {
    const audioTrack = this.audioTracks[trackIndex];
    console.log(audioTrack);
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
      audioTrack.buffer = audio;
      const startSample =
        (waitTime + this.audioContext.outputLatency) *
        this.audioContext.sampleRate;
      const endSample =
        startSample + this.loopLength * this.audioContext.sampleRate;
      const sliced = slice(
        audio,
        (waitTime + this.audioContext.outputLatency) *
          this.audioContext.sampleRate,
      );
      audioTrack.buffer = sliced;

      const startTime = startLoop + this.loopLength;
      const firstRun = audioTrack.createSource(); // first playback is offset to catch first loop
      firstRun.start(
        this.audioContext.currentTime,
        this.audioContext.currentTime - startTime,
      );
      audioTrack.schedule.enqueue(firstRun);
      firstRun.addEventListener("ended", () => audioTrack.schedule.dequeue(), {
        once: true,
      });
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
    if (!this.buffer) throw Error("No buffer found");
    const source = this.audioContext.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.gain);
    return source;
  }
  scheduler(startTime: number, length: number) {
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
  stopScheduler() {
    const previousGain = this.gain.gain.value;
    this.gain.gain.value = 0;
    if (this.intervalId) clearInterval(this.intervalId);
    for (const source of this.schedule.drain()) {
      source.disconnect();
    }
    this.intervalId = null;
    this.gain.gain.value = previousGain;
  }
}

class Metronome {
  scheduled: Queue<[OscillatorNode, GainNode]>;
  audioContext: AudioContext;
  isPlaying: boolean;
  intervalId: ReturnType<typeof setInterval> | null;
  intervalTime: number;
  nextBeat: number;
  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
    this.scheduled = new Queue();
    this.isPlaying = false;
    this.intervalId = null;
    this.intervalTime = 500;
    this.nextBeat = audioContext.currentTime;
  }
  scheduleBeep(time: number) {
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.frequency.value = 700;
    gain.gain.value = 1;
    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    gain.gain.exponentialRampToValueAtTime(1, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    oscillator.start(time);
    oscillator.stop(time + 0.03);
    oscillator.addEventListener("ended", () => {
      this.scheduled.dequeue();
    });
    this.scheduled.enqueue([oscillator, gain]);
  }
  play(startTime: number, beatLength: number) {
    this.scheduleBeep(startTime);
    this.isPlaying = true;
    this.nextBeat = startTime + beatLength;
    this.intervalId = setInterval(() => {
      if (this.scheduled.size < 4) {
        this.scheduleBeep(this.nextBeat);
        this.nextBeat += beatLength;
      }
    }, this.intervalTime);
  }
  stop() {
    for (const [, gain] of this.scheduled.drain()) {
      gain.disconnect();
    }
    if (this.intervalId !== null) clearInterval(this.intervalId);
  }
}
