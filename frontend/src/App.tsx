import { useEffect } from 'react';
import { PostFilter } from './components/PostFilter';
import { PostForm } from './components/PostForm';
import { PostList } from './components/PostList';
import { useAppDispatch } from './hooks/redux';
import { fetchPosts } from './store/postsSlice';
import './App.css';

export function App() {
  const dispatch = useAppDispatch();

  // fetchPosts' `condition` guard (see postsSlice) ensures this only ever
  // triggers one actual network request per view load.
  useEffect(() => {
    void dispatch(fetchPosts());
  }, [dispatch]);

  return (
    <main className="app">
      <header className="app-header">
        <h1>📝 Posts</h1>
        <p className="app-subtitle">Crea, filtra, edita y elimina tus posts.</p>
      </header>
      <PostFilter />
      <PostForm />
      <PostList />
    </main>
  );
}
