import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { MODEL_NAME, SYSTEM_INSTRUCTION } from "../constants";

export class GeminiLiveService {
  private client: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async connect(
    onTranscription: (text: string) => void,
    onAudioData: (base64Audio: string) => void,
    onError: (error: Error) => void,
    onTurnEnd: () => void,
    onClose: () => void
  ) {
    try {
      this.sessionPromise = this.client.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO], 
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          systemInstruction: SYSTEM_INSTRUCTION,
          outputAudioTranscription: {}, 
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Session Opened");
          },
          onmessage: (message: LiveServerMessage) => {
            // Handle transcription (The text overlay)
            const outputTx = message.serverContent?.outputTranscription?.text;
            if (outputTx) {
              onTranscription(outputTx);
            }
            
            // Handle Turn Completion or Interruption to reset text buffer
            if (message.serverContent?.turnComplete || message.serverContent?.interrupted) {
              onTurnEnd();
            }
            
            // Handle Audio (optional, we might not play it but we receive it)
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              onAudioData(audioData);
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error("Gemini Live Error", e);
            onError(new Error("Gemini Live Error"));
          },
          onclose: () => {
            console.log("Gemini Live Session Closed");
            onClose();
          }
        }
      });

      return await this.sessionPromise;

    } catch (error: any) {
      onError(error);
      throw error;
    }
  }

  async sendAudioChunk(base64PCM: string) {
    if (!this.sessionPromise) return;
    try {
      const session = await this.sessionPromise;
      session.sendRealtimeInput({
        media: {
          mimeType: "audio/pcm;rate=16000",
          data: base64PCM
        }
      });
    } catch (error) {
      console.error("Error sending audio chunk", error);
    }
  }

  async disconnect() {
    // There is no explicit disconnect method on the session object in the SDK
    // but we can nullify our reference and rely on the server closing or simple garbage collection
    // In a real websocket implementation we would call close(), but here we just reset.
    this.sessionPromise = null;
  }
}

// Audio Helpers
export function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}