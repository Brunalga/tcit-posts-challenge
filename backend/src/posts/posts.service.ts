import { Injectable, NotFoundException } from '@nestjs/common';
import type { Post } from '@prisma/client';
import { PrismaService } from '@db/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Post[]> {
    return this.prisma.post.findMany({ orderBy: { createdAt: 'desc' } });
  }

  create(dto: CreatePostDto): Promise<Post> {
    return this.prisma.post.create({ data: dto });
  }

  async update(id: string, dto: CreatePostDto): Promise<Post> {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    return this.prisma.post.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<Post> {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    return this.prisma.post.delete({ where: { id } });
  }
}
