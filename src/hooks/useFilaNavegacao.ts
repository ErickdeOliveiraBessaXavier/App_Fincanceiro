import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Navegação entre clientes sem voltar para a lista.
 *
 * Quem abre a ficha manda junto a ordem em que os clientes aparecem na tela de
 * origem (`state.fila`). A ficha então sabe quem vem antes e depois, e o
 * operador atende a carteira em sequência — antes cada cliente custava voltar à
 * lista, procurar o próximo e abrir de novo.
 *
 * A fila é a da tela de origem, com os filtros que o operador aplicou lá: é
 * intencional que "próximo" siga a mesma ordem que ele estava vendo.
 */

export interface EstadoFila {
  /** URL de origem, com filtros e página — usada pelo "voltar". */
  from?: string;
  /** Ids dos clientes na ordem exibida na origem. */
  fila?: string[];
}

export interface FilaNavegacao {
  /** Posição 1-based do cliente atual; 0 quando ele não está na fila. */
  posicao: number;
  total: number;
  temAnterior: boolean;
  temProximo: boolean;
  irParaAnterior: () => void;
  irParaProximo: () => void;
  /** Rota de origem (lista) para o breadcrumb e o botão voltar. */
  voltarPara: string;
}

/** Monta o state a ser passado ao navegar para a ficha, preservando a fila. */
export function estadoDaFila(origem: string, fila: string[]): EstadoFila {
  return { from: origem, fila };
}

export function useFilaNavegacao(clienteId?: string): FilaNavegacao {
  const navigate = useNavigate();
  const location = useLocation();
  const estado = (location.state ?? null) as EstadoFila | null;

  const fila = useMemo(() => estado?.fila ?? [], [estado]);
  const voltarPara = estado?.from ?? '/clientes';
  const indice = clienteId ? fila.indexOf(clienteId) : -1;

  const irPara = useCallback(
    (proximoIndice: number) => {
      const destino = fila[proximoIndice];
      if (!destino) return;
      // O mesmo state segue adiante: sem isso, a fila morria no primeiro salto.
      navigate(`/clientes/${destino}`, { state: { from: voltarPara, fila } });
    },
    [fila, navigate, voltarPara],
  );

  return {
    posicao: indice + 1,
    total: fila.length,
    temAnterior: indice > 0,
    temProximo: indice >= 0 && indice < fila.length - 1,
    irParaAnterior: () => irPara(indice - 1),
    irParaProximo: () => irPara(indice + 1),
    voltarPara,
  };
}
