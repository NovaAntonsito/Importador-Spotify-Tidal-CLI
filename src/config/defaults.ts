/**
 * Configuración por defecto para el CLI
 */
export const DEFAULT_CONFIG = {
  // Archivo de credenciales por defecto
  CREDENTIALS_FILE: 'credentials.txt',
  
  // Puerto por defecto para OAuth
  OAUTH_PORT: 8888,
  
  // Configuración de reintentos
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  
  // Configuración de lotes
  BATCH_SIZE: 10,
  
  // Timeouts
  REQUEST_TIMEOUT: 10000,
  OAUTH_TIMEOUT: 120000,
  
  // URLs de redirección
  REDIRECT_URI: 'http://127.0.0.1:8888/callback',
  
  // Configuración de matching
  SIMILARITY_THRESHOLD: 0.7,
  HIGH_CONFIDENCE_THRESHOLD: 0.9,
  
  // Archivos de progreso
  PROGRESS_FILE: '.spotify-tidal-progress.json',
  ERROR_LOG_FILE: 'logs/tidal-errors.json'
} as const;

/**
 * Mensajes de ayuda y información
 */
export const HELP_MESSAGES = {
  WELCOME: '🎵 Importador de Playlists de Spotify a Tidal',
  DESCRIPTION: 'Importa tus playlists de Spotify a Tidal de manera fácil y rápida',
  
  CREDENTIALS_MISSING: `
❌ No se encontró el archivo de credenciales.

Para crear el archivo credentials.txt:

1. Creá un archivo llamado 'credentials.txt' en este directorio
2. Agregá tus credenciales en este formato:

TIDAL_CLIENT_ID = tu_tidal_client_id
TIDAL_CLIENT_SECRET = tu_tidal_client_secret

------------------------------

SPOTIFY_CLIENT_ID = tu_spotify_client_id  
SPOTIFY_CLIENT_SECRET = tu_spotify_client_secret

Para obtener las credenciales, visitá:
- Spotify: https://developer.spotify.com/dashboard
- Tidal: https://developer.tidal.com/

Asegurate de configurar la URI de redirección: http://127.0.0.1:8888/callback
`,

  SETUP_COMPLETE: `
✅ ¡Configuración completada!

Ahora podés ejecutar:
  npx spotify-tidal-importer

Para más opciones:
  npx spotify-tidal-importer --help
`
} as const;