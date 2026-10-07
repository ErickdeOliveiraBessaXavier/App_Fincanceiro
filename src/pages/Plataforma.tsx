import { useMemo, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldCheck, LogOut, Upload, Trash2, UserX, Tags } from 'lucide-react';
import { ConfirmarAcaoDestrutiva } from '@/components/ConfirmarAcaoDestrutiva';
import { usePlanos } from '@/lib/queries/planos';
import {
  useCadastrosIncompletos, useDescartarCadastro, useEmpresasPlataforma, useMetricasEmpresas,
  type CadastroIncompleto, type CompanyRow,
} from '@/lib/queries/plataforma';
import { formatarReais } from '@/domain/assinatura';
import { filtrarEmpresas, listarPendencias, type AbaEmpresa, type FiltroEmpresas } from '@/domain/plataforma';
import { formatData } from '@/utils/format';
import { TabelaPrecosDialog } from '@/components/plataforma/precos/TabelaPrecosDialog';
import { useResumoCobrancaPlataforma } from '@/components/plataforma/cobranca/resumoPlataforma';
import { PrecisaAtencaoCard } from '@/components/plataforma/PrecisaAtencaoCard';
import { EmpresasTabela, type ContagemFiltros } from '@/components/plataforma/EmpresasTabela';
import { GerenciarEmpresaDialog, type AbaGerenciar } from '@/components/plataforma/empresa/GerenciarEmpresaDialog';

/**
 * Painel da Plataforma (super admin). Pensado para quem não conhece o sistema:
 * em cima, o que precisa de ação, cada item com o botão que resolve; embaixo,
 * as empresas, e um clique em qualquer uma abre tudo dela num lugar só.
 */

// ===================== Dados do painel =====================

function usePainel(ativo: boolean) {
  const empresasQuery = useEmpresasPlataforma(ativo);
  const metricasQuery = useMetricasEmpresas(ativo);
  const { data: planos = [] } = usePlanos(ativo);
  const empresas = useMemo(() => empresasQuery.data ?? [], [empresasQuery.data]);
  const resumo = useResumoCobrancaPlataforma(empresasQuery.data, ativo);
  const metricas = useMemo(
    () => new Map((metricasQuery.data ?? []).map((m) => [m.company_id, m])),
    [metricasQuery.data],
  );

  const pendencias = listarPendencias(empresas, {
    uso: new Map([...metricas].map(([id, m]) => [id, { usados: m.titulos_ativos, limite: m.limite_titulos }])),
    cobranca: resumo.porEmpresa,
    planosPagos: new Set(planos.filter((p) => p.valor_mensal > 0).map((p) => p.codigo)),
    cobrancaCarregada: resumo.carregado,
  });

  return { empresas, carregando: empresasQuery.isLoading, metricas, resumo, pendencias };
}

function contarFiltros(empresas: CompanyRow[], comPendencia: Set<string>): ContagemFiltros {
  const status = (s: string) => empresas.filter((e) => e.status === s).length;
  return {
    todas: empresas.length,
    atencao: empresas.filter((e) => comPendencia.has(e.id)).length,
    pendente: status('pendente'),
    ativa: status('ativa'),
    suspensa: status('suspensa'),
  };
}

// ===================== Partes =====================

function Numero({ titulo, valor, detalhe, cor }: { titulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{titulo}</CardTitle></CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold tabular-nums ${cor ?? ''}`}>{valor}</div>
        {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      </CardContent>
    </Card>
  );
}

function NumerosDoPainel({ contagem, mrr, emAtraso }: { contagem: ContagemFiltros; mrr: number; emAtraso: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Numero titulo="Empresas ativas" valor={String(contagem.ativa)} detalhe={`de ${contagem.todas} cadastradas`} />
      <Numero titulo="Aguardando aprovação" valor={String(contagem.pendente)}
        cor={contagem.pendente > 0 ? 'text-warning-strong' : undefined} />
      <Numero titulo="Receita mensal" valor={formatarReais(mrr)} detalhe="Soma das mensalidades das empresas ativas" />
      <Numero titulo="Mensalidades em atraso" valor={formatarReais(emAtraso)}
        cor={emAtraso > 0 ? 'text-destructive' : undefined} />
    </div>
  );
}

// Contas que se cadastraram e não concluíram a criação da empresa: ficam sem
// company_id e sem papel. Não são uma company, então não apareceriam na tabela
// de empresas — e é justamente aí que um cliente real trava sem ninguém notar.
function CadastrosIncompletosCard({ cadastros, onExcluir }: { cadastros: CadastroIncompleto[]; onExcluir: (c: CadastroIncompleto) => void }) {
  if (cadastros.length === 0) return null;
  const titulo = cadastros.length === 1 ? '1 cadastro incompleto' : `${cadastros.length} cadastros incompletos`;
  return (
    <Card className="border border-warning/40">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <UserX className="h-4 w-4 text-warning-strong" />
          <CardTitle className="text-sm font-medium">{titulo}</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Criaram a conta mas não terminaram o cadastro da empresa. Não precisa fazer nada: quando a pessoa
          terminar, a empresa aparece em "Aguardando aprovação". Descarte só cadastros de teste ou abandonados.
        </p>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cadastros.map((c) => (
                <TableRow key={c.user_id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="break-all">{c.email}</TableCell>
                  <TableCell>{formatData(c.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onExcluir(c)}>
                      <Trash2 className="mr-1 h-4 w-4" /> Descartar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Cabecalho({ onPrecos, onSair }: { onPrecos: () => void; onSair: () => void }) {
  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-card/80 px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-none">Painel da Plataforma</h1>
          <p className="text-xs text-muted-foreground">Empresas, planos e mensalidades</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrecos}>
          <Tags className="mr-2 h-4 w-4" /> Tabela de preços
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/plataforma/importar"><Upload className="mr-2 h-4 w-4" /> Importar títulos</Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={onSair}>
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </Button>
      </div>
    </header>
  );
}

function ConfirmarDescarte({ alvo, onClose }: { alvo: CadastroIncompleto | null; onClose: () => void }) {
  const descartar = useDescartarCadastro();
  return (
    <ConfirmarAcaoDestrutiva
      open={!!alvo}
      onOpenChange={(o) => { if (!o) onClose(); }}
      titulo="Descartar cadastro incompleto"
      descricao={
        <>
          A conta de <strong>{alvo?.nome}</strong> ({alvo?.email}) será
          removida. Ela nunca concluiu o cadastro da empresa, então não há dados de cobrança
          associados. Se a pessoa quiser voltar, basta se cadastrar de novo.
        </>
      }
      rotuloConfirmar="Descartar cadastro"
      isPending={descartar.isPending}
      onConfirm={() => alvo && descartar.mutate(alvo.user_id, { onSuccess: onClose })}
    />
  );
}

// ===================== Página =====================

/** Enquanto a sessão carrega, nada; sem login ou sem super admin, fora daqui. */
function guardaDeAcesso(loading: boolean, logado: boolean, superAdmin: boolean) {
  if (loading) return null;
  if (!logado) return <Navigate to="/auth" replace />;
  if (!superAdmin) return <Navigate to="/" replace />;
  return undefined;
}

export default function Plataforma() {
  const { user, isSuperAdmin, loading, signOut } = useAuth();
  const painel = usePainel(isSuperAdmin);
  const incompletos = useCadastrosIncompletos(isSuperAdmin);

  const [alvo, setAlvo] = useState<{ id: string; aba: AbaGerenciar } | null>(null);
  const [filtro, setFiltro] = useState<FiltroEmpresas>('todas');
  const [busca, setBusca] = useState('');
  const [precosAbertos, setPrecosAbertos] = useState(false);
  const [descartarAlvo, setDescartarAlvo] = useState<CadastroIncompleto | null>(null);

  const bloqueio = guardaDeAcesso(loading, !!user, isSuperAdmin);
  if (bloqueio !== undefined) return bloqueio;

  const { empresas, metricas, resumo, pendencias } = painel;
  const porId = new Map(empresas.map((e) => [e.id, e]));
  const comPendencia = new Set(pendencias.map((p) => p.companyId));
  const contagem = contarFiltros(empresas, comPendencia);
  // Busca a linha atual pelo id: depois de salvar, a janela mostra o dado novo.
  const empresaAberta = alvo ? porId.get(alvo.id) ?? null : null;
  const idAberto = empresaAberta?.id ?? '';
  const abrir = (id: string, aba: AbaEmpresa | AbaGerenciar = 'plano') => setAlvo({ id, aba });

  return (
    <div className="min-h-screen bg-background">
      <Cabecalho onPrecos={() => setPrecosAbertos(true)} onSair={signOut} />

      <main className="mx-auto max-w-screen-2xl space-y-6 p-4 sm:p-6">
        <NumerosDoPainel contagem={contagem} mrr={resumo.mrr} emAtraso={resumo.emAtraso} />
        <PrecisaAtencaoCard pendencias={pendencias} empresas={porId} onAbrir={abrir} />
        <CadastrosIncompletosCard cadastros={incompletos.data ?? []} onExcluir={setDescartarAlvo} />
        <EmpresasTabela
          empresas={filtrarEmpresas(empresas, filtro, busca, comPendencia)}
          metricas={metricas}
          cobranca={resumo.porEmpresa}
          isLoading={painel.carregando}
          filtro={filtro}
          onFiltro={setFiltro}
          busca={busca}
          onBusca={setBusca}
          contagem={contagem}
          onGerenciar={(c) => abrir(c.id)}
        />
      </main>

      <GerenciarEmpresaDialog
        empresa={empresaAberta}
        aba={alvo?.aba ?? 'plano'}
        onAbaChange={(aba) => setAlvo((atual) => (atual ? { ...atual, aba } : atual))}
        metrica={metricas.get(idAberto)}
        cobranca={resumo.porEmpresa.get(idAberto)}
        onClose={() => setAlvo(null)}
      />
      <TabelaPrecosDialog open={precosAbertos} onClose={() => setPrecosAbertos(false)} empresas={empresas} />

      <ConfirmarDescarte alvo={descartarAlvo} onClose={() => setDescartarAlvo(null)} />
    </div>
  );
}
