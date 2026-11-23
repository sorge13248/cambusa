import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard.js';
import { HouseholdMemberGuard } from '../common/household/household-member.guard.js';
import { resolveUploadsDir } from '../load-env.js';
import { ProductsService } from '../services/products.service.js';
import { ProductsController } from './products.controller.js';

describe('ProductsController', () => {
  let controller: ProductsController;
  const uploadsDir = resolveUploadsDir();
  const productsDir = join(uploadsDir, 'products');
  const testFileName = 'test-product-pic-123.webp';
  const testFilePath = join(productsDir, testFileName);

  beforeEach(async () => {
    mkdirSync(productsDir, { recursive: true });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        {
          provide: ProductsService,
          useValue: {},
        },
      ],
    })
      .overrideGuard(BearerJwtGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(HouseholdMemberGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  afterEach(() => {
    if (existsSync(testFilePath)) {
      rmSync(testFilePath, { force: true });
    }
  });

  describe('getPicture', () => {
    it('throws NotFoundException when picture does not exist', () => {
      const mockRes: any = {
        setHeader: vi.fn(),
      };

      expect(() => controller.getPicture('non-existent.webp', mockRes)).toThrow(NotFoundException);
    });

    it('streams file with WebP and immutable cache headers when picture exists', async () => {
      writeFileSync(testFilePath, Buffer.from('RIFF....WEBP'));

      const headers: Record<string, string> = {};
      const chunks: Buffer[] = [];

      const mockRes: any = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(Buffer.from(chunk));
          callback();
        },
      });
      mockRes.setHeader = vi.fn((key: string, value: string) => {
        headers[key] = value;
      });

      controller.getPicture(testFileName, mockRes);

      await new Promise<void>((resolve) => {
        mockRes.on('finish', () => resolve());
      });

      expect(headers['Content-Type']).toBe('image/webp');
      expect(headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
      expect(Buffer.concat(chunks).toString()).toBe('RIFF....WEBP');
    });

    it('sanitizes unsafe characters in filename against path traversal', () => {
      const mockRes: any = {
        setHeader: vi.fn(),
      };

      expect(() => controller.getPicture('../../../etc/passwd', mockRes)).toThrow(NotFoundException);
    });
  });
});
