// Mirrors the backend's PostDto exactly — camelCase over the wire.
export interface Post {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePostInput {
  name: string;
  description: string;
}
