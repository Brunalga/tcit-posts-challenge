import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}

// Normalizes every thrown error into Nest's standard { statusCode, message,
// error } shape. HttpExceptions (thrown by us or by the ValidationPipe)
// already carry that shape via getResponse() — this filter's real job is
// translating Prisma's known errors, which don't.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body, error: exception.name }
            : body,
        );
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') {
        this.send(
          response,
          HttpStatus.NOT_FOUND,
          'Resource not found.',
          'Not Found',
        );
        return;
      }
      if (exception.code === 'P2002') {
        this.send(
          response,
          HttpStatus.CONFLICT,
          'Resource already exists.',
          'Conflict',
        );
        return;
      }
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    this.send(
      response,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Something went wrong.',
      'Internal Server Error',
    );
  }

  private send(
    response: Response,
    statusCode: number,
    message: string,
    error: string,
  ): void {
    const body: ErrorBody = { statusCode, message, error };
    response.status(statusCode).json(body);
  }
}
