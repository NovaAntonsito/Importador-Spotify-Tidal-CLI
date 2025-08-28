import chalk from 'chalk';
import inquirer from 'inquirer';
import { SpotifyService } from './SpotifyService.js';
import { TidalService } from './TidalService.js';
import { Playlist } from '../models/Playlist.js';

export interface ImportResult {
    playlistName: string;
    totalTracks: number;
    successfulTracks: number;
    failedTracks: number;
    successRate: number;
    tidalPlaylistId?: string;
    failedTracksList: string[];
}

export class PlaylistImporter {
    constructor(
        private spotifyService: SpotifyService,
        private tidalService: TidalService
    ) { }

    /**
     * Import a Spotify playlist to Tidal
     */
    async importPlaylist(playlist: Playlist): Promise<ImportResult> {
        console.log(chalk.bold.cyan(`\n📥 Importando "${playlist.name}"...`));

        // Step 1: Get all tracks from the Spotify playlist
        console.log(chalk.blue('🎵 Cargando canciones de Spotify...'));
        const tracks = await this.spotifyService.getPlaylistTracks(playlist.id);
        console.log(chalk.green(`✅ ${tracks.length} canciones encontradas`));

        // Step 2: Create new playlist in Tidal
        console.log(chalk.blue('\n🌊 Creando playlist en Tidal...'));
        const tidalPlaylist = await this.tidalService.createPlaylist(
            playlist.name,
            playlist.description || `Importada desde Spotify - ${new Date().toLocaleDateString()}`
        );

        // Step 3: Search and collect track IDs
        console.log(chalk.yellow('\n🔍 Buscando canciones en Tidal...'));
        const foundTrackIds: string[] = [];
        const failedTracks: string[] = [];
        let processed = 0;

        for (const track of tracks) {
            processed++;
            const artistNames = track.artists.map(artist => artist.name).join(', ');

            console.log(chalk.blue(`${processed}/${tracks.length}. Buscando: "${track.title}" por ${artistNames}`));

            try {
                // Search for the track
                const searchResults = await this.tidalService.searchTrack(artistNames, track.title);

                // Check if we found any tracks
                if (searchResults.data && Array.isArray(searchResults.data) && searchResults.data.length > 0) {
                    const firstTrackId = searchResults.data[0].id;

                    // Verify the track exists and is available
                    const verifiedTrack = await this.tidalService.verifyTrack(firstTrackId);

                    if (verifiedTrack && verifiedTrack.isAvailable) {
                        foundTrackIds.push(firstTrackId);
                        console.log(chalk.green(`   ✅ Encontrada y verificada`));
                    } else {
                        failedTracks.push(`${track.title} - ${artistNames} (no disponible)`);
                        console.log(chalk.red(`   ❌ No disponible para streaming`));
                    }
                } else {
                    failedTracks.push(`${track.title} - ${artistNames} (no encontrada)`);
                    console.log(chalk.red(`   ❌ No encontrada`));
                }
            } catch (error) {
                failedTracks.push(`${track.title} - ${artistNames} (error de búsqueda)`);
                console.log(chalk.red(`   ❌ Error: ${error instanceof Error ? error.message : 'Error desconocido'}`));
            }

            // Add a small delay to avoid rate limiting
            if (processed < tracks.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Step 4: Add found tracks to the playlist in batches of 20
        let tidalPlaylistId: string | undefined;

        if (foundTrackIds.length > 0) {
            console.log(chalk.blue(`\n🎵 Agregando ${foundTrackIds.length} canciones a la playlist...`));

            // Extract playlist ID from the response
            tidalPlaylistId = (tidalPlaylist as any).data?.id || (tidalPlaylist as any).id;

            if (tidalPlaylistId) {
                await this.addTracksInBatches(tidalPlaylistId, foundTrackIds);
                console.log(chalk.green(`✅ ${foundTrackIds.length} canciones agregadas exitosamente`));
            } else {
                console.log(chalk.red('❌ No se pudo obtener el ID de la playlist creada'));
            }
        }

        // Calculate results
        const successRate = tracks.length > 0 ? (foundTrackIds.length / tracks.length) * 100 : 0;

        const result: ImportResult = {
            playlistName: playlist.name,
            totalTracks: tracks.length,
            successfulTracks: foundTrackIds.length,
            failedTracks: failedTracks.length,
            successRate: Number(successRate.toFixed(1)),
            tidalPlaylistId,
            failedTracksList: failedTracks
        };

        // Step 5: Show final results
        this.displayResults(result);

        // Add a pause before returning to menu
        console.log(chalk.gray('\n⏳ Presiona Enter para volver al menú principal...'));
        await this.waitForEnter();

        return result;
    }

    /**
     * Añadir canciones en lotes de 20 (Limites de la api de tidal)
     */
    private async addTracksInBatches(playlistId: string, trackIds: string[]): Promise<void> {
        const BATCH_SIZE = 20;
        const totalBatches = Math.ceil(trackIds.length / BATCH_SIZE);

        console.log(chalk.blue(`📦 Procesando en ${totalBatches} lotes de máximo ${BATCH_SIZE} canciones...`));

        for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
            const batch = trackIds.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

            console.log(chalk.blue(`   📦 Lote ${batchNumber}/${totalBatches}: ${batch.length} canciones`));

            try {
                await this.tidalService.addTracksToPlaylist(playlistId, batch, true);
                console.log(chalk.green(`   ✅ Lote ${batchNumber} agregado exitosamente`));
            } catch (error) {
                console.log(chalk.red(`   ❌ Error en lote ${batchNumber}: ${error instanceof Error ? error.message : 'Error desconocido'}`));
                throw error;
            }

            // Add a small delay between batches to avoid rate limiting
            if (i + BATCH_SIZE < trackIds.length) {
                console.log(chalk.gray(`   ⏳ Esperando 1 segundo antes del siguiente lote...`));
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    /**
     * Display import results
     */
    private displayResults(result: ImportResult): void {
        console.log(chalk.bold.green('\n🎉 Importación completada!'));
        console.log(chalk.gray('═'.repeat(50)));
        console.log(`📋 Playlist: ${chalk.bold(result.playlistName)}`);
        console.log(`📊 Total de canciones: ${chalk.blue(result.totalTracks.toString())}`);
        console.log(`✅ Importadas exitosamente: ${chalk.green(result.successfulTracks.toString())}`);
        console.log(`❌ No encontradas/disponibles: ${chalk.red(result.failedTracks.toString())}`);

        if (result.successfulTracks > 0) {
            console.log(`📈 Tasa de éxito: ${chalk.yellow(result.successRate + '%')}`);
        }

        // Show failed tracks if any
        if (result.failedTracksList.length > 0) {
            console.log(chalk.yellow('\n⚠️  Canciones no importadas:'));
            result.failedTracksList.slice(0, 10).forEach((track, index) => {
                console.log(`   ${index + 1}. ${track}`);
            });
            if (result.failedTracksList.length > 10) {
                console.log(`   ... y ${result.failedTracksList.length - 10} más`);
            }
        }
    }

    /**
     * Wait for user to press Enter
     */
    private async waitForEnter(): Promise<void> {
        await inquirer.prompt([
            {
                type: 'input',
                name: 'continue',
                message: '',
                default: ''
            }
        ]);
    }
}