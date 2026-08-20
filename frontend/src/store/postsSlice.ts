import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { ApiError } from '../api/client';
import { postsApi } from '../api/postsApi';
import type { CreatePostInput, Post } from '../types/post';
import type { RootState } from './store';

type LoadStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

interface RejectValue {
  status?: number;
  message: string;
}

interface PostsState {
  items: Post[];
  listStatus: LoadStatus;
  listError: string | null;
  createStatus: LoadStatus;
  createError: string | null;
  deletingIds: string[];
  updatingIds: string[];
  updateError: string | null;
  filterText: string;
}

const initialState: PostsState = {
  items: [],
  listStatus: 'idle',
  listError: null,
  createStatus: 'idle',
  createError: null,
  deletingIds: [],
  updatingIds: [],
  updateError: null,
  filterText: '',
};

/**
 * Fetches the full post list. Guarded by `condition` so it only ever hits
 * the network once per view load — dispatching this again while idle-since
 * loaded (or already loading) is a silent no-op, satisfying the brief's
 * "call the list endpoint exactly once per view load" requirement even if
 * something dispatches it more than once (e.g. React StrictMode's dev
 * double-invoke, or more than one component wanting the data).
 */
export const fetchPosts = createAsyncThunk<Post[], void, { state: RootState }>(
  'posts/fetchPosts',
  async () => postsApi.list(),
  {
    condition: (_arg, { getState }) => getState().posts.listStatus === 'idle',
  },
);

export const createPost = createAsyncThunk<Post, CreatePostInput>('posts/createPost', async (input) =>
  postsApi.create(input, crypto.randomUUID()),
);

export const updatePost = createAsyncThunk<Post, { id: string; input: CreatePostInput }, { rejectValue: RejectValue }>(
  'posts/updatePost',
  async ({ id, input }, { rejectWithValue }) => {
    try {
      return await postsApi.update(id, input);
    } catch (err) {
      if (err instanceof ApiError) return rejectWithValue({ status: err.status, message: err.message });
      throw err;
    }
  },
);

export const deletePost = createAsyncThunk<Post, string, { rejectValue: RejectValue }>(
  'posts/deletePost',
  async (id, { rejectWithValue }) => {
    try {
      return await postsApi.remove(id);
    } catch (err) {
      if (err instanceof ApiError) return rejectWithValue({ status: err.status, message: err.message });
      throw err;
    }
  },
);

const postsSlice = createSlice({
  name: 'posts',
  initialState,
  reducers: {
    setFilterText(state, action: PayloadAction<string>) {
      state.filterText = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPosts.pending, (state) => {
        state.listStatus = 'loading';
        state.listError = null;
      })
      .addCase(fetchPosts.fulfilled, (state, action) => {
        state.listStatus = 'succeeded';
        state.items = action.payload;
      })
      .addCase(fetchPosts.rejected, (state, action) => {
        state.listStatus = 'failed';
        state.listError = action.error.message ?? 'Failed to load posts';
      })
      .addCase(createPost.pending, (state) => {
        state.createStatus = 'loading';
        state.createError = null;
      })
      .addCase(createPost.fulfilled, (state, action) => {
        state.createStatus = 'succeeded';
        state.items.unshift(action.payload);
      })
      .addCase(createPost.rejected, (state, action) => {
        state.createStatus = 'failed';
        state.createError = action.error.message ?? 'Failed to create post';
      })
      .addCase(updatePost.pending, (state, action) => {
        state.updatingIds.push(action.meta.arg.id);
        state.updateError = null;
      })
      .addCase(updatePost.fulfilled, (state, action) => {
        state.updatingIds = state.updatingIds.filter((id) => id !== action.meta.arg.id);
        const index = state.items.findIndex((post) => post.id === action.payload.id);
        if (index !== -1) state.items[index] = action.payload;
      })
      .addCase(updatePost.rejected, (state, action) => {
        const id = action.meta.arg.id;
        state.updatingIds = state.updatingIds.filter((updatingId) => updatingId !== id);
        state.updateError = action.payload?.message ?? action.error.message ?? 'Failed to update post';
        if (action.payload?.status === 404) {
          // The post was already gone server-side (deleted elsewhere, or a
          // stale list from before this session's last real fetch) — drop
          // it locally too instead of leaving an un-editable ghost row.
          state.items = state.items.filter((post) => post.id !== id);
        }
      })
      .addCase(deletePost.pending, (state, action) => {
        state.deletingIds.push(action.meta.arg);
      })
      .addCase(deletePost.fulfilled, (state, action) => {
        state.deletingIds = state.deletingIds.filter((id) => id !== action.meta.arg);
        state.items = state.items.filter((post) => post.id !== action.payload.id);
      })
      .addCase(deletePost.rejected, (state, action) => {
        const id = action.meta.arg;
        state.deletingIds = state.deletingIds.filter((deletingId) => deletingId !== id);
        if (action.payload?.status === 404) {
          // Already deleted server-side — remove the ghost row instead of
          // leaving a "Eliminar" button that will just 404 forever.
          state.items = state.items.filter((post) => post.id !== id);
        }
      });
  },
});

export const { setFilterText } = postsSlice.actions;
export const postsReducer = postsSlice.reducer;

export const selectFilteredPosts = (state: RootState): Post[] => {
  const { items, filterText } = state.posts;
  const needle = filterText.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (post) => post.name.toLowerCase().includes(needle) || post.description.toLowerCase().includes(needle),
  );
};
