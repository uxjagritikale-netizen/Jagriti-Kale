import { useEffect, useRef } from 'react';
import { float32ToInt16, arrayBufferToBase64 } from '../services/geminiLive';

export const useAudioProcessor = (
  stream: MediaStream | null,
  isActive: boolean,
  onAudioData: (base64: string) => void
) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  useEffect(() => {
    if (isActive && stream && stream.active) {
      start(stream);
    } else {
      stop();
    }
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, stream]);

  const start = async (activeStream: MediaStream) => {
    try {
      // Create context with specific sample rate expected by Gemini (16kHz)
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000, 
      });

      // Create source from the passed-in stream
      sourceRef.current = audioContextRef.current.createMediaStreamSource(activeStream);
      
      // Use ScriptProcessor for raw PCM access
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      processorRef.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Downsample or just convert if context is already 16kHz
        const pcmInt16 = float32ToInt16(inputData);
        const base64 = arrayBufferToBase64(pcmInt16.buffer);
        onAudioData(base64);
      };

      sourceRef.current.connect(processorRef.current);
      
      // Connect to destination via a muted gain node to prevent feedback loop 
      // while keeping the audio graph active in Chrome (AudioContext needs a destination)
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = 0;
      processorRef.current.connect(gainNodeRef.current);
      gainNodeRef.current.connect(audioContextRef.current.destination);

    } catch (err) {
      console.error("Audio processing setup failed", err);
    }
  };

  const stop = () => {
    // Important: We do NOT stop the media stream tracks here because they are owned by the parent component (App.tsx)
    // We only tear down the audio processing graph.
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };
};