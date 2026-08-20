-- Runs automatically on the Postgres container's first boot (mounted into
-- /docker-entrypoint-initdb.d/). POSTGRES_DB only creates the main "tcit_posts"
-- database; this adds a second, dedicated "tcit_posts_test" database so the
-- e2e suite (which freely truncates whatever it's pointed at between tests)
-- never runs against the same data the app itself uses.
CREATE DATABASE tcit_posts_test;
