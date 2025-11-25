export enum AspectRatio {
  NineSixteen = "9:16",
  SixteenNine = "16:9",
  ThreeFour = "3:4",
  OneOne = "1:1"
}

export interface AppState {
  isRecording: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  currentAspectRatio: AspectRatio;
  lastQuestion: string;
  transcription: string;
  videoBlob: Blob | null;
}

export type InterviewPhase = 'setup' | 'interview' | 'review';
