import { AxiosError } from 'axios';


export class ErrorSpotifyTidal extends Error {
  constructor(
    mensaje: string,
    public readonly codigo: string,
    public readonly errorOriginal?: Error,
    public readonly reintentar: boolean = false
  ) {
    super(mensaje);
    this.name = 'ErrorSpotifyTidal';
  }
}

export class ErrorAutenticacion extends ErrorSpotifyTidal {
  constructor(mensaje: string, servicio: 'spotify' | 'tidal', errorOriginal?: Error) {
    super(mensaje, `ERROR_AUTH_${servicio.toUpperCase()}`, errorOriginal, false);
    this.name = 'ErrorAutenticacion';
  }
}

export class ErrorLimiteVelocidad extends ErrorSpotifyTidal {
  constructor(
    mensaje: string,
    public readonly reintentarDespues: number,
    servicio: 'spotify' | 'tidal',
    errorOriginal?: Error
  ) {
    super(mensaje, `LIMITE_VELOCIDAD_${servicio.toUpperCase()}`, errorOriginal, true);
    this.name = 'ErrorLimiteVelocidad';
  }
}

export class ErrorRed extends ErrorSpotifyTidal {
  constructor(mensaje: string, errorOriginal?: Error) {
    super(mensaje, 'ERROR_RED', errorOriginal, true);
    this.name = 'ErrorRed';
  }
}

export class ErrorServicioNoDisponible extends ErrorSpotifyTidal {
  constructor(mensaje: string, servicio: 'spotify' | 'tidal', errorOriginal?: Error) {
    super(mensaje, `SERVICIO_NO_DISPONIBLE_${servicio.toUpperCase()}`, errorOriginal, true);
    this.name = 'ErrorServicioNoDisponible';
  }
}

export interface ConfiguracionReintento {
  maxReintentos: number;
  retrasoBase: number;
  retrasoMaximo: number;
  multiplicadorRetroceso: number;
  variacion: boolean;
}


export const CONFIGURACION_REINTENTO_PREDETERMINADA: ConfiguracionReintento = {
  maxReintentos: 3,
  retrasoBase: 1000, // 1 segundo
  retrasoMaximo: 30000, // 30 segundos
  multiplicadorRetroceso: 2,
  variacion: true
};


export class ManejadorErrores {
  constructor(private configuracion: ConfiguracionReintento = CONFIGURACION_REINTENTO_PREDETERMINADA) {}

 
  clasificarError(error: unknown, servicio: 'spotify' | 'tidal'): ErrorSpotifyTidal {
    if (error instanceof ErrorSpotifyTidal) {
      return error;
    }

    if (this.esErrorAxios(error)) {
      return this.clasificarErrorAxios(error, servicio);
    }

    if (error instanceof Error) {
      // Verificar códigos de error de red comunes
      if (this.esErrorRed(error)) {
        return new ErrorRed(
          `Error de red: ${error.message}`,
          error
        );
      }

      return new ErrorSpotifyTidal(
        error.message,
        'ERROR_DESCONOCIDO',
        error,
        false
      );
    }

    return new ErrorSpotifyTidal(
      'Ocurrió un error desconocido',
      'ERROR_DESCONOCIDO',
      undefined,
      false
    );
  }

 
  private clasificarErrorAxios(error: AxiosError, servicio: 'spotify' | 'tidal'): ErrorSpotifyTidal {
    const estado = error.response?.status;
    const textoEstado = error.response?.statusText || '';
    const datosRespuesta = error.response?.data as any;

    // Sin respuesta - error de red
    if (!error.response) {
      return new ErrorRed(
        `Error de red: ${error.message}`,
        error
      );
    }

  
    if (estado === 429) {
      const reintentarDespues = this.obtenerRetrasoReintentarDespues(error);
      return new ErrorLimiteVelocidad(
        `Límite de velocidad alcanzado en ${servicio}. Reintentar después de ${reintentarDespues}ms`,
        reintentarDespues,
        servicio,
        error
      );
    }

  
    if (estado === 401) {
      const mensaje = datosRespuesta?.error_description || 
                    datosRespuesta?.error || 
                    'Autenticación fallida - credenciales inválidas o expiradas';
      return new ErrorAutenticacion(mensaje, servicio, error);
    }

    if (estado === 403) {
      const mensaje = datosRespuesta?.error_description || 
                    datosRespuesta?.error || 
                    'Acceso prohibido - permisos insuficientes';
      return new ErrorAutenticacion(mensaje, servicio, error);
    }


    if (estado === 400) {
      const tipoError = datosRespuesta?.error;
      if (tipoError === 'invalid_client' || tipoError === 'invalid_request' || 
          tipoError === 'invalid_grant' || tipoError === 'unsupported_grant_type') {
        const mensaje = datosRespuesta?.error_description || 
                      datosRespuesta?.error || 
                      'Credenciales de cliente inválidas';
        return new ErrorAutenticacion(mensaje, servicio, error);
      }
    }

    // Errores del servidor (5xx)
    if (estado && estado >= 500) {
      return new ErrorServicioNoDisponible(
        `Servicio ${servicio} no disponible (${estado}): ${textoEstado}`,
        servicio,
        error
      );
    }

    // Errores del cliente (4xx)
    if (estado && estado >= 400 && estado < 500) {
      const mensaje = datosRespuesta?.error_description || 
                    datosRespuesta?.error || 
                    `Error del cliente (${estado}): ${textoEstado}`;
      return new ErrorSpotifyTidal(
        mensaje,
        `ERROR_CLIENTE_${estado}`,
        error,
        false
      );
    }

    // Otros errores
    return new ErrorSpotifyTidal(
      `Error HTTP (${estado}): ${textoEstado}`,
      `ERROR_HTTP_${estado}`,
      error,
      estado ? estado >= 500 : false
    );
  }

  /**
   * Ejecutar una operación con lógica de reintento y retroceso exponencial
   */
  async ejecutarConReintento<T>(
    operacion: () => Promise<T>,
    servicio: 'spotify' | 'tidal',
    nombreOperacion?: string
  ): Promise<T> {
    let ultimoError: ErrorSpotifyTidal | undefined;

    for (let intento = 1; intento <= this.configuracion.maxReintentos; intento++) {
      try {
        return await operacion();
      } catch (error) {
        ultimoError = this.clasificarError(error, servicio);

        // No reintentar errores no reintentables
        if (!ultimoError.reintentar) {
          throw ultimoError;
        }

        // No reintentar en el último intento
        if (intento === this.configuracion.maxReintentos) {
          break;
        }

        // Calcular retraso
        let retraso: number;
        if (ultimoError instanceof ErrorLimiteVelocidad) {
          retraso = ultimoError.reintentarDespues;
        } else {
          retraso = this.calcularRetrasoRetroceso(intento);
        }

        // Registrar intento de reintento
        const descripcionOperacion = nombreOperacion ? ` para ${nombreOperacion}` : '';
        console.warn(
          `${ultimoError.name}${descripcionOperacion}. Reintentando en ${retraso}ms (intento ${intento}/${this.configuracion.maxReintentos}): ${ultimoError.message}`
        );

        await this.dormir(retraso);
      }
    }

    // Mejorar mensaje de error con información de reintento
    const descripcionOperacion = nombreOperacion ? ` para ${nombreOperacion}` : '';
    if (!ultimoError) {
      throw new ErrorSpotifyTidal(
        `Falló después de ${this.configuracion.maxReintentos} intentos${descripcionOperacion}. No hay detalles de error disponibles.`,
        'ERROR_DESCONOCIDO',
        undefined,
        false
      );
    }
    
    throw new ErrorSpotifyTidal(
      `Falló después de ${this.configuracion.maxReintentos} intentos${descripcionOperacion}. Último error: ${ultimoError.message}`,
      ultimoError.codigo,
      ultimoError,
      false
    );
  }

  /**
   * Calcular retraso de retroceso exponencial con variación opcional
   */
  private calcularRetrasoRetroceso(intento: number): number {
    let retraso = this.configuracion.retrasoBase * Math.pow(this.configuracion.multiplicadorRetroceso, intento - 1);
    
    // Aplicar límite máximo de retraso
    retraso = Math.min(retraso, this.configuracion.retrasoMaximo);

    // Agregar variación para prevenir efecto manada
    if (this.configuracion.variacion) {
      retraso = retraso * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(retraso);
  }

  /**
   * Obtener retraso de reintento desde los headers de respuesta de límite de velocidad
   */
  private obtenerRetrasoReintentarDespues(error: AxiosError): number {
    const reintentarDespues = error.response?.headers['retry-after'];
    
    if (reintentarDespues) {
      const segundos = parseInt(reintentarDespues, 10);
      if (!isNaN(segundos)) {
        return segundos * 1000;
      }
    }

    // Por defecto 5 segundos para límite de velocidad si no se proporciona header
    return 5000;
  }

  /**
   * Verificar si el error es un error de Axios
   */
  private esErrorAxios(error: any): error is AxiosError {
    return error.isAxiosError === true;
  }

  /**
   * Verificar si el error está relacionado con la red
   */
  private esErrorRed(error: Error): boolean {
    const codigosErrorRed = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'EAI_AGAIN'
    ];

    return codigosErrorRed.some(codigo => 
      error.message.includes(codigo) || 
      (error as any).code === codigo
    );
  }

  /**
   * Dormir por los milisegundos especificados
   */
  private dormir(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtener mensaje de error amigable para mostrar al usuario
   */
  obtenerMensajeAmigable(error: ErrorSpotifyTidal): string {
    switch (error.codigo) {
      case 'ERROR_AUTH_SPOTIFY':
        return 'La autenticación de Spotify falló. Por favor verifica tu ID de cliente y secreto en credentials.txt';
      
      case 'ERROR_AUTH_TIDAL':
        return 'La autenticación de Tidal falló. Por favor verifica tu ID de cliente y secreto en credentials.txt';
      
      case 'LIMITE_VELOCIDAD_SPOTIFY':
        return 'Spotify está limitando las solicitudes. La aplicación reintentará automáticamente después del retraso requerido.';
      
      case 'LIMITE_VELOCIDAD_TIDAL':
        return 'Tidal está limitando las solicitudes. La aplicación reintentará automáticamente después del retraso requerido.';
      
      case 'ERROR_RED':
        return 'Error de conexión de red. Por favor verifica tu conexión a internet e intenta de nuevo.';
      
      case 'SERVICIO_NO_DISPONIBLE_SPOTIFY':
        return 'El servicio de Spotify no está disponible temporalmente. Por favor intenta más tarde.';
      
      case 'SERVICIO_NO_DISPONIBLE_TIDAL':
        return 'El servicio de Tidal no está disponible temporalmente. Por favor intenta más tarde.';
      
      default:
        return error.message;
    }
  }
}