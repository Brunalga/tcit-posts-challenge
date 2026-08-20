import { Module } from '@nestjs/common';
import { IdempotencyInterceptor } from '@common/interceptors/idempotency.interceptor';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  controllers: [PostsController],
  providers: [PostsService, IdempotencyInterceptor],
})
export class PostsModule {}
