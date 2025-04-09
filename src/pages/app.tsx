import LoopStation from "@/audio";

export default function App({ loopStation }: { loopStation: LoopStation }) {
  console.log(loopStation);
  return (
    <div className="flex flex-col gap-5">
      <button onClick={() => loopStation.start()}>start</button>
      <button onClick={() => loopStation.playAll()}>play all</button>
      <button onClick={() => loopStation.stopAll()}>stop</button>
      <button onClick={() => loopStation.recordTrack(0)}>record track1</button>
      <button onClick={() => loopStation.recordTrack(1)}>record track2</button>
      <button onClick={() => loopStation.recordTrack(2)}>record track3</button>
    </div>
  );
}
