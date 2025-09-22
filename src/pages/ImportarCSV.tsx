import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

interface CSVPreview {
  headers: string[];
  rows: string[][];
}

export default function ImportarCSV() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CSVPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const requiredHeaders = ['cliente', 'cpf_cnpj', 'valor', 'vencimento'];
  const optionalHeaders = ['contato', 'descricao'];

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

      // Validar cabeçalhos obrigatórios
      const validationErrors: string[] = [];
      requiredHeaders.forEach(required => {
        if (!headers.includes(required)) {
          validationErrors.push(`Coluna obrigatória '${required}' não encontrada`);
        }
      });

      setErrors(validationErrors);
      setPreview({ headers, rows });
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!file || !preview || errors.length > 0) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      // Simulação do processo de importação
      for (let i = 0; i <= 100; i += 10) {
        setUploadProgress(i);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      toast({
        title: "Sucesso",
        description: `Arquivo ${file.name} importado com sucesso!`,
      });

      // Reset form
      setFile(null);
      setPreview(null);
      setErrors([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
      'João Silva,123.456.789-00,1500.00,2024-01-30,(11) 99999-9999,Mensalidade janeiro',
      'Maria Santos,987.654.321-00,750.50,2024-02-15,(11) 88888-8888,Serviço prestado'
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
                <li><code>cliente</code> - Nome do cliente</li>
                <li><code>cpf_cnpj</code> - CPF ou CNPJ</li>
                <li><code>valor</code> - Valor do título (formato: 1500.00)</li>
                <li><code>vencimento</code> - Data de vencimento (YYYY-MM-DD)</li>
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
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {preview.headers.map((header, index) => (
                      <TableHead key={index} className="capitalize">
                        {header}
                        {requiredHeaders.includes(header) && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </TableHead>
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
    </div>
  );
}