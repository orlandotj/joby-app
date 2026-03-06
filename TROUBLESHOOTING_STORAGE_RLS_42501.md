# Erro 42501 no Storage ("deve ser o proprietário")

Se ao rodar scripts com `DROP POLICY`, `CREATE POLICY` ou `ALTER TABLE storage.objects ...` você recebe:

- `ERROR: 42501: must be owner of relation storage.objects`
- ou em PT-BR: **"deve ser o proprietário dos objetos da tabela"**

isso significa que o role atual **não é o dono** da tabela `storage.objects` (no Supabase, normalmente o dono é um role interno como `supabase_storage_admin`).

## Como resolver (Supabase Dashboard)

1) Abra **SQL Editor**
2) No topo/rodapé do editor, troque o **Role** para o role com ownership (geralmente **`supabase_storage_admin`**).
3) Rode novamente o script.

## Como confirmar o dono da tabela

Rode:

```sql
select current_user as current_user, session_user as session_user;
select schemaname, tablename, tableowner
from pg_tables
where schemaname = 'storage' and tablename = 'objects';
```

## Observação importante sobre bucket PRIVATE

Mesmo se o bucket estiver marcado como **PRIVATE** no Dashboard, uma policy `SELECT` para `public`/`anon` pode permitir acesso via API usando a `anon key`.

Para o JOBY (bucket `photos` PRIVATE), você deve **remover policies públicas** como:

- `Allow public to view photos`
- `Allow public to view videos`

O script [cleanup_storage_policies_joby.sql](cleanup_storage_policies_joby.sql) faz esse cleanup e recria o conjunto de policies do modelo Joby.
