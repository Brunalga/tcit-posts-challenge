import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { postsApi } from './api/postsApi';
import { postsReducer } from './store/postsSlice';
import type { Post } from './types/post';

vi.mock('./api/postsApi', () => ({
  postsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const initialPosts: [Post, Post] = [
  { id: '1', name: 'Hola mundo', description: 'primer post', createdAt: 'x', updatedAt: 'x' },
  { id: '2', name: 'Otro post', description: 'segundo', createdAt: 'x', updatedAt: 'x' },
];

function renderApp() {
  const store = configureStore({ reducer: { posts: postsReducer } });
  render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
  return store;
}

describe('App', () => {
  beforeEach(() => {
    vi.mocked(postsApi.list).mockReset().mockResolvedValue(initialPosts);
    vi.mocked(postsApi.create).mockReset();
    vi.mocked(postsApi.update).mockReset();
    vi.mocked(postsApi.remove).mockReset();
  });

  it('loads the list exactly once per view load and renders it', async () => {
    renderApp();

    await screen.findByText('Hola mundo');
    expect(screen.getByText('Otro post')).toBeInTheDocument();
    expect(postsApi.list).toHaveBeenCalledTimes(1);
  });

  it('filters the rendered list locally by name without any extra API calls', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByText('Hola mundo');

    await user.type(screen.getByLabelText('Buscar por nombre o descripción'), 'Otro');

    expect(screen.queryByText('Hola mundo')).not.toBeInTheDocument();
    expect(screen.getByText('Otro post')).toBeInTheDocument();
    expect(postsApi.list).toHaveBeenCalledTimes(1);
  });

  it('filters the rendered list by description too', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByText('Hola mundo');

    await user.type(screen.getByLabelText('Buscar por nombre o descripción'), 'segundo');

    expect(screen.queryByText('Hola mundo')).not.toBeInTheDocument();
    expect(screen.getByText('Otro post')).toBeInTheDocument();
  });

  it('renders large lists incrementally and loads more as the sentinel comes into view', async () => {
    const bigList: Post[] = Array.from({ length: 200 }, (_, i) => ({
      id: `id-${i}`,
      name: `Post ${i}`,
      description: `Description ${i}`,
      createdAt: 'x',
      updatedAt: 'x',
    }));
    vi.mocked(postsApi.list).mockResolvedValue(bigList);
    renderApp();

    await screen.findByText('Post 0');
    // Only the first page (150) should be mounted initially — the whole
    // point is not shoving all 200 rows into the DOM at once.
    expect(screen.getByText('Post 149')).toBeInTheDocument();
    expect(screen.queryByText('Post 199')).not.toBeInTheDocument();
    expect(screen.getByText(/Cargando más posts/)).toBeInTheDocument();

    // The mocked IntersectionObserver reports the sentinel as visible
    // almost immediately, which should trigger loading the rest.
    await waitFor(() => expect(screen.getByText('Post 199')).toBeInTheDocument());
    expect(screen.queryByText(/Cargando más posts/)).not.toBeInTheDocument();
  });

  it('creates a post via the form and shows it in the list', async () => {
    const user = userEvent.setup();
    const created: Post = { id: '3', name: 'Nuevo', description: 'creado', createdAt: 'x', updatedAt: 'x' };
    vi.mocked(postsApi.create).mockResolvedValue(created);
    renderApp();
    await screen.findByText('Hola mundo');

    await user.type(screen.getByLabelText('Nombre'), 'Nuevo');
    await user.type(screen.getByLabelText('Descripción'), 'creado');
    await user.click(screen.getByRole('button', { name: /crear/i }));

    await screen.findByText('Nuevo');
    expect(postsApi.create).toHaveBeenCalledWith({ name: 'Nuevo', description: 'creado' }, expect.any(String));
  });

  it('edits a post via the inline edit form', async () => {
    const user = userEvent.setup();
    const updated: Post = {
      id: '1',
      name: 'Hola actualizado',
      description: 'primer post',
      createdAt: 'x',
      updatedAt: 'y',
    };
    vi.mocked(postsApi.update).mockResolvedValue(updated);
    renderApp();
    await screen.findByText('Hola mundo');

    const row = screen.getByText('Hola mundo').closest('tr');
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole('button', { name: /editar/i }));

    const nameInput = screen.getByLabelText('Editar nombre de Hola mundo');
    await user.clear(nameInput);
    await user.type(nameInput, 'Hola actualizado');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await screen.findByText('Hola actualizado');
    expect(screen.queryByText('Hola mundo')).not.toBeInTheDocument();
    expect(postsApi.update).toHaveBeenCalledWith('1', { name: 'Hola actualizado', description: 'primer post' });
  });

  it('cancels an inline edit without calling the API', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByText('Hola mundo');

    const row = screen.getByText('Hola mundo').closest('tr');
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole('button', { name: /editar/i }));
    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(screen.getByText('Hola mundo')).toBeInTheDocument();
    expect(postsApi.update).not.toHaveBeenCalled();
  });

  it('deletes a post after confirming in the modal', async () => {
    const user = userEvent.setup();
    vi.mocked(postsApi.remove).mockResolvedValue(initialPosts[0]);
    renderApp();
    await screen.findByText('Hola mundo');

    const row = screen.getByText('Hola mundo').closest('tr');
    expect(row).not.toBeNull();

    // A single click on "Eliminar" must not delete outright — it should
    // only open the confirmation modal.
    await user.click(within(row as HTMLElement).getByRole('button', { name: /^eliminar$/i }));
    expect(postsApi.remove).not.toHaveBeenCalled();
    expect(screen.getByText('Hola mundo')).toBeInTheDocument();

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Hola mundo');
    await user.click(within(dialog).getByRole('button', { name: /sí, eliminar/i }));

    await waitFor(() => expect(screen.queryByText('Hola mundo')).not.toBeInTheDocument());
    expect(postsApi.remove).toHaveBeenCalledWith('1');
  });

  it('cancels a delete confirmation without calling the API', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByText('Hola mundo');

    const row = screen.getByText('Hola mundo').closest('tr');
    expect(row).not.toBeNull();

    await user.click(within(row as HTMLElement).getByRole('button', { name: /^eliminar$/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /^cancelar$/i }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByText('Hola mundo')).toBeInTheDocument();
    expect(postsApi.remove).not.toHaveBeenCalled();
  });
});
