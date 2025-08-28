import { promises as fs } from 'fs';
import { Credentials } from '../models/Auth.js';

export interface ValidationResult {
  isValid: boolean;
  missingFields: string[];
  errors: string[];
}

export class ConfigManager {
  /**
   * Creates a credentials template file with the required format
   */
  async createCredentialsTemplate(filePath: string = './credentials.txt'): Promise<void> {
    const template = `TIDAL_CLIENT_ID = 
TIDAL_CLIENT_SECRET = 

------------------------------

SPOTIFY_CLIENT_ID = 
SPOTIFY_CLIENT_SECRET = `;

    try {
      await fs.writeFile(filePath, template, 'utf8');
    } catch (error) {
      throw new Error(`Failed to create credentials template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  checkCredentialsExist(filePath: string = './credentials.txt'): boolean {
    try {
      const fs = require('fs');
      fs.accessSync(filePath, fs.constants.F_OK);
      return true;
    } catch (error) {
      return false;
    }
  }


  async checkCredentialsExistAsync(filePath: string = './credentials.txt'): Promise<boolean> {
    try {
      await fs.access(filePath, fs.constants.F_OK);
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