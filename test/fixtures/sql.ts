export const CREATE_USERS_TABLE = `
  create table users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    display_name text,
    created_at timestamp not null default now()
  )
`;

export const CREATE_POSTS_TABLE = `
  create table posts (
    id serial primary key,
    author_id uuid not null references users(id)
  )
`;
