export const ERROR_CODES = {
  SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
  SOURCE_DISABLED: 'SOURCE_DISABLED',
  SOURCE_CAPABILITY_UNSUPPORTED: 'SOURCE_CAPABILITY_UNSUPPORTED',
  SOURCE_UPDATE_FAILED: 'SOURCE_UPDATE_FAILED',
  SOURCE_SCRIPT_ERROR: 'SOURCE_SCRIPT_ERROR',
  MUSIC_NOT_FOUND: 'MUSIC_NOT_FOUND',
  QUALITY_UNSUPPORTED: 'QUALITY_UNSUPPORTED',
  DOWNLOAD_TASK_NOT_FOUND: 'DOWNLOAD_TASK_NOT_FOUND',
  DOWNLOAD_PATH_INVALID: 'DOWNLOAD_PATH_INVALID',
  DOWNLOAD_RESUME_FAILED: 'DOWNLOAD_RESUME_FAILED',
  METADATA_EMBED_FAILED: 'METADATA_EMBED_FAILED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

export class AppError extends Error {
  constructor(code, message, details = {}, status = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export const isAppError = error => error instanceof AppError;

export const toErrorBody = error => {
  if (isAppError(error)) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? {}
      }
    };
  }

  return {
    ok: false,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: error?.message || 'Internal error',
      details: {}
    }
  };
};
