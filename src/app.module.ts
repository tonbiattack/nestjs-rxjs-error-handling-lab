import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { HttpErrorFilter } from './http-error.filter';

@Module({ imports: [HttpModule], controllers: [ItemsController], providers: [ItemsService, HttpErrorFilter] })
export class AppModule {}
