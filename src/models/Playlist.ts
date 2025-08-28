import { Track } from './Track.js';

export interface PlaylistOwner {
  id: string;
  displayName: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  tracks: Track[];
  owner: PlaylistOwner;
  totalTracks: number;
  isPublic: boolean;
  collaborative: boolean;
}