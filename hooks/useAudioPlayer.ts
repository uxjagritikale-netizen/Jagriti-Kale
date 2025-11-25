import { useRef, useState, useEffect, useCallback } from 'react';

export const useAudioPlayer = (sampleRate = 24000) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  const init = useCallback(() => {
    if (!audioContextRef.current) {
      // Let the browser pick the hardware sample rate (usually 44.1k or 48k)
      // We will define the buffer sample rate as 24k later, and WebAudio resamples automatically.
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  }, []);

  const play = useCallback(async (base64Audio: string) => {
    if (!audioContextRef.current) return;
    
    // Decode base64 to binary
    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Convert PCM 16-bit LE to Float32
    const int16Data = new Int16Array(bytes.buffer);
    const float32Data = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768.0;
    }

    // Create buffer with the source sample rate (24000 for Gemini)
    const buffer = audioContextRef.current.createBuffer(1, float32Data.length, sampleRate);
    buffer.getChannelData(0).set(float32Data);

    // Create source
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);

    // Schedule playback
    const currentTime = audioContextRef.current.currentTime;
    
    // If we fell behind, reset the clock to now
    if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime;
    }
    
    source.start(nextStartTimeRef.current);
    
    // Advance the clock
    nextStartTimeRef.current += buffer.duration;
    
    // Track source for cleanup/stopping
    sourceNodesRef.current.push(source);
    
    source.onended = () => {
        sourceNodesRef.current = sourceNodesRef.current.filter(s => s !== source);
        if (sourceNodesRef.current.length === 0) setIsPlaying(false);
    };
    
    setIsPlaying(true);

  }, [sampleRate]);

  const stop = useCallback(() => {
    // Stop all currently playing nodes
    sourceNodesRef.current.forEach(node => {
        try { node.stop(); } catch(e) { /* ignore */ }
    });
    sourceNodesRef.current = [];
    
    // Reset time cursor
    if (audioContextRef.current) {
        nextStartTimeRef.current = audioContextRef.current.currentTime;
    }
    setIsPlaying(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
      return () => {
          stop();
          if (audioContextRef.current) {
              audioContextRef.current.close();
          }
      }
  }, [stop]);

  return { init, play, stop, isPlaying };
};