import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

type JsonResponse = { status(code: number): { json(body: unknown): void } };

@Catch(HttpException)
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    response.status(exception.getStatus()).json({
      code: 'EXTERNAL_API_UNAVAILABLE',
      message: exception.message,
    });
  }
}
