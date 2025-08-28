export interface Artist {
  id: string;
  name: string;
}

export interface Album {
  id: string;
  name: string;
  releaseDate?: string;
}

export interface Track {
  id: string;
  title: string;
  artists: Artist[];
  album: Album;
  duration: number; // en milisegundos
  isrc?: string; // International Standard Recording Code
  explicit?: boolean;
  popularity?: number;
}