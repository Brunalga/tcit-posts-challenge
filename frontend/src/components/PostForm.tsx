import { useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../hooks/redux';
import { createPost } from '../store/postsSlice';

export function PostForm() {
  const dispatch = useAppDispatch();
  const createStatus = useAppSelector((state) => state.posts.createStatus);
  const createError = useAppSelector((state) => state.posts.createError);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const isSubmitting = createStatus === 'loading';

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName || !trimmedDescription) return;

    // A fresh Idempotency-Key per submit attempt; postsApi.create reuses it
    // across its own internal network retries, so a flaky connection can't
    // create the same post twice.
    const result = await dispatch(createPost({ name: trimmedName, description: trimmedDescription }));
    if (createPost.fulfilled.match(result)) {
      setName('');
      setDescription('');
    }
  }

  return (
    <div className="card post-form-card">
      <h2>✨ Nuevo post</h2>
      <form className="post-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Nombre"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={255}
          required
          aria-label="Nombre"
        />
        <input
          type="text"
          placeholder="Descripción"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={2000}
          required
          aria-label="Descripción"
        />
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Creando…' : '+ Crear'}
        </button>
        {createError && (
          <p role="alert" className="form-error">
            {createError}
          </p>
        )}
      </form>
    </div>
  );
}
