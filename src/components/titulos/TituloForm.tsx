import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ParcelaUtils, FormatUtils } from '@/utils/titulo';
import { NovoTitulo, FormErrors } from '@/hooks/useTituloForm';

interface TituloFormProps {
  formData: NovoTitulo;
  errors: FormErrors;
  clientes: Array<{ id: string; nome: string; cpf_cnpj: string }>;
  onFieldChange: (field: keyof NovoTitulo, value: any) => void;
  isEdit?: boolean;
  isReadOnly?: boolean;
}

export const TituloForm: React.FC<TituloFormProps> = ({
  formData,
  errors,
  clientes,
  onFieldChange,
  isEdit = false,
  isReadOnly = false
}) => {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="cliente">Cliente</Label>
        <select
          id="cliente"
          value={formData.cliente_id}
          onChange={(e) => onFieldChange('cliente_id', e.target.value)}
          disabled={isReadOnly}
          className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors
            ${errors.cliente_id ? 'border-red-500' : ''} ${isReadOnly ? 'opacity-50' : ''}`}
        >
          <option value="">Selecione um cliente</option>
          {clientes.map((cliente) => (
            <option key={cliente.id} value={cliente.id}>
              {cliente.nome} - {cliente.cpf_cnpj}
            </option>
          ))}
        </select>
        {errors.cliente_id && (
          <span className="text-xs text-red-500">{errors.cliente_id}</span>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="valor">Valor</Label>
        <Input
          id="valor"
          type="number"
          step="0.01"
          min="0"
          value={formData.valor}
          onChange={(e) => onFieldChange('valor', parseFloat(e.target.value) || 0)}
          disabled={isReadOnly}
          className={errors.valor ? "border-red-500" : ""}
        />
        {errors.valor && (
          <span className="text-xs text-red-500">{errors.valor}</span>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="vencimento">Data de Vencimento</Label>
        <Input
          id="vencimento"
          type="date"
          value={formData.vencimento}
          onChange={(e) => onFieldChange('vencimento', e.target.value)}
          disabled={isReadOnly}
          className={errors.vencimento ? "border-red-500" : ""}
        />
        {errors.vencimento && (
          <span className="text-xs text-red-500">{errors.vencimento}</span>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="observacoes">Observações</Label>
        <Input
          id="observacoes"
          value={formData.observacoes || ''}
          onChange={(e) => onFieldChange('observacoes', e.target.value)}
          disabled={isReadOnly}
        />
      </div>

      {!isEdit && (
        <>
          {/* Seção de Parcelas */}
          <div className="grid gap-2">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="tem_parcelas"
                checked={formData.tem_parcelas}
                onChange={(e) => {
                  const temParcelas = e.target.checked;
                  onFieldChange('tem_parcelas', temParcelas);
                  if (temParcelas) {
                    onFieldChange('total_parcelas', 2);
                  }
                }}
                className="h-4 w-4"
              />
              <Label htmlFor="tem_parcelas" className="text-sm font-medium">
                Dividir em parcelas
              </Label>
            </div>
          </div>

          {formData.tem_parcelas && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="numero_parcelas">Nº de Parcelas</Label>
                  <Input
                    id="numero_parcelas"
                    type="number"
                    min="2"
                    max="60"
                    value={formData.total_parcelas}
                    onChange={(e) => onFieldChange('total_parcelas', parseInt(e.target.value) || 1)}
                    className={errors.numero_parcelas ? "border-red-500" : ""}
                  />
                  {errors.numero_parcelas && (
                    <span className="text-xs text-red-500">{errors.numero_parcelas}</span>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="intervalo_dias">Intervalo (dias)</Label>
                  <Input
                    id="intervalo_dias"
                    type="number"
                    min="1"
                    max="365"
                    value={formData.intervalo_dias}
                    onChange={(e) => onFieldChange('intervalo_dias', parseInt(e.target.value) || 30)}
                    className={errors.intervalo_dias ? "border-red-500" : ""}
                  />
                  {errors.intervalo_dias && (
                    <span className="text-xs text-red-500">{errors.intervalo_dias}</span>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="valor_parcela">Valor por Parcela</Label>
                <Input
                  id="valor_parcela"
                  type="text"
                  value={FormatUtils.currency(formData.valor_parcela)}
                  disabled
                  className="bg-muted"
                />
              </div>

              {formData.total_parcelas >= 2 && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800 font-medium">Preview das Parcelas:</p>
                  <div className="mt-2 text-xs text-blue-700">
                    {ParcelaUtils.calcularDatas(formData.vencimento, Math.min(formData.total_parcelas, 3), formData.intervalo_dias)
                      .map((data, index) => (
                        <div key={index}>
                          Parcela {index + 1}: {FormatUtils.currency(formData.valor_parcela)} - {FormatUtils.date(data)}
                        </div>
                      ))}
                    {formData.total_parcelas > 3 && (
                      <div className="mt-1 font-medium">
                        ... e mais {formData.total_parcelas - 3} parcelas
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};
