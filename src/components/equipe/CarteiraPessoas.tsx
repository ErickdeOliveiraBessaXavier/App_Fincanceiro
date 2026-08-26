import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Users, Briefcase, Link2, Check, Copy, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useGerarConvite } from '@/lib/queries/convites';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/TablePagination';
import { formatTelefone } from '@/utils/format';
import { InputTelefone } from '@/components/InputMascarado';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ConfirmarAcaoDestrutiva } from '@/components/ConfirmarAcaoDestrutiva';
import { ResumoNumeros } from '@/components/ResumoNumeros';

/**
 * Painel de uma carteira de pessoas (cobradores ou vendedores).
 *
 * As duas telas eram ~430 linhas espelhadas: mesmos cards, mesma tabela, mesmos
 * diálogos de exclusão e de convite. A única diferença funcional era o
 * drill-down da carteira, que só Vendedores tinha — agora vale para os dois.
 */

/** Cobradores e vendedores têm a mesma forma; o que muda é a tabela de origem. */
export interface PessoaCarteira {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  ativo: boolean;
  carteira: number;
  user_id?: string | null;
}

interface Mutacao<TInput> {
  mutateAsync: (input: TInput) => Promise<unknown>;
  isPending: boolean;
}

export interface CarteiraConfig {
  /** 'cobrador' — usado nas mensagens. */
  termo: string;
  /** 'Cobradores' — título da lista. */
  titulo: string;
  descricao: string;
  vazio: string;
  /** Qual campo do convite vincular. */
  campoConvite: 'cobradorId' | 'vendedorId';
  pessoas: PessoaCarteira[];
  isLoading: boolean;
  criar: Mutacao<{ nome: string; email?: string; telefone?: string }>;
  atualizar: Mutacao<{ id: string; nome?: string; email?: string | null; telefone?: string | null; ativo?: boolean }>;
  excluir: Mutacao<string>;
  /** Rota da lista de clientes filtrada por esta carteira. */
  rotaCarteira: (id: string) => string;
}

const vazio = { id: '', nome: '', email: '', telefone: '', ativo: true };

// ===================== Subcomponentes =====================
function LinhaPessoa({ pessoa, isAdmin, gerando, onGerarLink, onEdit, onDelete, onToggle, onVerCarteira }: {
  pessoa: PessoaCarteira;
  isAdmin: boolean;
  gerando: boolean;
  onGerarLink: (p: PessoaCarteira) => void;
  onEdit: (p: PessoaCarteira) => void;
  onDelete: (p: PessoaCarteira) => void;
  onToggle: (p: PessoaCarteira) => void;
  onVerCarteira: (p: PessoaCarteira) => void;
}) {
  return (
    <TableRow className="hover:bg-muted/10 transition-colors">
      <TableCell className="font-bold text-sm text-foreground">{pessoa.nome}</TableCell>
      <TableCell>
        <div className="text-xs space-y-1">
          {pessoa.email && <div className="font-bold text-foreground">{pessoa.email}</div>}
          {pessoa.telefone && <div className="text-muted-foreground font-medium">{formatTelefone(pessoa.telefone)}</div>}
        </div>
      </TableCell>
      <TableCell>
        {pessoa.carteira > 0 ? (
          <button type="button" onClick={() => onVerCarteira(pessoa)} title="Ver clientes desta carteira">
            <Badge variant="secondary" className="rounded-lg font-bold text-[10px] uppercase tracking-wider cursor-pointer hover:bg-primary/10 transition-colors">
              {pessoa.carteira} clientes
            </Badge>
          </button>
        ) : (
          <Badge variant="outline" className="rounded-lg font-bold text-[10px] uppercase tracking-wider text-muted-foreground">
            0 clientes
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <Switch checked={pessoa.ativo} onCheckedChange={() => onToggle(pessoa)} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {isAdmin && (
            pessoa.user_id ? (
              <Badge variant="outline" className="mr-1 gap-1 text-green-600 border-green-200 bg-green-50/50">
                <CheckCircle2 className="h-3 w-3" /> com acesso
              </Badge>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onGerarLink(pessoa)}
                disabled={gerando}
                className="h-8 w-8 p-0 rounded-lg hover:bg-primary/5"
                title="Gerar link de acesso"
              >
                <Link2 className="h-4 w-4" />
              </Button>
            )
          )}
          <Button variant="ghost" size="sm" onClick={() => onEdit(pessoa)} className="h-8 w-8 p-0 rounded-lg hover:bg-primary/5">
            <Edit className="h-4 w-4" />
          </Button>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/5"
              onClick={() => onDelete(pessoa)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function ResumoCards({ pessoas }: { pessoas: PessoaCarteira[] }) {
  return (
    <ResumoNumeros
      itens={[
        { rotulo: 'Total', valor: pessoas.length, icone: Users },
        { rotulo: 'Ativos', valor: pessoas.filter((p) => p.ativo).length, icone: Users, cor: 'text-success' },
        { rotulo: 'Clientes em carteira', valor: pessoas.reduce((s, p) => s + p.carteira, 0), icone: Briefcase },
      ]}
    />
  );
}

/**
 * Confirmação da exclusão.
 *
 * Quando há login vinculado, a exclusão também apaga a conta de acesso — a ação
 * mais grave da tela, e era a que pedia menos: um diálogo de dois botões,
 * enquanto excluir um cliente exigia digitar "EXCLUIR". Agora o atrito
 * acompanha a gravidade.
 */
function DialogExcluir({ alvo, termo, onCancel, onConfirm, isPending }: {
  alvo: PessoaCarteira | null;
  termo: string;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const carteira = alvo?.carteira ?? 0;
  const descricao = (
    <>
      <p>
        O {termo} <span className="font-medium">{alvo?.nome}</span> será excluído.
        {carteira > 0 && (
          <> Os {carteira} cliente{carteira === 1 ? '' : 's'} da carteira não são apagados,
            apenas ficam sem {termo}.</>
        )}
      </p>
      {alvo?.user_id && (
        <p>
          O <strong>login de acesso</strong> vinculado também será excluído — a pessoa perde
          o acesso ao sistema.
        </p>
      )}
      <p><strong>Não dá para desfazer.</strong></p>
    </>
  );

  return (
    <ConfirmarAcaoDestrutiva
      open={!!alvo}
      onOpenChange={(o) => !o && onCancel()}
      titulo={`Excluir ${termo}`}
      descricao={descricao}
      rotuloConfirmar={`Excluir ${termo}`}
      textoConfirmacao="EXCLUIR"
      isPending={isPending}
      onConfirm={onConfirm}
    />
  );
}

function DialogConvite({ convite, copiado, onCopy, onClose }: {
  convite: { nome: string; url: string } | null;
  copiado: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!convite} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link de acesso gerado</DialogTitle>
          <DialogDescription>
            Envie este link para <strong>{convite?.nome}</strong> (WhatsApp, e-mail, etc.). A pessoa
            cria a própria senha e depois você autoriza o acesso na aba Acessos.
            O link expira em 7 dias.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input readOnly value={convite?.url ?? ''} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button variant="outline" size="icon" onClick={onCopy} title="Copiar link">
            {copiado ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== Painel =====================
export function CarteiraPessoas({ config, isAdmin }: { config: CarteiraConfig; isAdmin: boolean }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const gerarConvite = useGerarConvite();
  const pagination = usePagination(config.pessoas, 25);

  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState(vazio);
  const [aExcluir, setAExcluir] = useState<PessoaCarteira | null>(null);
  const [convite, setConvite] = useState<{ nome: string; url: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const editando = !!form.id;
  const erro = (e: unknown, padrao: string) =>
    toast({ title: 'Erro', description: e instanceof Error ? e.message : padrao, variant: 'destructive' });

  const gerarLink = async (p: PessoaCarteira) => {
    try {
      const token = await gerarConvite.mutateAsync({ [config.campoConvite]: p.id, nomeSugerido: p.nome });
      setCopiado(false);
      setConvite({ nome: p.nome, url: `${window.location.origin}/convite?token=${token}` });
    } catch (e) {
      erro(e, 'Falha ao gerar o link');
    }
  };

  const copiarLink = async () => {
    if (!convite) return;
    try {
      await navigator.clipboard.writeText(convite.url);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  const salvar = async () => {
    if (form.nome.trim().length < 2) {
      toast({ title: 'Nome obrigatório', description: `Informe o nome do ${config.termo}.`, variant: 'destructive' });
      return;
    }
    try {
      if (editando) {
        await config.atualizar.mutateAsync({
          id: form.id, nome: form.nome.trim(),
          email: form.email.trim() || null, telefone: form.telefone.trim() || null, ativo: form.ativo,
        });
      } else {
        await config.criar.mutateAsync({ nome: form.nome, email: form.email, telefone: form.telefone });
      }
      toast({ title: 'Salvo', description: `Registro ${editando ? 'atualizado' : 'criado'} com sucesso.` });
      setAberto(false);
    } catch (e) {
      erro(e, 'Falha ao salvar');
    }
  };

  const alternarAtivo = async (p: PessoaCarteira) => {
    try {
      await config.atualizar.mutateAsync({ id: p.id, ativo: !p.ativo });
    } catch (e) {
      erro(e, 'Falha ao atualizar');
    }
  };

  const confirmarExclusao = async () => {
    if (!aExcluir) return;
    try {
      // Login vinculado sai junto: senão sobraria um usuário órfão (e um
      // operador sem carteira passa a ver todos os dados pela RLS).
      if (aExcluir.user_id) {
        const { data, error } = await supabase.functions.invoke('excluir-usuario-empresa', {
          body: { user_id: aExcluir.user_id },
        });
        if (error) throw error;
        if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
      }
      await config.excluir.mutateAsync(aExcluir.id);
      toast({ title: 'Excluído', description: `${aExcluir.nome} foi excluído com sucesso.` });
      setAExcluir(null);
    } catch (e) {
      erro(e, 'Falha ao excluir');
    }
  };

  return (
    <div className="space-y-6">
      <ResumoCards pessoas={config.pessoas} />

      <Card className="overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">{config.titulo}</CardTitle>
              <CardDescription className="text-xs font-medium">{config.descricao}</CardDescription>
            </div>
            <Button onClick={() => { setForm(vazio); setAberto(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Novo {config.termo}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {config.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : config.pessoas.length === 0 ? (
            <div className="text-center py-10 bg-muted/5 rounded-xl border border-dashed border-border/60">
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{config.vazio}</p>
              <p className="text-xs text-muted-foreground mt-1 font-medium">
                Também são criados automaticamente na importação de CSV.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Carteira</TableHead>
                    <TableHead>Ativo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.pageItems.map((p) => (
                    <LinhaPessoa
                      key={p.id}
                      pessoa={p}
                      isAdmin={isAdmin}
                      gerando={gerarConvite.isPending}
                      onGerarLink={gerarLink}
                      onEdit={(alvo) => {
                        setForm({
                          id: alvo.id, nome: alvo.nome, email: alvo.email ?? '',
                          telefone: alvo.telefone ?? '', ativo: alvo.ativo,
                        });
                        setAberto(true);
                      }}
                      onDelete={setAExcluir}
                      onToggle={alternarAtivo}
                      onVerCarteira={(alvo) => navigate(config.rotaCarteira(alvo.id))}
                    />
                  ))}
                </TableBody>
              </Table>
              <TablePagination pagination={pagination} />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? `Editar ${config.termo}` : `Novo ${config.termo}`}</DialogTitle>
            <DialogDescription>Dados do {config.termo}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="pessoa-nome">Nome <span className="text-red-500">*</span></Label>
              <Input id="pessoa-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="pessoa-email">Email</Label>
                <Input id="pessoa-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pessoa-tel">Telefone</Label>
                <InputTelefone
                  id="pessoa-tel"
                  value={form.telefone}
                  onChange={(v) => setForm({ ...form, telefone: v })}
                />
              </div>
            </div>
            {editando && (
              <div className="flex items-center gap-2">
                <Switch id="pessoa-ativo" checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
                <Label htmlFor="pessoa-ativo">Ativo</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={config.criar.isPending || config.atualizar.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DialogExcluir
        alvo={aExcluir}
        termo={config.termo}
        onCancel={() => setAExcluir(null)}
        onConfirm={confirmarExclusao}
        isPending={config.excluir.isPending}
      />

      <DialogConvite convite={convite} copiado={copiado} onCopy={copiarLink} onClose={() => setConvite(null)} />
    </div>
  );
}
