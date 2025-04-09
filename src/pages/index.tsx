import { useState } from "react";
import LoopStation from "@/audio";
import App from "./app";

export default function Start() {
  const [loopStation, setLoopStation]: [
    LoopStation | undefined,
    (loopStation: LoopStation) => void,
  ] = useState();

  function init() {
    try {
      if (!AudioContext) throw Error("Browser is unsupported");
      const audioContext = new AudioContext({ latencyHint: "interactive" });
      navigator.mediaDevices
        .getUserMedia({
          audio: {
            noiseSuppression: false,
            echoCancellation: false,
            autoGainControl: true,
          },
        })
        .then((stream) => setLoopStation(new LoopStation(audioContext, stream)))
        .catch(() => {
          throw Error("Must allow access to microphone for app to function");
        });
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <main>
      {!loopStation ? (
        <button onClick={init}>Start</button>
      ) : (
        <App loopStation={loopStation} />
      )}
    </main>
  );
}
