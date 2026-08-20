import type { ChangeEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../hooks/redux';
import { setFilterText } from '../store/postsSlice';

// Filters client-side only, against posts already in the Redux store — no
// network call, so it stays instant regardless of typing speed. Matches
// against both name and description (see selectFilteredPosts), so the
// label says so rather than just "Filtro de Nombre".
export function PostFilter() {
  const dispatch = useAppDispatch();
  const filterText = useAppSelector((state) => state.posts.filterText);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    dispatch(setFilterText(event.target.value));
  }

  return (
    <div className="post-filter">
      <span className="post-filter-icon" aria-hidden="true">
        🔍
      </span>
      <input
        type="text"
        placeholder="Buscar por nombre o descripción"
        value={filterText}
        onChange={handleChange}
        aria-label="Buscar por nombre o descripción"
      />
    </div>
  );
}
