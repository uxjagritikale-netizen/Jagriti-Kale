import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AspectRatio, InterviewPhase } from './types';
import { GeminiLiveService } from './services/geminiLive';
import { useAudioProcessor } from './hooks/useAudioProcessor';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { VideoCanvas } from './components/VideoCanvas';
import { Button } from './components/Button';
import { Play, Square, Download, Mic, MicOff, Settings, Video, WifiOff } from 'lucide-react';

const App: React.FC = () => {
  const [phase, setPhase] = useState<InterviewPhase>('setup');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.SixteenNine);
  const [currentQuestion, setCurrentQuestion] = useState<string>("Waiting for interview to start...");
  const [isConnected, setIsConnected] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  
  // New state to manage the shared audio stream
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  const geminiService = useRef(new GeminiLiveService());
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  
  // Track if the next text chunk starts a new turn
  const isNewTurnRef = useRef(true);

  // --- Audio Output (AI Voice) ---
  // Initialize player with 24000Hz (standard for Gemini Flash Native Audio)
  const audioPlayer = useAudioPlayer(24000);

  // --- Audio Input (Microphone) ---
  // We only process audio for AI if we are connected. Note: Microphone stream itself is managed manually.
  const isAudioActive = phase === 'interview' && isConnected;

  const handleAudioData = useCallback((base64: string) => {
    // Only send data if mic is technically "on" from UI perspective, 
    // although useAudioProcessor handles processing, we double check here.
    if (isMicOn && geminiService.current) {
      geminiService.current.sendAudioChunk(base64);
    }
  }, [isMicOn]);

  useAudioProcessor(audioStream, isAudioActive, handleAudioData);

  // --- Stream Management ---
  useEffect(() => {
    // Handle Microphone Muting by disabling the track, this ensures it's muted for both AI and Recording
    if (audioStream) {
      audioStream.getAudioTracks().forEach(track => {
        track.enabled = isMicOn;
      });
    }
  }, [isMicOn, audioStream]);

  // --- Gemini Callbacks ---
  
  const handleAiAudio = useCallback((base64: string) => {
    audioPlayer.play(base64);
  }, [audioPlayer]);

  // --- Controls ---

  const startInterview = async () => {
    // Initialize Audio Context (must be done after user gesture)
    audioPlayer.init();
    setVideoUrl(null);
    setRecordedChunks([]);
    
    setPhase('interview');
    setCurrentQuestion("Connecting to AI Interviewer...");
    isNewTurnRef.current = true;
    
    try {
      // 1. Get Audio Stream FIRST - Shared between AI and Recorder
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      setAudioStream(stream);

      // 2. Connect to Gemini
      await geminiService.current.connect(
        (text) => {
            // When new text arrives, if it's a new turn, replace the old question.
            setCurrentQuestion(prev => {
               if (isNewTurnRef.current) {
                   isNewTurnRef.current = false;
                   return text;
               }
               return prev + text;
            });
        },
        handleAiAudio,
        (err) => {
          console.error(err);
          setCurrentQuestion("Connection Error. Please restart.");
          // Don't auto-close immediately, let user see error or retry
        },
        () => {
          // Turn complete or interrupted: 
          isNewTurnRef.current = true;
          audioPlayer.stop();
        },
        () => {
          // onClose callback
          console.log("Session disconnected");
          setIsConnected(false);
          // If purely accidental disconnect during interview, we might want to alert user
          // But usually this happens at end. 
        }
      );

      setIsConnected(true);
      setCurrentQuestion("Hello! I'm your design interviewer. Can you start by telling me a little bit about yourself and your background in product design?");
      
      // 3. Start Recording (using the same audio stream)
      startRecording(stream);

    } catch (e) {
      console.error("Failed to start interview", e);
      setCurrentQuestion("Failed to access microphone or connect. Please check permissions.");
      // Cleanup if failed half-way
      if (audioStream) {
        audioStream.getTracks().forEach(t => t.stop());
        setAudioStream(null);
      }
    }
  };

  const endInterview = async () => {
    stopRecording();
    audioPlayer.stop();
    
    if (geminiService.current) {
      await geminiService.current.disconnect();
    }
    
    // Stop Microphone Stream
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      setAudioStream(null);
    }

    setIsConnected(false);
    setPhase('review');
  };

  // --- Recording Logic ---
  const handleCanvasStream = useCallback((stream: MediaStream) => {
    canvasStreamRef.current = stream;
  }, []);

  const startRecording = (micStream: MediaStream) => {
    if (!canvasStreamRef.current) return;
    
    // Combine video from canvas and audio from mic
    const combinedStream = new MediaStream([
      ...canvasStreamRef.current.getVideoTracks(),
      ...micStream.getAudioTracks()
    ]);

    const recorder = new MediaRecorder(combinedStream, { 
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 2500000 // 2.5 Mbps
    });
    
    mediaRecorder.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        setRecordedChunks(prev => [...prev, e.data]);
      }
    };

    // Start with 1000ms timeslice to ensure we capture data incrementally 
    // and don't lose everything if browser crashes or session is long.
    recorder.start(1000); 
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
  };

  useEffect(() => {
    if (phase === 'review' && recordedChunks.length > 0) {
      const finalBlob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(finalBlob);
      setVideoUrl(url);
    }
  }, [phase, recordedChunks]);

  // --- Render Helpers ---

  const getContainerDimensions = () => {
    switch (aspectRatio) {
      case AspectRatio.NineSixteen: return "max-w-sm aspect-[9/16]";
      case AspectRatio.SixteenNine: return "max-w-4xl aspect-[16/9]";
      case AspectRatio.ThreeFour: return "max-w-md aspect-[3/4]";
      case AspectRatio.OneOne: return "max-w-xl aspect-square";
      default: return "max-w-4xl aspect-[16/9]";
    }
  };

  return (
    <div className="min-h-screen bg-pastel-stone text-slate-800 font-sans selection:bg-rose-200">
      
      {/* Header */}
      <header className="px-6 py-4 bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-stone-200 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-white">
            <Video size={18} />
          </div>
          <h1 className="font-serif text-xl font-bold tracking-tight text-slate-900">DesignLens AI</h1>
        </div>
        {phase === 'interview' && (
           <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium transition-colors ${isConnected ? 'bg-rose-50 text-rose-600' : 'bg-stone-100 text-stone-500'}`}>
             {isConnected ? (
                <>
                  <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></div>
                  Live Session
                </>
             ) : (
                <>
                  <WifiOff size={14} />
                  Disconnected
                </>
             )}
           </div>
        )}
      </header>

      <main className="container mx-auto px-4 py-8 flex flex-col items-center">
        
        {/* Setup Phase */}
        {phase === 'setup' && (
          <div className="w-full max-w-2xl text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="space-y-4">
              <h2 className="text-4xl font-serif font-bold text-slate-900">Master Your Product Design Interview</h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                Practice with an AI interviewer that listens, adapts, and speaks with you in real-time. 
                Choose your recording format and begin.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-100 space-y-6">
              <h3 className="text-lg font-medium flex items-center justify-center gap-2">
                <Settings size={20} /> Select Aspect Ratio
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.values(AspectRatio).map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      aspectRatio === ratio 
                        ? 'border-slate-800 bg-slate-50 text-slate-900' 
                        : 'border-stone-200 hover:border-slate-300 text-stone-500'
                    }`}
                  >
                    <div className="text-xl font-bold mb-1">{ratio}</div>
                    <div className="text-xs opacity-70">
                       {ratio === "9:16" ? "Mobile Story" : 
                        ratio === "16:9" ? "Desktop/Web" : 
                        ratio === "3:4" ? "Tablet" : "Square"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={startInterview} className="mx-auto text-lg px-8 py-4 shadow-xl shadow-rose-100">
              <Play size={20} fill="currentColor" /> Start Interview
            </Button>
          </div>
        )}

        {/* Interview Phase */}
        {phase === 'interview' && (
          <div className="w-full flex flex-col items-center space-y-6 animate-in zoom-in-95 duration-500">
            
            <div className={`relative rounded-2xl overflow-hidden shadow-2xl ring-8 ring-white ${getContainerDimensions()} bg-black transition-all duration-500`}>
              <VideoCanvas 
                aspectRatio={aspectRatio} 
                onStreamReady={handleCanvasStream}
                className="w-full h-full"
              />
              
              {/* Elegant Overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/90 via-black/40 to-transparent pt-24 flex flex-col items-center text-center pointer-events-none">
                <h3 className="text-white/80 text-sm font-medium uppercase tracking-widest mb-3 font-serif">
                  Interviewer
                </h3>
                <p className="text-white text-xl md:text-2xl font-medium leading-snug drop-shadow-lg max-w-3xl">
                  "{currentQuestion}"
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-6 bg-white p-4 rounded-full shadow-lg border border-stone-100">
              <button 
                onClick={() => setIsMicOn(!isMicOn)}
                className={`p-4 rounded-full transition-colors ${isMicOn ? 'bg-slate-100 text-slate-900' : 'bg-rose-100 text-rose-600'}`}
                title={isMicOn ? "Mute Microphone" : "Unmute Microphone"}
              >
                {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
              </button>

              <div className="w-px h-8 bg-stone-200"></div>

              <Button variant="danger" onClick={endInterview}>
                <Square size={18} fill="currentColor" /> End Session
              </Button>
            </div>
            
            {!isConnected && (
                <div className="bg-amber-50 text-amber-800 px-4 py-2 rounded-lg text-sm border border-amber-200">
                   Session disconnected. Click 'End Session' to save your recording.
                </div>
            )}
          </div>
        )}

        {/* Review Phase */}
        {phase === 'review' && (
          <div className="w-full max-w-3xl text-center space-y-8 animate-in fade-in slide-in-from-bottom-8">
            <h2 className="text-3xl font-serif font-bold text-slate-900">Interview Complete</h2>
            <p className="text-slate-600">Great job! Review your session below or download it to your device.</p>

            <div className={`mx-auto bg-black rounded-xl overflow-hidden shadow-2xl ${getContainerDimensions()}`}>
              {videoUrl ? (
                <video src={videoUrl} controls className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/50">Processing video...</div>
              )}
            </div>

            <div className="flex justify-center gap-4">
              <Button variant="secondary" onClick={() => window.location.reload()}>
                Start New Session
              </Button>
              {videoUrl && (
                <a href={videoUrl} download={`design-interview-${new Date().toISOString()}.webm`}>
                  <Button>
                    <Download size={20} /> Download Video
                  </Button>
                </a>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;