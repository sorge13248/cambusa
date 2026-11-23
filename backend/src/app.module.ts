import './load-env.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolveDatabasePath } from './load-env.js';
import { BearerJwtGuard } from './common/auth/bearer-jwt.guard.js';
import { HouseholdMemberGuard } from './common/household/household-member.guard.js';
import { AuthController } from './controllers/auth.controller.js';
import { CatalogsController } from './controllers/catalogs.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { HouseholdsController } from './controllers/households.controller.js';
import { ProductsController } from './controllers/products.controller.js';
import { SavedFiltersController } from './controllers/saved-filters.controller.js';
import { ShoppingListController } from './controllers/shopping-list.controller.js';
import { StockController } from './controllers/stock.controller.js';
import { SyncController } from './controllers/sync.controller.js';
import { ProfileController } from './controllers/profile.controller.js';
import { NextController } from './controllers/next.controller.js';
import {
  ApiKey,
  Household,
  HouseholdInvitation,
  HouseholdMember,
  Location,
  Product,
  ProductGroup,
  ProductStore,
  QuantityUnit,
  SavedFilter,
  ShoppingList,
  ShoppingListItem,
  StockItem,
  Store,
  SyncTombstone,
  User,
  UserSettings,
} from './entities/index.js';
import { CatalogsService } from './services/catalogs.service.js';
import { HouseholdsService } from './services/households.service.js';
import { ProductsService } from './services/products.service.js';
import { SavedFiltersService } from './services/saved-filters.service.js';
import { ShoppingListService } from './services/shopping-list.service.js';
import { StockService } from './services/stock.service.js';
import { SyncService } from './services/sync.service.js';
import { UsersService } from './services/users.service.js';
import { ProfileService } from './services/profile.service.js';
import { NextService } from './services/next.service.js';
import { MailService } from './services/mail.service.js';

const ENTITIES = [
  User,
  Household,
  HouseholdMember,
  HouseholdInvitation,
  QuantityUnit,
  ProductGroup,
  Location,
  Store,
  Product,
  ProductStore,
  StockItem,
  ShoppingList,
  ShoppingListItem,
  SavedFilter,
  SyncTombstone,
  ApiKey,
  UserSettings,
];

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: resolveDatabasePath(),
      entities: ENTITIES,
      autoLoadEntities: process.env.DB_AUTO_LOAD_ENTITIES !== 'false',
      synchronize: process.env.DB_SYNCHRONIZE !== 'false',
      logging: process.env.DB_LOGGING === 'true',
      prepareDatabase: (db: any) => {
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('foreign_keys = ON');
      },
    }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  controllers: [
    HealthController,
    AuthController,
    HouseholdsController,
    CatalogsController,
    ProductsController,
    StockController,
    ShoppingListController,
    SavedFiltersController,
    SyncController,
    ProfileController,
    NextController,
  ],
  providers: [
    UsersService,
    HouseholdsService,
    CatalogsService,
    ProductsService,
    StockService,
    ShoppingListService,
    SavedFiltersService,
    SyncService,
    ProfileService,
    NextService,
    MailService,
    BearerJwtGuard,
    HouseholdMemberGuard,
  ],
  exports: [
    UsersService,
    HouseholdsService,
    CatalogsService,
    ProductsService,
    StockService,
    ShoppingListService,
    SavedFiltersService,
    SyncService,
    ProfileService,
    NextService,
    MailService,
    BearerJwtGuard,
    HouseholdMemberGuard,
  ],
})
export class AppModule {}
