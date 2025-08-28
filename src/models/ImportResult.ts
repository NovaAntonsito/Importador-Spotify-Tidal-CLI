import { Track } from './Track.js';

export interface FailedTrack {
  track: Track;
  reason: string;
  searchAttempts: string[];
}

export interface ImportResult {
  totalTracks: number;
  successfulTracks: number;
  failedTracks: FailedTrack[];
  createdPlaylistId: string | null;
  processingTime: number;
  startTime: Date;
  endTime: Date;
}