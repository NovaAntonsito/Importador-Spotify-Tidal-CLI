import chalk from 'chalk';
import inquirer from 'inquirer';
import { SpotifyService } from '../services/SpotifyService.js';
import { TidalService } from '../services/TidalService.js';
import { PlaylistSyncManager } from '../services/PlaylistSyncManager.js';
import { PlaylistImporter } from '../services/PlaylistImporter.js';
import { SongMatcher } from '../matching/SongMatcher.js';
import { Playlist } from '../models/Playlist.js';
import { TidalPlaylist } from '../models/TidalTypes.js';
import { createSpinner } from 'nanospinner';
import { ErrorLogger } from '../utils/ErrorLogger.js';

export interface MenuOptions {
    spotifyService: SpotifyService;
    tidalService: TidalService;
}

export class InteractiveMenu {
    private spotifyService: SpotifyService;
    private tidalService: TidalService;
    private playlistSyncManager: PlaylistSyncManager;
    private playlistImporter: PlaylistImporter;

    constructor(options: MenuOptions) {
        this.spotifyService = options.spotifyService;
        this.tidalService = options.tidalService;

        const songMatcher = new SongMatcher(this.tidalService);
        this.playlistSyncManager = new PlaylistSyncManager(
            this.spotifyService,
            this.tidalService,
            songMatcher
        );
        
        this.playlistImporter = new PlaylistImporter(
            this.spotifyService,
            this.tidalService
        );
    }

    /**
     * Show main menu after authentication
     */
    async showMainMenu(): Promise<void> {
        this.showWelcome();
        console.log(chalk.green('✅ Autenticación exitosa con ambos servicios\n'));

        while (true) {
            const { action } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'action',
                    message: '¿Qué quieres hacer?',
                    choices: [
                        {
                            name: '📥 Importar playlist (crear nueva en Tidal)',
                            value: 'import'
                        },
                        {
                            name: '🔄 Sincronizar playlist (actualizar existente en Tidal)',
                            value: 'sync'
                        },
                        {
                            name: '📋 Ver mis playlists de Spotify',
                            value: 'view-spotify'
                        },
                        {
                            name: '📋 Ver mis playlists de Tidal',
                            value: 'view-tidal'
                        },
                        {
                            name: '📝 Ver logs de errores',
                            value: 'view-logs'
                        },
                        {
                            name: '🎵 Ver canciones no encontradas',
                            value: 'view-not-found'
                        },
                        {
                            name: '❌ Salir',
                            value: 'exit'
                        }
                    ]
                }
            ]);

            switch (action) {
                case 'import':
                    await this.handleImportPlaylist();
                    break;
                case 'sync':
                    await this.handleSyncPlaylist();
                    await this.pressEnterToContinue();
                    this.clearTerminal();
                    break;
                case 'view-spotify':
                    await this.showSpotifyPlaylists();
                    await this.pressEnterToContinue();
                    this.clearTerminal();
                    break;
                case 'view-tidal':
                    await this.showTidalPlaylists();
                    await this.pressEnterToContinue();
                    this.clearTerminal();
                    break;
                case 'view-logs':
                    await this.showErrorLogs();
                    await this.pressEnterToContinue();
                    this.clearTerminal();
                    break;
                case 'view-not-found':
                    await this.showTracksNotFound();
                    await this.pressEnterToContinue();
                    this.clearTerminal();
                    break;
                case 'exit':
                    console.log(chalk.yellow('\n👋 ¡Hasta luego!'));
                    return;
            }
        }
    }

    /**
     * Handle importing a playlist (create new in Tidal)
     */
    private async handleImportPlaylist(): Promise<void> {
        console.log(chalk.bold.blue('\n📥 Importar Playlist'));
        console.log(chalk.gray('─'.repeat(30)));

        // Get Spotify playlists
        const spinner = createSpinner('Cargando tus playlists de Spotify...').start();

        try {
            const spotifyPlaylists = await this.spotifyService.getUserPlaylists();
            spinner.success({ text: `${spotifyPlaylists.length} playlists encontradas` });

            if (spotifyPlaylists.length === 0) {
                console.log(chalk.yellow('No tienes playlists públicas en Spotify.'));
                return;
            }

            // Show playlist selection
            const { selectedPlaylist } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'selectedPlaylist',
                    message: '¿Qué playlist quieres importar a Tidal?',
                    choices: [
                        ...spotifyPlaylists.map(playlist => ({
                            name: `🎵 ${playlist.name} (${playlist.totalTracks} canciones)`,
                            value: playlist
                        })),
                        {
                            name: '⬅️ Volver al menú principal',
                            value: null
                        }
                    ],
                    pageSize: 10
                }
            ]);

            if (!selectedPlaylist) return;

            // Confirm import
            const { confirm } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirm',
                    message: `¿Confirmas que quieres importar "${selectedPlaylist.name}" a Tidal?`,
                    default: true
                }
            ]);

            if (!confirm) return;

            // 
            await this.playlistImporter.importPlaylist(selectedPlaylist);
            
            //Limpio la terminal
            this.clearTerminal();

        } catch (error) {
            spinner.error({ text: 'Error al cargar playlists' });
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Error desconocido');
        }
    }

    /**
     * Handle synchronizing a playlist (update existing in Tidal)
     */
    private async handleSyncPlaylist(): Promise<void> {
        console.log(chalk.bold.blue('\n🔄 Sincronizar Playlist'));
        console.log(chalk.gray('─'.repeat(30)));

        const spinner = createSpinner('Cargando playlists...').start();

        try {
            // Load both Spotify and Tidal playlists
            const [spotifyPlaylists, tidalPlaylists] = await Promise.all([
                this.spotifyService.getUserPlaylists(),
                this.tidalService.getUserPlaylists()
            ]);

            spinner.success({ text: `${spotifyPlaylists.length} playlists de Spotify, ${tidalPlaylists.length} de Tidal` });

            if (spotifyPlaylists.length === 0) {
                console.log(chalk.yellow('No tienes playlists en Spotify.'));
                return;
            }

            if (tidalPlaylists.length === 0) {
                console.log(chalk.yellow('No tienes playlists en Tidal. Usa la opción "Importar" para crear nuevas.'));
                return;
            }

            // Select Spotify playlist
            const { selectedSpotifyPlaylist } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'selectedSpotifyPlaylist',
                    message: '¿Qué playlist de Spotify quieres sincronizar?',
                    choices: [
                        ...spotifyPlaylists.map(playlist => ({
                            name: `🎵 ${playlist.name} (${playlist.totalTracks} canciones)`,
                            value: playlist
                        })),
                        {
                            name: '⬅️ Volver al menú principal',
                            value: null
                        }
                    ],
                    pageSize: 10
                }
            ]);

            if (!selectedSpotifyPlaylist) return;

            // Select Tidal playlist to overwrite
            const { selectedTidalPlaylist } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'selectedTidalPlaylist',
                    message: '¿Qué playlist de Tidal quieres sobrescribir?',
                    choices: [
                        ...tidalPlaylists.map(playlist => ({
                            name: `🌊 ${playlist.title} (${playlist.numberOfTracks || 0} canciones)`,
                            value: playlist
                        })),
                        {
                            name: '⬅️ Cancelar',
                            value: null
                        }
                    ],
                    pageSize: 10
                }
            ]);

            if (!selectedTidalPlaylist) return;

            // Confirm sync with warning
            console.log(chalk.yellow('\n⚠️  ADVERTENCIA: Esta operación sobrescribirá completamente la playlist de Tidal.'));
            console.log(chalk.gray(`Playlist origen: ${selectedSpotifyPlaylist.name} (Spotify)`));
            console.log(chalk.gray(`Playlist destino: ${selectedTidalPlaylist.title} (Tidal)`));

            const { confirm } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirm',
                    message: '¿Estás seguro de que quieres continuar?',
                    default: false
                }
            ]);

            if (!confirm) return;

            // Perform sync
            await this.performSync(selectedSpotifyPlaylist, selectedTidalPlaylist);

        } catch (error) {
            spinner.error({ text: 'Error al cargar playlists' });
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Error desconocido');
        }
    }

    /**
     * Show Spotify playlists
     */
    private async showSpotifyPlaylists(): Promise<void> {
        console.log(chalk.bold.green('\n🎵 Tus Playlists de Spotify'));
        console.log(chalk.gray('─'.repeat(30)));

        const spinner = createSpinner('Cargando playlists de Spotify...').start();

        try {
            const playlists = await this.spotifyService.getUserPlaylists();
            spinner.success({ text: `${playlists.length} playlists encontradas` });

            if (playlists.length === 0) {
                console.log(chalk.yellow('No tienes playlists públicas en Spotify.'));
                return;
            }

            console.log('');
            playlists.forEach((playlist, index) => {
                console.log(`${index + 1}. ${chalk.green(playlist.name)}`);
                console.log(`   ${chalk.gray(`${playlist.totalTracks} canciones • ${playlist.isPublic ? 'Pública' : 'Privada'}`)}`);
                if (playlist.description) {
                    console.log(`   ${chalk.gray(playlist.description)}`);
                }
                console.log('');
            });

        } catch (error) {
            spinner.error({ text: 'Error al cargar playlists de Spotify' });
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Error desconocido');
        }
    }

    /**
     * Show Tidal playlists
     */
    private async showTidalPlaylists(): Promise<void> {
        console.log(chalk.bold.blue('\n🌊 Tus Playlists de Tidal'));
        console.log(chalk.gray('─'.repeat(30)));

        const spinner = createSpinner('Cargando playlists de Tidal...').start();

        try {
            const playlists = await this.tidalService.getUserPlaylists();
            spinner.success({ text: `${playlists.length} playlists encontradas` });

            if (playlists.length === 0) {
                console.log(chalk.yellow('No tienes playlists en Tidal.'));
                return;
            }

            console.log('');
            playlists.forEach((playlist, index) => {
                console.log(`${index + 1}. ${chalk.blue(playlist.title)}`);
                console.log(`   ${chalk.gray(`${playlist.numberOfTracks || 0} canciones`)}`);
                if (playlist.description) {
                    console.log(`   ${chalk.gray(playlist.description)}`);
                }
                console.log('');
            });

        } catch (error) {
            spinner.error({ text: 'Error al cargar playlists de Tidal' });
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Error desconocido');
        }
    }

    /**
     * Perform playlist import
     */
    private async performImport(playlist: Playlist): Promise<void> {
        console.log(chalk.bold.cyan(`\n📥 Importando "${playlist.name}"...`));

        const spinner = createSpinner('Obteniendo canciones de la playlist...').start();

        try {
            // First, get all tracks from the Spotify playlist
            spinner.update({ text: 'Cargando canciones de Spotify...' });
            const tracks = await this.spotifyService.getPlaylistTracks(playlist.id);

            spinner.success({ text: `${tracks.length} canciones encontradas` });

            console.log(chalk.blue(`\n🎵 Canciones en "${playlist.name}":`));
            console.log(chalk.gray('─'.repeat(60)));

            // Log each track with name, album, and artist (first 5 for testing)
            const tracksToShow = tracks.slice(0, 5);
            tracksToShow.forEach((track, index) => {
                const artistNames = track.artists.map(artist => artist.name).join(', ');
                console.log(`${index + 1}. ${chalk.green(track.title)}`);
                console.log(`   � Arbtista(s): ${chalk.yellow(artistNames)}`);
                console.log(`   💿 Álbum: ${chalk.cyan(track.album.name)}`);
                console.log(`   ⏱️  Duración: ${this.formatDuration(track.duration)}`);
                console.log('');
            });

            console.log(chalk.gray('─'.repeat(60)));
            console.log(chalk.blue(`Mostrando: ${tracksToShow.length} de ${tracks.length} canciones`));

            // Now let's search for each track in Tidal (first 3 for testing)
            console.log(chalk.yellow('\n🔍 Buscando canciones en Tidal...'));

            const tracksToSearch = tracks.slice(0, 3);
            for (let i = 0; i < tracksToSearch.length; i++) {
                const track = tracksToSearch[i];
                const artistNames = track.artists.map(artist => artist.name).join(', ');

                console.log(chalk.blue(`\n${i + 1}. Buscando: "${track.title}" por ${artistNames}`));

                try {
                    const searchResult = await this.tidalService.searchTrack(artistNames, track.title);
                    // The search result will be logged by the service
                } catch (error) {
                    console.log(chalk.red(`   ❌ Error buscando: ${error instanceof Error ? error.message : 'Error desconocido'}`));
                }
            }

        } catch (error) {
            spinner.error({ text: 'Error durante la importación' });
            console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : 'Error desconocido');
        }
    }

    /**
     * Format duration from milliseconds to MM:SS
     */
    private formatDuration(durationMs: number): string {
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Perform playlist sync
     */
    private async performSync(spotifyPlaylist: Playlist, tidalPlaylist: TidalPlaylist): Promise<void> {
        console.log(chalk.bold.cyan(`\n🔄 Sincronizando "${spotifyPlaylist.name}" → "${tidalPlaylist.title}"...`));
        console.log(chalk.yellow('⚠️  Esta operación reemplazará completamente el contenido de la playlist de Tidal'));

        const spinner = createSpinner('Iniciando sincronización...').start();

        try {
            // Use updateExistingPlaylist method to overwrite the existing Tidal playlist
            spinner.update({ text: 'Limpiando playlist de Tidal...' });
            const result = await this.playlistSyncManager.updateExistingPlaylist(spotifyPlaylist, tidalPlaylist);

            spinner.success({ text: 'Sincronización completada' });

            // Show results
            console.log(chalk.green('\n🎉 Sincronización exitosa!'));
            console.log(chalk.gray('═'.repeat(50)));
            console.log(`📋 Playlist: ${chalk.bold(result.playlistName)}`);
            console.log(`📊 Total de canciones: ${chalk.blue(result.totalTracks.toString())}`);
            console.log(`✅ Sincronizadas exitosamente: ${chalk.green(result.successfulTracks.toString())}`);
            console.log(`❌ No encontradas/disponibles: ${chalk.red(result.failedTracks.toString())}`);

            if (result.successfulTracks > 0) {
                const successRate = result.totalTracks > 0 ? (result.successfulTracks / result.totalTracks) * 100 : 0;
                console.log(`📈 Tasa de éxito: ${chalk.yellow(successRate.toFixed(1) + '%')}`);
            }

            if (result.errors && result.errors.length > 0) {
                console.log(chalk.yellow('\n⚠️  Canciones no sincronizadas:'));
                result.errors.slice(0, 10).forEach((error: string, index) => {
                    console.log(`   ${index + 1}. ${error}`);
                });
                if (result.errors.length > 10) {
                    console.log(`   ... y ${result.errors.length - 10} más`);
                }
            }

        } catch (error) {
            spinner.error({ text: 'Error durante la sincronización' });
            console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : 'Error desconocido');
        }
    }

    /**
     * Show recent error logs
     */
    private async showErrorLogs(): Promise<void> {
        console.log(chalk.bold.red('\n📝 Logs de Errores Recientes'));
        console.log(chalk.gray('─'.repeat(30)));

        try {
            const logs = await TidalService.getRecentErrorLogs(10);

            if (logs.length === 0) {
                console.log(chalk.green('✅ No hay errores recientes registrados.'));
                return;
            }

            console.log(`\n📊 Mostrando ${logs.length} errores más recientes:\n`);

            logs.forEach((log, index) => {
                console.log(chalk.red(`${index + 1}. Error ${log.statusCode} - ${log.method} ${log.url}`));
                console.log(chalk.gray(`   Timestamp: ${new Date(log.timestamp).toLocaleString()}`));
                console.log(chalk.gray(`   Full URL: ${log.fullUrl}`));
                console.log(chalk.gray(`   Message: ${log.errorMessage}`));
                
                if (log.context) {
                    console.log(chalk.gray(`   Context: ${log.context}`));
                }

                if (log.responseData) {
                    console.log(chalk.gray(`   Response: ${JSON.stringify(log.responseData).substring(0, 200)}...`));
                }
                console.log('');
            });

            // Ask if user wants to clear logs
            const { clearLogs } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'clearLogs',
                    message: '¿Quieres limpiar los logs de errores?',
                    default: false
                }
            ]);

            if (clearLogs) {
                await TidalService.clearErrorLogs();
                console.log(chalk.green('✅ Logs de errores limpiados.'));
            }

        } catch (error) {
            console.error(chalk.red('❌ Error al cargar logs:'), error instanceof Error ? error.message : 'Error desconocido');
        }
    }

    /**
     * Clear the terminal screen and show welcome message
     */
    private clearTerminal(): void {
        // Clear terminal using ANSI escape codes
        process.stdout.write('\x1Bc');
        // Alternative method for different terminals
        console.clear();
        
        // Show welcome message after clearing
        this.showWelcome();
    }

    /**
     * Show welcome message
     */
    private showWelcome(): void {
        console.log(chalk.bold.blue('\n🎵 Importador de Spotify a Tidal by NovaAntonsito'));
        console.log(chalk.gray('═'.repeat(40)));
    }

    /**
     * Show tracks not found logs
     */
    private async showTracksNotFound(): Promise<void> {
        console.log(chalk.bold.yellow('\n🎵 Canciones No Encontradas'));
        console.log(chalk.gray('─'.repeat(35)));

        try {
            const logs = await ErrorLogger.getTrackNotFoundLogs(20);

            if (logs.length === 0) {
                console.log(chalk.green('✅ No hay canciones no encontradas registradas.'));
                return;
            }

            console.log(`\n📊 Mostrando ${logs.length} canciones no encontradas más recientes:\n`);

            logs.forEach((log, index) => {
                const contextIcon = log.context === 'import' ? '📥' : '🔄';
                
                console.log(chalk.yellow(`${index + 1}. ${contextIcon} "${log.track.title}" por ${log.track.artist}`));
                console.log(chalk.gray(`   💿 Álbum: ${log.track.album}`));
                console.log(chalk.gray(`   🆔 Spotify ID: ${log.track.spotifyId}`));
                console.log(chalk.gray(`   🕒 ${new Date(log.timestamp).toLocaleString()}`));
                console.log(chalk.gray(`   📋 Contexto: ${log.context === 'import' ? 'Importación' : 'Sincronización'}`));
                
                if (log.searchAttempts.length > 0) {
                    console.log(chalk.blue(`   🔍 Búsquedas realizadas:`));
                    log.searchAttempts.slice(0, 3).forEach((attempt, i) => {
                        console.log(chalk.gray(`     ${i + 1}. ${attempt.description}`));
                        console.log(chalk.gray(`        Query: "${attempt.query}"`));
                        console.log(chalk.gray(`        URL: ${attempt.url}`));
                    });
                    if (log.searchAttempts.length > 3) {
                        console.log(chalk.gray(`     ... y ${log.searchAttempts.length - 3} búsquedas más`));
                    }
                }
                
                if (log.errorMessage) {
                    console.log(chalk.red(`   ❌ Error: ${log.errorMessage}`));
                }
                
                console.log('');
            });

            // Ask if user wants to clear logs
            const { clearLogs } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'clearLogs',
                    message: '¿Quieres limpiar los logs de canciones no encontradas?',
                    default: false
                }
            ]);

            if (clearLogs) {
                await ErrorLogger.clearTrackNotFoundLogs();
                console.log(chalk.green('✅ Logs de canciones no encontradas limpiados.'));
            }

        } catch (error) {
            console.error(chalk.red('❌ Error al cargar logs de canciones no encontradas:'), error instanceof Error ? error.message : 'Error desconocido');
        }
    }

    /**
     * Utility to pause and wait for user input
     */
    private async pressEnterToContinue(): Promise<void> {
        await inquirer.prompt([
            {
                type: 'input',
                name: 'continue',
                message: 'Presiona Enter para continuar...',
                default: ''
            }
        ]);
    }
}