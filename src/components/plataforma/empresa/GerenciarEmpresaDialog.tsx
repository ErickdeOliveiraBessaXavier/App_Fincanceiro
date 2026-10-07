import { Gauge, KeyRound, Receipt, Settings2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarraUsoPlano } from '@/components/plano/BarraUsoPlano';
import { usePlanos } from '@/lib/queries/planos';
import type { CompanyRow, MetricaEmpresa } from '@/lib/queries/plataforma';
import { calcularUso } from '@/domain/plano';
import { formatarReais } from '@/domain/assinatura';
import type { AbaEmpresa } from '@/domain/plataforma';
import { formatCpfCnpj } from '@/utils/format';
import type { CobrancaDaEmpresa } from '@/components/plataforma/cobranca/resumoPlataforma';
import { AbaCobrancaEmpresa } from '@/components/plataforma/cobranca/AbaCobrancaEmpresa';
import { AbaPlanoEmpresa } from './AbaPlanoEmpresa';
import { AbaIntegracao } from './AbaIntegracao';
import { AbaAvancado } from './AbaAvancado';
import { BotaoStatusEmpresa } from './BotaoStatusEmpresa';
import { StatusEmpresaBadge } from './StatusEmpresaBadge';

/**
 * Tudo de uma empresa num lugar só: situação, plano, cobrança, integração e as
 * ações raras. Antes eram três janelas escondidas num menu "…".
 */

export type AbaGerenciar = AbaEmpresa | 'avancado';

interface Props {
  empresa: CompanyRow | null;
  /** Controlada pela página: a lista de pendências abre direto onde resolver. */
  aba: AbaGerenciar;
  onAbaChange: (aba: AbaGerenciar) => void;
  metrica?: MetricaEmpresa;
  cobranca?: CobrancaDaEmpresa;
  onClose: () => void;
}

function Fato({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <div className="mt-1 text-sm font-medium">{children}</div>
    </div>
  );
}

function ResumoEmpresa({ empresa, metrica, cobranca }: Pick<Props, 'metrica' | 'cobranca'> & { empresa: CompanyRow }) {
  const { data: planos = [] } = usePlanos();
  const plano = planos.find((p) => p.codigo === empresa.plano);
  const mensal = cobranca?.mensal;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Fato rotulo="Plano">{plano?.nome ?? empresa.plano}</Fato>
      <Fato rotulo="Mensalidade">{mensal != null ? `${formatarReais(mensal)}/mês` : 'Sem cobrança cadastrada'}</Fato>
      <Fato rotulo="Uso">
        {metrica ? <BarraUsoPlano uso={calcularUso(metrica.titulos_ativos, metrica.limite_titulos)} /> : '—'}
      </Fato>
    </div>
  );
}

export function GerenciarEmpresaDialog({ empresa, aba, onAbaChange, metrica, cobranca, onClose }: Props) {
  return (
    <Dialog open={!!empresa} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* Sem foco automático: o primeiro botão é "Suspender", que pareceria selecionado. */}
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        {empresa && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-start justify-between gap-3 pr-6">
                <div className="min-w-0">
                  <DialogTitle className="flex flex-wrap items-center gap-2">
                    {empresa.nome} <StatusEmpresaBadge status={empresa.status} />
                  </DialogTitle>
                  <DialogDescription>
                    {empresa.cnpj ? `CNPJ ${formatCpfCnpj(empresa.cnpj)}` : 'Sem CNPJ cadastrado'}
                  </DialogDescription>
                </div>
                <BotaoStatusEmpresa empresa={empresa} />
              </div>
            </DialogHeader>

            <ResumoEmpresa empresa={empresa} metrica={metrica} cobranca={cobranca} />

            <Tabs value={aba} onValueChange={(v) => onAbaChange(v as AbaGerenciar)} className="min-w-0">
              <TabsList variant="pill">
                <TabsTrigger value="plano"><Gauge className="mr-2 h-4 w-4" />Plano e limite</TabsTrigger>
                <TabsTrigger value="cobranca"><Receipt className="mr-2 h-4 w-4" />Cobrança</TabsTrigger>
                <TabsTrigger value="integracao"><KeyRound className="mr-2 h-4 w-4" />Integração</TabsTrigger>
                <TabsTrigger value="avancado"><Settings2 className="mr-2 h-4 w-4" />Avançado</TabsTrigger>
              </TabsList>
              <TabsContent value="plano" className="pt-4"><AbaPlanoEmpresa empresa={empresa} /></TabsContent>
              <TabsContent value="cobranca" className="pt-4"><AbaCobrancaEmpresa empresa={empresa} /></TabsContent>
              {/* Montada sempre: a chave recém-gerada aparece uma vez só e não pode sumir ao trocar de aba. */}
              <TabsContent value="integracao" forceMount className="pt-4 data-[state=inactive]:hidden">
                <AbaIntegracao empresa={empresa} />
              </TabsContent>
              <TabsContent value="avancado" className="pt-4"><AbaAvancado empresa={empresa} /></TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
