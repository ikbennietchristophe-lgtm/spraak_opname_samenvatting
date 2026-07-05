export interface Recording {
  timestamp: string;
  text: string;
  summary: string;
}

export type RecordingStatus = "idle" | "recording" | "paused";

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}
