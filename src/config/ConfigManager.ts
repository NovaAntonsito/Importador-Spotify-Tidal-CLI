import { promises as fs } from 'fs';
import { Credentials } from '../models/Auth.js';
import { ConfigPaths } from '../utils/ConfigPaths.js';

export interface ValidationResult {
  isValid: boolean;
  missingFields: string[];
  errors: string[];
}

export class ConfigManager {
  /**
   * Obtiene la ruta por defecto del archivo de credenciales
   */
  getDefaultCredentialsPath(): string {
    return ConfigPaths.getCredentialsPath();
  }

  /**
   * Crea el archivo de credenciales template en AppData
   */
  async createCredentialsTemplate(filePath?: string): Promise<string> {
    const credentialsPath = filePath || this.getDefaultCredentialsPath();
    
    try {
      ConfigPaths.ensureConfigDirs();
      const createdPath = ConfigPaths.createCredentialsTemplate();
      return createdPath;
    } catch (error) {
      throw new Error(`Error al crear el template de credenciales: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }


  checkCredentialsExist(filePath?: string): boolean {
    const credentialsPath = filePath || this.getDefaultCredentialsPath();
    try {
      const fs = require('fs');
      fs.accessSync(credentialsPath, fs.constants.F_OK);
      return true;
    } catch (error) {
      return false;
    }
  }


  async checkCredentialsExistAsync(filePath?: string): Promise<boolean> {
    const credentialsPath = filePath || this.getDefaultCredentialsPath();
    try {
      await fs.access(credentialsPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

 
  async validateCredentialsFile(filePath: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      missingFields: [],
      errors: []
    };

    try {

      if (!(await this.checkCredentialsExistAsync(filePath))) {
        result.isValid = false;
        result.errors.push('Credentials file does not exist');
        return result;
      }

      const content = await fs.readFile(filePath, 'utf8');


      const requiredFields = [
        'TIDAL_CLIENT_ID',
        'TIDAL_CLIENT_SECRET',
        'SPOTIFY_CLIENT_ID',
        'SPOTIFY_CLIENT_SECRET'
      ];

      const lines = content.split('\n');

      for (const field of requiredFields) {
        const regex = new RegExp(`^\\s*${field}\\s*=\\s*(.*)$`, 'i');
        let found = false;
        let value = '';

        for (const line of lines) {
          const match = line.match(regex);
          if (match) {
            found = true;
            value = match[1] ? match[1].trim() : '';
            break;
          }
        }


        const isPlaceholder = value.includes('your_') || value.includes('_here') || value === '';

        if (!found || isPlaceholder) {
          result.missingFields.push(field);
          result.isValid = false;
        }
      }

      if (result.missingFields.length > 0) {
        result.errors.push(`Missing or empty credentials: ${result.missingFields.join(', ')}`);
      }

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Failed to read credentials file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Parses credentials from the file and returns a Credentials object
   */
  async parseCredentials(filePath: string): Promise<Credentials> {
    try {
      const content = await fs.readFile(filePath, 'utf8');

      const extractValue = (field: string): string => {
        const lines = content.split('\n');
        const regex = new RegExp(`^\\s*${field}\\s*=\\s*(.*)$`, 'i');

        for (const line of lines) {
          const match = line.match(regex);
          if (match) {
            return match[1] ? match[1].trim() : '';
          }
        }

        return '';
      };

      const credentials: Credentials = {
        tidalClientId: extractValue('TIDAL_CLIENT_ID'),
        tidalClientSecret: extractValue('TIDAL_CLIENT_SECRET'),
        spotifyClientId: extractValue('SPOTIFY_CLIENT_ID'),
        spotifyClientSecret: extractValue('SPOTIFY_CLIENT_SECRET')
      };

      // Validate that all fields are present
      const validation = await this.validateCredentialsFile(filePath);
      if (!validation.isValid) {
        throw new Error(`Invalid credentials file: ${validation.errors.join(', ')}`);
      }

      return credentials;
    } catch (error) {
      throw new Error(`Failed to parse credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}