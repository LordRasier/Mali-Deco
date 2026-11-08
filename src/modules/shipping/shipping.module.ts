import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { pendingShippingService, ShippingQuoteController, ShippingQuoteService } from './quotes/catalog-quote';
import { PostalCodeResolver } from './postal/postal-code-resolver';

@Module({
  controllers: [ShippingQuoteController],
  providers: [
    { provide: PostalCodeResolver, useFactory: () => new PostalCodeResolver() },
    { provide: ShippingQuoteService, useFactory: (db?: DataSource) => pendingShippingService(db, process.env), inject: [{ token: DataSource, optional: true }] },
  ],
  // Candidate IDs and lookup budgets must be shared with checkout, not recreated there.
  exports: [PostalCodeResolver],
})
export class ShippingModule {}
