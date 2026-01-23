Security steps to secure this repo and Supabase keys

See `SUPABASE_SETUP.md` for database migration and RLS policy recommendations to support user profiles.

1. Rotate the exposed key in Supabase dashboard

   - Go to your Supabase project -> Settings -> API
   - Regenerate the anon/public key (and revoke the old if needed)

2. Remove secrets from the repo working tree

   - Add `.env` to `.gitignore` (done)
   - Create a new `.env` locally with the new key (do NOT commit it)
   - Run: `git rm --cached .env` and commit the change

3. Remove build artifacts and test files that contain hardcoded keys

   - We added `dist/`, `build/`, and `android/app/build/` to `.gitignore`
   - Consider removing committed build artifacts from the repository with:
     git rm -r --cached dist/ public/assets/ android/app/build/
     git commit -m "Remove build artifacts and stop shipping them"

4. Purge the leaked secret from Git history (optional, destructive)

   - This rewrites history and requires a forced push. Coordinate with any collaborators.
   - Recommended tools: `git filter-repo` (preferred) or BFG Repo Cleaner.
   - Example with BFG:
     bfg --replace-text replacements.txt
     or with git-filter-repo to remove lines matching the key.

5. Add repository protections and secret scanning

   - Add a pre-commit hook (husky) with a small grep-based check or use `detect-secrets`
   - Add secret scanning in CI (e.g., GitHub secret scanning or custom step)

6. Enforce Row Level Security (RLS) in Supabase

   - Enable RLS for tables and add fine-grained policies so anon can only read what you want.
   - Avoid opening tables without policies.

7. Move any admin-only operations to server-side
   - Use Supabase Edge Functions or a server endpoint for operations requiring `service_role`.

If you want, I can run the `git rm --cached .env` and commit the changes now and/or help create the pre-commit hook and show filter-repo/BFG commands for purging history. Let me know which actions to take and I will proceed.

---

COMANDOS PRÁTICOS (execute localmente no seu ambiente Git)

# 1) Remover `.env` do índice (não destrutivo)

# (a partir do root do repo):

git rm --cached .env
git commit -m "chore(security): remove .env from repo"

# 2) Remover artefatos de build que contêm chaves (não destrutivo)

git rm -r --cached dist/ public/assets/ android/app/build/
git commit -m "chore(security): remove committed build artifacts"

# 3) (Opcional, destrutivo) Se a chave vazou no histórico, purgue com git-filter-repo (recomendo):

# - Instale git-filter-repo (https://github.com/newren/git-filter-repo)

# - Passos (recomendado):

# 1) Faça um clone espelho (mirror):

# git clone --mirror git@github.com:SEU_USUARIO/SEU_REPO.git repo-mirror.git

# 2) Crie `replacements.txt` com a chave a remover entre marcadores:

# ===BEGIN_REPLACE===

# eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVC9..._SUA_CHAVE_AQUI_

# ===END_REPLACE===

# 3) Rode o filtro:

# cd repo-mirror.git

# git filter-repo --replace-text ../replacements.txt

# 4) Verifique o resultado e force-push para o repositório remoto (coordene com colaboradores):

# git push --force

#

# - Alternativa com BFG (mais simples):

# 1) Faça um clone espelho: `git clone --mirror git@github.com:SEU_USUARIO/SEU_REPO.git repo.git`

# 2) Rode o BFG para substituir/remover a chave: `bfg --replace-text replacements.txt repo.git`

# 3) Limpe e compacte o repositório e force-push:

# cd repo.git

# git reflog expire --expire=now --all && git gc --prune=now --aggressive

# git push --force

#

# - Atenção: operações acima reescrevem a história do repositório e afetam todos os colaboradores. Faça backup e coordene um plano de comunicação antes de executar.

# 4) Habilitar um pre-commit hook local (Husky) para evitar commits com segredos:

# - Instale dependências e ative o Husky:

# npm install

# npm run prepare

# - Se desejar recriar o hook (se `.husky/pre-commit` não existir):

# npx husky add .husky/pre-commit "npm run check-secrets"

# - Confirme que o hook está funcionando rodando um commit de teste (sem arquivos sensíveis).

# npm install --save-dev husky

# npx husky install

# npx husky add .husky/pre-commit "npm run check-secrets"

# (Adicional: adicione .husky/ ao repositório)

# 5) O projeto já inclui:

# - `scripts/check-secrets.js` : script que procura padrões comuns (JWTs / keys)

# - `.github/workflows/secret-scan.yml` : workflow que roda o scanner em push/PRs

Notes:

- I could not run Git commands from this environment because it is not a Git repository; please run the commands above in your local clone. I can guide you through the purge step (BFG/git-filter-repo) if you want to proceed with history rewrite.
