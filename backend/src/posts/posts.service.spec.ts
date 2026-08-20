import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { Post } from '@prisma/client';
import { PrismaService } from '@db/prisma.service';
import { PostsService } from './posts.service';

const mockPost: Post = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Hello',
  description: 'World',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  post: {
    findMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('PostsService', () => {
  let service: PostsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(PostsService);
    jest.clearAllMocks();
  });

  it('findAll — returns posts newest first', async () => {
    mockPrisma.post.findMany.mockResolvedValue([mockPost]);
    const result = await service.findAll();
    expect(result).toEqual([mockPost]);
    expect(mockPrisma.post.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
  });

  it('create — creates and returns the post', async () => {
    mockPrisma.post.create.mockResolvedValue(mockPost);
    const result = await service.create({
      name: 'Hello',
      description: 'World',
    });
    expect(result).toEqual(mockPost);
    expect(mockPrisma.post.create).toHaveBeenCalledWith({
      data: { name: 'Hello', description: 'World' },
    });
  });

  it('update — updates and returns the post', async () => {
    const updated = { ...mockPost, name: 'Updated', description: 'Changed' };
    mockPrisma.post.findUnique.mockResolvedValue(mockPost);
    mockPrisma.post.update.mockResolvedValue(updated);
    const result = await service.update(mockPost.id, {
      name: 'Updated',
      description: 'Changed',
    });
    expect(result).toEqual(updated);
    expect(mockPrisma.post.update).toHaveBeenCalledWith({
      where: { id: mockPost.id },
      data: { name: 'Updated', description: 'Changed' },
    });
  });

  it('update — throws NotFoundException when the post does not exist', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(null);
    await expect(
      service.update('missing-id', { name: 'A', description: 'B' }),
    ).rejects.toThrow(NotFoundException);
    expect(mockPrisma.post.update).not.toHaveBeenCalled();
  });

  it('remove — deletes and returns the post', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(mockPost);
    mockPrisma.post.delete.mockResolvedValue(mockPost);
    const result = await service.remove(mockPost.id);
    expect(result).toEqual(mockPost);
    expect(mockPrisma.post.delete).toHaveBeenCalledWith({
      where: { id: mockPost.id },
    });
  });

  it('remove — throws NotFoundException when the post does not exist', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(null);
    await expect(service.remove('missing-id')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockPrisma.post.delete).not.toHaveBeenCalled();
  });
});
