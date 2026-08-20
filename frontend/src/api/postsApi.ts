import { apiDelete, apiGet, apiPatch, apiPostIdempotent } from './client';
import type { CreatePostInput, Post } from '../types/post';

export const postsApi = {
  list(): Promise<Post[]> {
    return apiGet<Post[]>('/posts');
  },

  create(input: CreatePostInput, idempotencyKey: string): Promise<Post> {
    return apiPostIdempotent<Post>('/posts', input, idempotencyKey);
  },

  update(id: string, input: CreatePostInput): Promise<Post> {
    return apiPatch<Post>(`/posts/${id}`, input);
  },

  remove(id: string): Promise<Post> {
    return apiDelete<Post>(`/posts/${id}`);
  },
};
