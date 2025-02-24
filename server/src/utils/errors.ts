export class BaseError extends Error {
    statusCode: number;
    code: string;
    details?: unknown;

    constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: unknown) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class BadRequestError extends BaseError {
    constructor(message: string = 'Requisição inválida') {
        super(message, 400, 'BAD_REQUEST');
    }
}

export class CustomError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public errors: any[] = []
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends CustomError {
  constructor(message: string = 'Recurso não encontrado') {
    super(message, 404);
  }
}

export class ValidationError extends CustomError {
  constructor(message: string = 'Erro de validação') {
    super(message, 400);
  }
}

export class UnauthorizedError extends CustomError {
  constructor(message: string = 'Não autorizado') {
    super(message, 401);
  }
}

export class AuthenticationError extends CustomError {
  constructor(message: string = 'Não autorizado') {
    super(message, 401);
  }
}

export class ForbiddenError extends CustomError {
  constructor(message: string = 'Acesso negado') {
    super(message, 403);
  }
}
