import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IdempotencyInterceptor } from '@common/interceptors/idempotency.interceptor';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsService } from './posts.service';

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // The frontend is responsible for calling this exactly once per view load
  // (see the Redux slice's fetch guard) — nothing enforces that server-side.
  @Get()
  findAll() {
    return this.postsService.findAll();
  }

  // Tighter than the global 120/min default (registered in AppModule):
  // creates are a write, worth throttling harder than reads regardless of
  // the idempotency-key protection against *accidental* duplicates.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  create(@Body() dto: CreatePostDto) {
    return this.postsService.create(dto);
  }

  // Not idempotency-key protected like create: a PATCH-by-id replace is
  // already naturally idempotent (applying the same body twice yields the
  // same end state), so the extra machinery isn't needed here.
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreatePostDto) {
    return this.postsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.postsService.remove(id);
  }
}
