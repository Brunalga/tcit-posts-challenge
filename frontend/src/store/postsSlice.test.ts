import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { postsApi } from '../api/postsApi';
import type { Post } from '../types/post';
import {
  createPost,
  deletePost,
  fetchPosts,
  postsReducer,
  selectFilteredPosts,
  setFilterText,
  updatePost,
} from './postsSlice';

vi.mock('../api/postsApi', () => ({
  postsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

function makeStore() {
  return configureStore({ reducer: { posts: postsReducer } });
}

// Typed as a tuple (not Post[]) so indexed access below stays `Post`, not
// `Post | undefined`, under the project's noUncheckedIndexedAccess setting.
const samplePosts: [Post, Post] = [
  { id: '1', name: 'Alpha', description: 'A', createdAt: 'x', updatedAt: 'x' },
  { id: '2', name: 'Beta', description: 'B', createdAt: 'x', updatedAt: 'x' },
];

describe('postsSlice', () => {
  beforeEach(() => {
    vi.mocked(postsApi.list).mockReset();
    vi.mocked(postsApi.create).mockReset();
    vi.mocked(postsApi.update).mockReset();
    vi.mocked(postsApi.remove).mockReset();
  });

  it('fetchPosts populates items and only ever calls the API once per view load', async () => {
    vi.mocked(postsApi.list).mockResolvedValue(samplePosts);
    const store = makeStore();

    // Simulates the guard being exercised by more than one dispatch — React
    // StrictMode's double effect invocation, or multiple mounted consumers.
    await store.dispatch(fetchPosts());
    await store.dispatch(fetchPosts());
    await store.dispatch(fetchPosts());

    expect(postsApi.list).toHaveBeenCalledTimes(1);
    expect(store.getState().posts.items).toEqual(samplePosts);
    expect(store.getState().posts.listStatus).toBe('succeeded');
  });

  it('selectFilteredPosts filters case-insensitively by name', () => {
    const store = makeStore();
    store.dispatch({ type: 'posts/fetchPosts/fulfilled', payload: samplePosts });
    store.dispatch(setFilterText('bet'));

    expect(selectFilteredPosts(store.getState())).toEqual([samplePosts[1]]);
  });

  it('selectFilteredPosts also matches the description, not just the name', () => {
    const posts: [Post, Post] = [
      { id: '10', name: 'Zulu', description: 'contains unique-marker here', createdAt: 'x', updatedAt: 'x' },
      { id: '11', name: 'Yankee', description: 'nothing special', createdAt: 'x', updatedAt: 'x' },
    ];
    const store = makeStore();
    store.dispatch({ type: 'posts/fetchPosts/fulfilled', payload: posts });
    store.dispatch(setFilterText('unique-marker'));

    expect(selectFilteredPosts(store.getState())).toEqual([posts[0]]);
  });

  it('createPost prepends the new post and forwards an idempotency key', async () => {
    const created: Post = { id: '3', name: 'Gamma', description: 'G', createdAt: 'x', updatedAt: 'x' };
    vi.mocked(postsApi.create).mockResolvedValue(created);
    const store = makeStore();

    await store.dispatch(createPost({ name: 'Gamma', description: 'G' }));

    expect(store.getState().posts.items[0]).toEqual(created);
    expect(postsApi.create).toHaveBeenCalledWith({ name: 'Gamma', description: 'G' }, expect.any(String));
  });

  it('updatePost replaces the matching post in place', async () => {
    const store = makeStore();
    store.dispatch({ type: 'posts/fetchPosts/fulfilled', payload: samplePosts });

    const updated: Post = { id: '1', name: 'Alpha updated', description: 'A2', createdAt: 'x', updatedAt: 'y' };
    vi.mocked(postsApi.update).mockResolvedValue(updated);

    await store.dispatch(updatePost({ id: '1', input: { name: 'Alpha updated', description: 'A2' } }));

    expect(store.getState().posts.items[0]).toEqual(updated);
    expect(store.getState().posts.items[1]).toEqual(samplePosts[1]);
    expect(postsApi.update).toHaveBeenCalledWith('1', { name: 'Alpha updated', description: 'A2' });
    expect(store.getState().posts.updatingIds).not.toContain('1');
  });

  it('updatePost tracks the in-flight id and surfaces an error on failure', async () => {
    const store = makeStore();
    store.dispatch({ type: 'posts/fetchPosts/fulfilled', payload: samplePosts });

    let rejectUpdate!: (err: Error) => void;
    vi.mocked(postsApi.update).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectUpdate = reject;
        }),
    );

    const pending = store.dispatch(updatePost({ id: '1', input: { name: 'X', description: 'Y' } }));
    expect(store.getState().posts.updatingIds).toContain('1');

    rejectUpdate(new Error('network down'));
    await pending;

    expect(store.getState().posts.updatingIds).not.toContain('1');
    expect(store.getState().posts.updateError).toBe('network down');
    expect(store.getState().posts.items).toEqual(samplePosts);
  });

  it('deletePost removes the post locally even on a 404 (already deleted server-side)', async () => {
    const store = makeStore();
    store.dispatch({ type: 'posts/fetchPosts/fulfilled', payload: samplePosts });
    vi.mocked(postsApi.remove).mockRejectedValue(new ApiError(404, 'Post not found', 'Not Found'));

    await store.dispatch(deletePost('1'));

    // Without this, a stale/ghost row would sit in the list forever with a
    // delete button that just 404s again on every click.
    expect(store.getState().posts.items.map((post) => post.id)).toEqual(['2']);
    expect(store.getState().posts.deletingIds).not.toContain('1');
  });

  it('deletePost keeps the post locally on a non-404 failure', async () => {
    const store = makeStore();
    store.dispatch({ type: 'posts/fetchPosts/fulfilled', payload: samplePosts });
    vi.mocked(postsApi.remove).mockRejectedValue(new ApiError(500, 'boom', 'Internal Server Error'));

    await store.dispatch(deletePost('1'));

    expect(store.getState().posts.items).toEqual(samplePosts);
  });

  it('updatePost removes the post locally on a 404 (already deleted server-side)', async () => {
    const store = makeStore();
    store.dispatch({ type: 'posts/fetchPosts/fulfilled', payload: samplePosts });
    vi.mocked(postsApi.update).mockRejectedValue(new ApiError(404, 'Post not found', 'Not Found'));

    await store.dispatch(updatePost({ id: '1', input: { name: 'X', description: 'Y' } }));

    expect(store.getState().posts.items.map((post) => post.id)).toEqual(['2']);
  });

  it('deletePost tracks the in-flight id and removes the post on success', async () => {
    const store = makeStore();
    store.dispatch({ type: 'posts/fetchPosts/fulfilled', payload: samplePosts });

    let resolveDelete!: (post: Post) => void;
    vi.mocked(postsApi.remove).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );

    const pending = store.dispatch(deletePost('1'));
    expect(store.getState().posts.deletingIds).toContain('1');

    resolveDelete(samplePosts[0]);
    await pending;

    expect(store.getState().posts.items.map((post) => post.id)).toEqual(['2']);
    expect(store.getState().posts.deletingIds).not.toContain('1');
  });
});
