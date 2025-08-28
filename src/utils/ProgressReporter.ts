import { createSpinner } from 'nanospinner';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';
import { Track } from '../models/Track.js';
import { FailedTrack, ImportResult } from '../models/ImportResult.js';

export interface ProgressStatus {
  current: number;
  total: number;
  successful: number;
  failed: number;
  currentTrack?: string;
  currentPlaylist?: string;
}

export interface ImportSummary {
  totalTracks: number;
  successfulTracks: number;
  failedTracks: FailedTrack[];
  processingTime: number;
  playlistId?: string;
  playlistName?: string;
}

export interface SyncSummary {
  totalPlaylists: number;
  playlistsCreated: number;
  playlistsUpdated: number;
  totalTracks: number;
  successfulTracks: number;
  failedTracks: number;
  processingTime: number;
}

export class ProgressReporter {
  private spinner: any;
  private startTime: Date;
  private isActive: boolean = false;

  constructor() {
    this.startTime = new Date();
  }

  /**
   * Inicializar seguimiento de progreso para una operación específica
   */
  startProgress(total: number, operation: string = 'Processing'): void {
    this.startTime = new Date();
    this.isActive = true;

    this.spinner = createSpinner(`${operation} 0/${total} canciones...`);
    this.spinner.start();
  }

  /**
   * Actualizar progreso con el estado actual del procesamiento de canciones
   */
  updateProgress(status: ProgressStatus): void {
    if (!this.isActive || !this.spinner) {
      return;
    }

    const percentage = Math.round((status.current / status.total) * 100);
    const currentTrackInfo = status.currentTrack ? ` - ${status.currentTrack}` : '';
    const playlistInfo = status.currentPlaylist ? ` [${status.currentPlaylist}]` : '';

    const message = `Procesando ${status.current}/${status.total} canciones (${percentage}%) - ` +
      `✅ ${status.successful} encontradas, ❌ ${status.failed} fallidas${currentTrackInfo}${playlistInfo}`;

    this.spinner.update({ text: message });
  }

  /**
   * Mostrar resumen final de sincronización
   * Requisitos: 4.3 - Mostrar resumen con estadísticas (total, exitosas, fallidas)
   */
  finishProgress(summary: ImportSummary): void {
    if (!this.isActive || !this.spinner) {
      return;
    }

    this.isActive = false;
    const processingTimeSeconds = Math.round(summary.processingTime / 1000);

    if (summary.failedTracks.length === 0) {
      this.spinner.success({
        text: `✅ ¡Importación completada exitosamente! ${summary.successfulTracks}/${summary.totalTracks} canciones importadas en ${processingTimeSeconds}s`
      });
    } else {
      this.spinner.warn({
        text: `⚠️ Importación completada con algunos problemas. ${summary.successfulTracks}/${summary.totalTracks} canciones importadas en ${processingTimeSeconds}s`
      });
    }

    // Mostrar resumen detallado
    console.log('\n' + chalk.bold('📊 Resumen de Importación:'));
    console.log(`   Total de canciones: ${chalk.cyan(summary.totalTracks)}`);
    console.log(`   Importadas exitosamente: ${chalk.green(summary.successfulTracks)}`);
    console.log(`   Falló la importación: ${chalk.red(summary.failedTracks.length)}`);
    console.log(`   Tiempo de procesamiento: ${chalk.yellow(processingTimeSeconds + 's')}`);

    if (summary.playlistName) {
      console.log(`   Playlist: ${chalk.magenta(summary.playlistName)}`);
    }

    if (summary.playlistId) {
      console.log(`   ID de Playlist: ${chalk.gray(summary.playlistId)}`);
    }
  }

  /**
   * Generar archivo de reporte para canciones fallidas
   */
  async generateReport(failedTracks: FailedTrack[], outputPath: string = './failed-tracks-report.txt'): Promise<void> {
    if (failedTracks.length === 0) {
      return;
    }

    const reportContent = this.buildReportContent(failedTracks);

    try {
      await writeFile(outputPath, reportContent, 'utf-8');
      console.log(`\n📄 Reporte de canciones fallidas generado: ${chalk.cyan(outputPath)}`);
    } catch (error) {
      console.error(`❌ Error generando reporte: ${error}`);
    }
  }

  /**
   * Mostrar resumen de sincronización para múltiples listas de reproducción
   */
  displaySyncSummary(summary: SyncSummary): void {
    const processingTimeSeconds = Math.round(summary.processingTime / 1000);

    console.log('\n' + chalk.bold('🎵 ¡Sincronización Completa!'));
    console.log('═'.repeat(50));

    console.log(chalk.bold('\n📋 Playlists:'));
    console.log(`   Total procesadas: ${chalk.cyan(summary.totalPlaylists)}`);
    console.log(`   Creadas: ${chalk.green(summary.playlistsCreated)}`);
    console.log(`   Actualizadas: ${chalk.yellow(summary.playlistsUpdated)}`);

    console.log(chalk.bold('\n🎵 Canciones:'));
    console.log(`   Total procesadas: ${chalk.cyan(summary.totalTracks)}`);
    console.log(`   Sincronizadas exitosamente: ${chalk.green(summary.successfulTracks)}`);
    console.log(`   Falló la sincronización: ${chalk.red(summary.failedTracks)}`);

    const successRate = summary.totalTracks > 0
      ? Math.round((summary.successfulTracks / summary.totalTracks) * 100)
      : 0;

    console.log(chalk.bold('\n⏱️ Rendimiento:'));
    console.log(`   Tiempo de procesamiento: ${chalk.yellow(processingTimeSeconds + 's')}`);
    console.log(`   Tasa de éxito: ${chalk.cyan(successRate + '%')}`);

    if (summary.failedTracks > 0) {
      console.log(`\n⚠️  ${summary.failedTracks} canciones no pudieron ser encontradas en Tidal.`);
      console.log('   Revisa el reporte de canciones fallidas para más detalles.');
    }

    console.log('\n' + '═'.repeat(50));
  }

  /**
   * Construir el contenido para el reporte de canciones fallidas
   */
  private buildReportContent(failedTracks: FailedTrack[]): string {
    const timestamp = new Date().toISOString();
    let content = `Reporte de Canciones Fallidas\n`;
    content += `Generado: ${timestamp}\n`;
    content += `Total de canciones fallidas: ${failedTracks.length}\n\n`;
    content += '='.repeat(80) + '\n\n';

    failedTracks.forEach((failedTrack, index) => {
      const track = failedTrack.track;
      const artistNames = track.artists.map(artist => artist.name).join(', ');

      content += `${index + 1}. ${track.title}\n`;
      content += `   Artista(s): ${artistNames}\n`;
      content += `   Álbum: ${track.album.name}\n`;
      content += `   Razón: ${failedTrack.reason}\n`;

      if (failedTrack.searchAttempts.length > 0) {
        content += `   Intentos de búsqueda:\n`;
        failedTrack.searchAttempts.forEach(attempt => {
          content += `     - "${attempt}"\n`;
        });
      }

      if (track.isrc) {
        content += `   ISRC: ${track.isrc}\n`;
      }

      content += '\n' + '-'.repeat(40) + '\n\n';
    });

    return content;
  }

  /**
   * Detener cualquier seguimiento de progreso activo
   */
  stop(): void {
    if (this.isActive && this.spinner) {
      this.spinner.stop();
      this.isActive = false;
    }
  }

  /**
   * Obtener tiempo transcurrido desde que comenzó el progreso
   */
  getElapsedTime(): number {
    return Date.now() - this.startTime.getTime();
  }
}