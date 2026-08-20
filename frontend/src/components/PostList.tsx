import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../hooks/redux';
import { deletePost, selectFilteredPosts, updatePost } from '../store/postsSlice';
import type { Post } from '../types/post';
import { ConfirmDialog } from './ConfirmDialog';

// How many rows are rendered at a time. The full list is still fetched in
// one request (per the brief), but with thousands of rows, mounting every
// <tr> at once is what actually makes the page feel slow — this only
// changes how much of the already-loaded data gets rendered.
const PAGE_SIZE = 150;
// Fetching more is instant (it's already in memory) — this delay just makes
// the loader perceivable and lets rows commit in batches instead of one
// giant synchronous render.
const LOAD_MORE_DELAY_MS = 200;

export function PostList() {
  const dispatch = useAppDispatch();
  const posts = useAppSelector(selectFilteredPosts);
  const totalCount = useAppSelector((state) => state.posts.items.length);
  const filterText = useAppSelector((state) => state.posts.filterText);
  const listStatus = useAppSelector((state) => state.posts.listStatus);
  const listError = useAppSelector((state) => state.posts.listError);
  const deletingIds = useAppSelector((state) => state.posts.deletingIds);
  const updatingIds = useAppSelector((state) => state.posts.updatingIds);
  const updateError = useAppSelector((state) => state.posts.updateError);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const visiblePosts = posts.slice(0, visibleCount);
  const hasMore = visibleCount < posts.length;

  // A new search should start from a short, fast-to-render page again,
  // not stay wherever the previous (unrelated) result set had scrolled to.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filterText]);

  useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        window.setTimeout(() => {
          setVisibleCount((count) => Math.min(count + PAGE_SIZE, posts.length));
        }, LOAD_MORE_DELAY_MS);
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, posts.length]);

  function startEditing(post: Post): void {
    setEditingId(post.id);
    setDraftName(post.name);
    setDraftDescription(post.description);
  }

  function cancelEditing(): void {
    setEditingId(null);
  }

  async function saveEditing(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editingId) return;
    const trimmedName = draftName.trim();
    const trimmedDescription = draftDescription.trim();
    if (!trimmedName || !trimmedDescription) return;

    const result = await dispatch(
      updatePost({ id: editingId, input: { name: trimmedName, description: trimmedDescription } }),
    );
    if (updatePost.fulfilled.match(result)) {
      setEditingId(null);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    await dispatch(deletePost(deleteTarget.id));
    setDeleteTarget(null);
  }

  if (listStatus === 'loading' || listStatus === 'idle') {
    return (
      <div className="card post-list-card">
        <p className="post-list-status">
          <span className="spinner" aria-hidden="true" /> Cargando posts…
        </p>
      </div>
    );
  }

  if (listStatus === 'failed') {
    return (
      <div className="card post-list-card">
        <p role="alert" className="post-list-status post-list-error">
          ⚠️ {listError}
        </p>
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="card post-list-card">
        <p className="post-list-status">🗒️ No hay posts para mostrar todavía.</p>
      </div>
    );
  }

  return (
    <div className="card post-list-card">
      <div className="post-list-header">
        <h2>Posts</h2>
        <span className="post-count-badge">{totalCount}</span>
      </div>

      {posts.length === 0 ? (
        <p className="post-list-status">🔍 Ningún post coincide con el filtro.</p>
      ) : (
        <div className="post-table-scroll">
          <table className="post-list">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {visiblePosts.map((post) => {
                const isUpdating = updatingIds.includes(post.id);
                const isEditing = editingId === post.id;

                if (isEditing) {
                  return (
                    <tr key={post.id} className="post-row-editing">
                      <td colSpan={3}>
                        <form className="post-edit-form" onSubmit={saveEditing}>
                          <input
                            type="text"
                            value={draftName}
                            onChange={(event) => setDraftName(event.target.value)}
                            maxLength={255}
                            aria-label={`Editar nombre de ${post.name}`}
                            autoFocus
                            required
                          />
                          <input
                            type="text"
                            value={draftDescription}
                            onChange={(event) => setDraftDescription(event.target.value)}
                            maxLength={2000}
                            aria-label={`Editar descripción de ${post.name}`}
                            required
                          />
                          <div className="post-edit-actions">
                            <button type="submit" className="btn-save" disabled={isUpdating}>
                              {isUpdating ? 'Guardando…' : '✓ Guardar'}
                            </button>
                            <button
                              type="button"
                              className="btn-cancel"
                              onClick={cancelEditing}
                              disabled={isUpdating}
                            >
                              Cancelar
                            </button>
                          </div>
                          {updateError && (
                            <p role="alert" className="form-error">
                              {updateError}
                            </p>
                          )}
                        </form>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={post.id}>
                    <td className="post-name-cell">{post.name}</td>
                    <td className="post-description-cell">{post.description}</td>
                    <td className="post-actions">
                      <button type="button" className="btn-edit" onClick={() => startEditing(post)}>
                        Editar
                      </button>
                      <button type="button" className="btn-delete" onClick={() => setDeleteTarget(post)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasMore && (
            <div ref={sentinelRef} className="post-list-load-more">
              <span className="spinner" aria-hidden="true" /> Cargando más posts… ({visibleCount}/{posts.length})
            </div>
          )}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Eliminar post"
          message={`¿Eliminar "${deleteTarget.name}"? Esta acción no se puede deshacer.`}
          confirmLabel="Sí, eliminar"
          confirmingLabel="Eliminando…"
          isConfirming={deletingIds.includes(deleteTarget.id)}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
