import { BadRequestException } from '@nestjs/common';

/** Separate administrative workspace, authorized by AdminPage before rendering. */
export class ContentPage {
  async read(query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException('Editor HTML accepts no query parameters');
    return { view: 'admin-content-editor', model: { layout: false as const, section: 'editor' as const,
      title: 'Editor de tienda', message: '', available: true } };
  }
}
