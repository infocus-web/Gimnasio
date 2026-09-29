-- Complemento del stub de la v1 para probar las migraciones v2 en Postgres local
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
