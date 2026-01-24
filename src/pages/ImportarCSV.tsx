import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface CSVPreview {
  headers: string[];
  rows: string[][];
}

interface CSVRow {
  cliente: string;
  cpf_cnpj: string;
  valor: string;
  vencimento: string;
  contato?: string;
  descricao?: string;
}

interface ImportResult {
  success: number;
  errors: string[];
  clientesCreated: number;
}

export default function ImportarCSV() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CSVPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const requiredHeaders = ['cliente', 'cpf_cnpj', 'valor', 'vencimento'];

  // Função para validar CPF/CNPJ
  const validateCpfCnpj = (cpfCnpj: string): boolean => {
    const cleaned = cpfCnpj.replace(/[^\d]/g, '');
    return cleaned.length === 11 || cleaned.length === 14;
  };

  // Função para validar formato de data
  const validateDate = (dateString: string): boolean => {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  };

  // Função para validar valor numérico
  const validateValue = (valueString: string): boolean => {
    const cleaned = valueString.replace(/[^\d.,]/g, '').replace(',', '.');
    const value = parseFloat(cleaned);
    return !isNaN(value) && value > 0;
  };

  // Função para encontrar ou criar cliente
  const findOrCreateClient = async (nome: string, cpfCnpj: string, contato?: string): Promise<string | null> => {
    try {
      const cleanedCpfCnpj = cpfCnpj.replace(/[^\d]/g, '');
      
      const { data: existingClient, error: findError } = await supabase
        .from('clientes')
        .select('id')
        .eq('cpf_cnpj', cleanedCpfCnpj)
        .single();

      if (findError && findError.code !== 'PGRST116') {
        throw findError;
      }

      if (existingClient) {
        return existingClient.id;
      }

      const { data: newClient, error: createError } = await supabase
        .from('clientes')
        .insert({
          nome: nome.trim(),
          cpf_cnpj: cleanedCpfCnpj,
          telefone: contato || null,
          created_by: user?.id || '',
          status: 'ativo'
        })
        .select('id')
        .single();

      if (createError) {
        throw createError;
      }

      return newClient.id;
    } catch (error) {
      console.error('Erro ao encontrar/criar cliente:', error);
      return null;
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast({
        title: "Erro",
        description: "Por favor, selecione um arquivo CSV",
        variant: "destructive",
      });
      return;
    }

    setFile(selectedFile);
    previewCSV(selectedFile);
  };

  const previewCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setErrors(['O arquivo deve conter pelo menos um cabeçalho e uma linha de dados']);
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const rows = lines.slice(1, 6).map(line => line.split(',').map(cell => cell.trim()));

      const validationErrors: string[] = [];
      requiredHeaders.forEach(required => {
        if (!headers.includes(required)) {
          validationErrors.push(`Coluna obrigatória '${required}' não encontrada`);
        }
      });

      if (validationErrors.length === 0) {
        rows.forEach((row, index) => {
          const rowData: any = {};
          headers.forEach((header, i) => {
            rowData[header] = row[i] || '';
          });

          if (!validateCpfCnpj(rowData.cpf_cnpj)) {
            validationErrors.push(`Linha ${index + 2}: CPF/CNPJ inválido`);
          }

          if (!validateValue(rowData.valor)) {
            validationErrors.push(`Linha ${index + 2}: Valor inválido`);
          }

          if (!validateDate(rowData.vencimento)) {
            validationErrors.push(`Linha ${index + 2}: Data de vencimento inválida (use formato YYYY-MM-DD)`);
          }

          if (!rowData.cliente || rowData.cliente.trim().length < 2) {
            validationErrors.push(`Linha ${index + 2}: Nome do cliente muito curto`);
          }
        });
      }

      setErrors(validationErrors);
      setPreview({ headers, rows });
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleImport = async () => {
    if (!file || !preview || errors.length > 0 || !user) {
      if (!user) {
        toast({
          title: "Erro",
          description: "Usuário não autenticado",
          variant: "destructive",
        });
      }
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setImportResult(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const dataRows = lines.slice(1);

        const result: ImportResult = {
          success: 0,
          errors: [],
          clientesCreated: 0
        };

        const createdClients = new Set<string>();

        for (let i = 0; i < dataRows.length; i++) {
          try {
            const progress = Math.round(((i + 1) / dataRows.length) * 100);
            setUploadProgress(progress);

            const row = dataRows[i].split(',').map(cell => cell.trim());
            const rowData: any = {};
            headers.forEach((header, index) => {
              rowData[header] = row[index] || '';
            });

            if (!validateCpfCnpj(rowData.cpf_cnpj)) {
              result.errors.push(`Linha ${i + 2}: CPF/CNPJ inválido`);
              continue;
            }

            if (!validateValue(rowData.valor)) {
              result.errors.push(`Linha ${i + 2}: Valor inválido`);
              continue;
            }

            if (!validateDate(rowData.vencimento)) {
              result.errors.push(`Linha ${i + 2}: Data de vencimento inválida`);
              continue;
            }

            if (!rowData.cliente || rowData.cliente.trim().length < 2) {
              result.errors.push(`Linha ${i + 2}: Nome do cliente muito curto`);
              continue;
            }

            const clienteId = await findOrCreateClient(
              rowData.cliente,
              rowData.cpf_cnpj,
              rowData.contato
            );

            if (!clienteId) {
              result.errors.push(`Linha ${i + 2}: Erro ao processar cliente`);
              continue;
            }

            const cleanedCpfCnpj = rowData.cpf_cnpj.replace(/[^\d]/g, '');
            if (!createdClients.has(cleanedCpfCnpj)) {
              createdClients.add(cleanedCpfCnpj);
              result.clientesCreated++;
            }

            const valor = parseFloat(rowData.valor.replace(/[^\d.,]/g, '').replace(',', '.'));
            
            // Criar título
            const { data: tituloData, error: tituloError } = await supabase
              .from('titulos')
              .insert({
                cliente_id: clienteId,
                valor_original: valor,
                vencimento_original: rowData.vencimento,
                descricao: rowData.descricao || null,
                created_by: user.id
              })
              .select()
              .single();

            if (tituloError) {
              result.errors.push(`Linha ${i + 2}: ${tituloError.message}`);
              continue;
            }

            // Criar parcela única
            const { error: parcelaError } = await supabase
              .from('parcelas')
              .insert({
                titulo_id: tituloData.id,
                numero_parcela: 1,
                valor_nominal: valor,
                vencimento: rowData.vencimento
              });

            if (parcelaError) {
              result.errors.push(`Linha ${i + 2}: Erro ao criar parcela`);
              continue;
            }

            result.success++;
          } catch (error) {
            result.errors.push(`Linha ${i + 2}: Erro inesperado`);
          }
        }

        // Refresh materialized view
        await supabase.rpc('refresh_mv_parcelas');

        setImportResult(result);

        if (result.success > 0) {
          toast({
            title: "Importação Concluída",
            description: `${result.success} títulos importados com sucesso!`,
          });
        }

        if (result.errors.length > 0) {
          toast({
            title: "Avisos na Importação",
            description: `${result.errors.length} linhas com erro. Verifique os detalhes abaixo.`,
            variant: "destructive",
          });
        }

        if (result.errors.length === 0) {
          setFile(null);
          setPreview(null);
          setErrors([]);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      };

      reader.readAsText(file, 'utf-8');
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao importar arquivo",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const downloadTemplate = () => {
    const csvContent = [
      'cliente,cpf_cnpj,valor,vencimento,contato,descricao',
      'João Silva Santos,123.456.789-00,1500.00,2025-10-15,(11) 99999-9999,Mensalidade outubro 2025',
      'Maria Oliveira LTDA,12.345.678/0001-90,2750.50,2025-10-30,(11) 88888-8888,Prestação de serviços'
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'template_titulos.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Importar CSV</h1>
          <p className="text-muted-foreground">Importe títulos de cobrança em lote</p>
        </div>
        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-2" />
          Baixar Template
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload do Arquivo
            </CardTitle>
            <CardDescription>
              Selecione um arquivo CSV com os dados dos títulos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">
                {file ? file.name : 'Clique para selecionar um arquivo CSV'}
              </p>
              <p className="text-sm text-muted-foreground">
                Ou arraste e solte o arquivo aqui
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />

            {errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc list-inside">
                    {errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {uploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Importando...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}

            <Button 
              onClick={handleImport} 
              disabled={!file || errors.length > 0 || uploading}
              className="w-full"
            >
              {uploading ? 'Importando...' : 'Importar Dados'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instruções</CardTitle>
            <CardDescription>
              Como preparar seu arquivo CSV
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Colunas Obrigatórias
              </h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li><code>cliente</code> - Nome completo do cliente</li>
                <li><code>cpf_cnpj</code> - CPF ou CNPJ</li>
                <li><code>valor</code> - Valor em formato decimal</li>
                <li><code>vencimento</code> - Data no formato YYYY-MM-DD</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">Colunas Opcionais</h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li><code>contato</code> - Telefone ou email</li>
                <li><code>descricao</code> - Descrição do título</li>
              </ul>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Certifique-se de que o arquivo esteja codificado em UTF-8 e use vírgula como separador.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>Prévia dos Dados</CardTitle>
            <CardDescription>
              Primeiras 5 linhas do arquivo selecionado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {preview.headers.map((header, index) => (
                      <TableHead key={index} className="capitalize">{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={cellIndex}>{cell}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {importResult && (
        <Card>
          <CardHeader>
            <CardTitle>Resultado da Importação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{importResult.success}</div>
                <div className="text-sm text-green-700">Importados</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{importResult.errors.length}</div>
                <div className="text-sm text-red-700">Erros</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{importResult.clientesCreated}</div>
                <div className="text-sm text-blue-700">Clientes Criados</div>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="max-h-40 overflow-y-auto">
                    <ul className="list-disc list-inside">
                      {importResult.errors.slice(0, 10).map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                      {importResult.errors.length > 10 && (
                        <li>... e mais {importResult.errors.length - 10} erros</li>
                      )}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
