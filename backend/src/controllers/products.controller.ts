import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard.js';
import { ActiveHousehold } from '../common/household/active-household.decorator.js';
import { HouseholdMemberGuard } from '../common/household/household-member.guard.js';
import { Product } from '../entities/index.js';
import { ProductsService } from '../services/products.service.js';
import { resolveUploadsDir } from '../load-env.js';

interface MulterUploadFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

@Controller('products')
export class ProductsController {
  private readonly uploadsDir: string;

  constructor(private readonly productsService: ProductsService) {
    this.uploadsDir = resolveUploadsDir();
  }

  @Get('pictures/:fileName')
  getPicture(@Param('fileName') fileName: string, @Res() res: Response) {
    // Sanitize filename against path traversal
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
    const filePath = join(this.uploadsDir, 'products', safeName);

    if (!existsSync(filePath)) {
      throw new NotFoundException('Picture not found');
    }

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    createReadStream(filePath).pipe(res);
  }

  @Get()
  @UseGuards(BearerJwtGuard, HouseholdMemberGuard)
  getProducts(
    @ActiveHousehold() householdId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.productsService.getProducts(householdId, includeInactive === 'true' || includeInactive === '1');
  }

  @Get(':id')
  @UseGuards(BearerJwtGuard, HouseholdMemberGuard)
  getProductById(@ActiveHousehold() householdId: string, @Param('id') id: string) {
    return this.productsService.getProductById(id, householdId);
  }

  @Post()
  @UseGuards(BearerJwtGuard, HouseholdMemberGuard)
  createProduct(@ActiveHousehold() householdId: string, @Body() body: Partial<Product>) {
    return this.productsService.createProduct(householdId, body);
  }

  @Put(':id')
  @UseGuards(BearerJwtGuard, HouseholdMemberGuard)
  updateProduct(
    @ActiveHousehold() householdId: string,
    @Param('id') id: string,
    @Body() body: Partial<Product>,
  ) {
    return this.productsService.updateProduct(id, householdId, body);
  }

  @Delete(':id')
  @UseGuards(BearerJwtGuard, HouseholdMemberGuard)
  deleteProduct(@ActiveHousehold() householdId: string, @Param('id') id: string) {
    return this.productsService.deleteProduct(id, householdId);
  }

  @Get(':id/stores')
  @UseGuards(BearerJwtGuard, HouseholdMemberGuard)
  getProductStores(@ActiveHousehold() householdId: string, @Param('id') id: string) {
    return this.productsService.getProductStores(id, householdId);
  }

  @Put(':id/stores/:storeId')
  @UseGuards(BearerJwtGuard, HouseholdMemberGuard)
  setProductStore(
    @ActiveHousehold() householdId: string,
    @Param('id') id: string,
    @Param('storeId') storeId: string,
    @Body()
    body: {
      aisle?: string | null;
      aisleOrder?: number | null;
      averagePrice?: number | null;
      isPreferred?: boolean;
    },
  ) {
    return this.productsService.setProductStore(id, storeId, householdId, body);
  }

  @Delete(':id/stores/:storeId')
  @UseGuards(BearerJwtGuard, HouseholdMemberGuard)
  removeProductStore(
    @ActiveHousehold() householdId: string,
    @Param('id') id: string,
    @Param('storeId') storeId: string,
  ) {
    return this.productsService.removeProductStore(id, storeId, householdId);
  }

  @Post(':id/picture')
  @UseGuards(BearerJwtGuard, HouseholdMemberGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async uploadPicture(
    @ActiveHousehold() householdId: string,
    @Param('id') id: string,
    @UploadedFile() file?: MulterUploadFile,
  ) {
    if (!file?.buffer) {
      throw new NotFoundException('No file buffer provided');
    }
    const fileName = await this.productsService.saveProductPicture(id, householdId, file.buffer);
    return { fileName, url: `/api/products/pictures/${fileName}` };
  }

  @Delete(':id/picture/:fileName')
  @UseGuards(BearerJwtGuard, HouseholdMemberGuard)
  async deletePicture(
    @ActiveHousehold() householdId: string,
    @Param('id') id: string,
    @Param('fileName') fileName: string,
  ) {
    const pictures = await this.productsService.deleteProductPicture(id, householdId, fileName);
    return { pictures };
  }

  @Put(':id/pictures/order')
  @UseGuards(BearerJwtGuard, HouseholdMemberGuard)
  async reorderPictures(
    @ActiveHousehold() householdId: string,
    @Param('id') id: string,
    @Body() body: { pictureFileNames: string[] },
  ) {
    const pictures = await this.productsService.reorderProductPictures(id, householdId, body.pictureFileNames);
    return { pictures };
  }
}
