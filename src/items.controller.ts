import { Controller, Get } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { Item, ItemsService } from './items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  async getItems(): Promise<Item[]> {
    return firstValueFrom(this.itemsService.getItems());
  }
}
