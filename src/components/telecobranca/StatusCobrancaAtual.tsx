import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/StatusBadge';

interface StatusCobrancaAtualProps {
  clienteId: string;
  refreshTrigger?: number;
}

/**
 * Exibe o status de cobrança mais recente do cliente (última comunicação com
 * status_cobranca preenchido). Read-only; some quando ainda não há registro.
 * Reaproveita o domínio `status_cobranca` do StatusBadge — sem novo dicionário.
 */
export function StatusCobrancaAtual({ clienteId, refreshTrigger }: StatusCobrancaAtualProps) {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const { data } = await supabase
        .from('comunicacoes')
        .select('status_cobranca')
        .eq('cliente_id', clienteId)
        .not('status_cobranca', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ativo) setStatus((data?.status_cobranca as string | null) ?? null);
    })();
    return () => { ativo = false; };
  }, [clienteId, refreshTrigger]);

  if (!status) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Cobrança:</span>
      <StatusBadge domain="status_cobranca" status={status} />
    </div>
  );
}
