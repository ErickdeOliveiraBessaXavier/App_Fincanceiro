## Objetivo
Corrigir o problema entre operador/admin garantindo que (1) todo usuário tenha papel atribuído, (2) a tela de Usuários só seja acessível por admin, e (3) admins possam gerenciar papéis com segurança.

## Diagnóstico
- `eobx` não possui linha em `user_roles` → UI mostra fallback "operador" enganoso.
- `/usuarios` está exposto a qualquer autenticado, mas RLS filtra `user_roles` por `auth.uid()`, fazendo não-admins verem todos como "operador".
- UI desconhece o papel `gerente` (já existe no enum).
- Botões "Novo/Editar/Excluir" são decorativos.

## Plano (abordagem mais segura)

### 1. Migração de dados (backfill)
- `INSERT` em `user_roles` para todo `profiles.user_id` que ainda não tenha papel, com valor padrão `operador`.
- Garante que ninguém fique "sem papel" e elimina o fallback enganoso.

### 2. Guarda de rota no frontend
- Criar `AdminRoute` que usa `useUserRole`; se não for admin, redireciona para `/` com toast "Acesso restrito".
- Envolver `/usuarios` em `App.tsx` com `AdminRoute`.
- Ocultar item "Usuários" no `AppSidebar` para não-admins.

> Observação: RLS já impede dano real — esta camada é UX/defesa em profundidade. A segurança verdadeira continua no banco.

### 3. UI de Usuários (apenas admin)
- Suportar 3 papéis: ajustar `getRoleColor`/`getRoleIcon` para incluir `gerente` (ícone `UserCog`, cor âmbar).
- Trocar 3 cards por 4: Total, Admins, Gerentes, Operadores.
- Remover fallback `|| 'operador'` — se papel for `null`, mostrar badge "sem papel" (não deve mais ocorrer após backfill, mas defensivo).
- Remover botões decorativos "Novo Usuário" e "Excluir" (criação/exclusão exige edge function com `auth.admin` — fora do escopo seguro agora).
- Substituir botão "Editar" por modal `EditarPapelModal` que apenas altera o papel.

### 4. Modal EditarPapelModal
- `Select` com opções: operador / gerente / admin.
- Bloqueia o admin de rebaixar a si mesmo (previne lock-out).
- Operação transacional: `DELETE FROM user_roles WHERE user_id=?` + `INSERT (user_id, role)`.
- Confirmação explícita antes de salvar (boa prática para ação sensível).
- Invalida cache `['user-roles', userId]` e refaz `fetchUsuarios`.
- Registra a alteração: as RLS já têm trigger de auditoria (`audit_log`) caso esteja anexado a `user_roles`; se não estiver, adicionar trigger `fn_audit_row` em `user_roles` para rastreabilidade (recomendado para ação crítica).

### 5. Endurecimento adicional (opcional, recomendado)
- Adicionar trigger `BEFORE DELETE` em `user_roles` que impede remover o último admin do sistema (proteção contra lock-out global).

## Arquivos afetados
- **Migração nova**: backfill `user_roles` + (opcional) trigger anti-lock-out + audit em `user_roles`.
- **Novo**: `src/components/AdminRoute.tsx`
- **Novo**: `src/components/usuarios/EditarPapelModal.tsx`
- **Editado**: `src/App.tsx` (envolver rota)
- **Editado**: `src/components/AppSidebar.tsx` (ocultar item)
- **Editado**: `src/pages/Usuarios.tsx` (4 cards, papel gerente, modal, sem botões decorativos)

## O que NÃO faremos agora (por segurança)
- Criar/excluir usuários via UI (exigiria service_role em edge function — adicional, deixar para frente separada).
- Mudanças em RLS já existentes (estão corretas).
