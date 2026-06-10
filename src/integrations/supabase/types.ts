export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      acordos: {
        Row: {
          cliente_id: string
          company_id: string
          created_at: string
          created_by: string
          data_acordo: string
          data_inicio: string
          data_vencimento_primeira_parcela: string
          deleted_at: string | null
          desconto: number
          id: string
          observacoes: string | null
          parcelas: number
          status: string
          taxa_juros: number | null
          titulo_id: string
          updated_at: string
          valor_acordo: number
          valor_original: number
          valor_parcela: number
        }
        Insert: {
          cliente_id: string
          company_id: string
          created_at?: string
          created_by: string
          data_acordo?: string
          data_inicio?: string
          data_vencimento_primeira_parcela: string
          deleted_at?: string | null
          desconto?: number
          id?: string
          observacoes?: string | null
          parcelas?: number
          status?: string
          taxa_juros?: number | null
          titulo_id: string
          updated_at?: string
          valor_acordo: number
          valor_original: number
          valor_parcela: number
        }
        Update: {
          cliente_id?: string
          company_id?: string
          created_at?: string
          created_by?: string
          data_acordo?: string
          data_inicio?: string
          data_vencimento_primeira_parcela?: string
          deleted_at?: string | null
          desconto?: number
          id?: string
          observacoes?: string | null
          parcelas?: number
          status?: string
          taxa_juros?: number | null
          titulo_id?: string
          updated_at?: string
          valor_acordo?: number
          valor_original?: number
          valor_parcela?: number
        }
        Relationships: [
          {
            foreignKeyName: "acordos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordos_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordos_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_titulos_completos"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          acao: string
          company_id: string
          created_at: string
          descricao: string
          id: string
          recurso_id: string | null
          recurso_tipo: string
          user_id: string
        }
        Insert: {
          acao: string
          company_id: string
          created_at?: string
          descricao: string
          id?: string
          recurso_id?: string | null
          recurso_tipo: string
          user_id: string
        }
        Update: {
          acao?: string
          company_id?: string
          created_at?: string
          descricao?: string
          id?: string
          recurso_id?: string | null
          recurso_tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamentos: {
        Row: {
          acordo_id: string | null
          cliente_id: string
          company_id: string
          created_at: string | null
          created_by: string
          data_agendamento: string
          deleted_at: string | null
          descricao: string | null
          id: string
          resultado: string | null
          status: string
          tipo_evento: string
          titulo_id: string | null
          updated_at: string | null
        }
        Insert: {
          acordo_id?: string | null
          cliente_id: string
          company_id: string
          created_at?: string | null
          created_by: string
          data_agendamento: string
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          resultado?: string | null
          status?: string
          tipo_evento: string
          titulo_id?: string | null
          updated_at?: string | null
        }
        Update: {
          acordo_id?: string | null
          cliente_id?: string
          company_id?: string
          created_at?: string | null
          created_by?: string
          data_agendamento?: string
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          resultado?: string | null
          status?: string
          tipo_evento?: string
          titulo_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_titulos_completos"
            referencedColumns: ["id"]
          },
        ]
      }
      anexos: {
        Row: {
          acordo_id: string | null
          categoria: string | null
          cliente_id: string | null
          company_id: string
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          nome_arquivo: string
          tamanho_arquivo: number | null
          tipo_arquivo: string
          titulo_id: string | null
          url_arquivo: string
        }
        Insert: {
          acordo_id?: string | null
          categoria?: string | null
          cliente_id?: string | null
          company_id: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          nome_arquivo: string
          tamanho_arquivo?: number | null
          tipo_arquivo: string
          titulo_id?: string | null
          url_arquivo: string
        }
        Update: {
          acordo_id?: string | null
          categoria?: string | null
          cliente_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          nome_arquivo?: string
          tamanho_arquivo?: number | null
          tipo_arquivo?: string
          titulo_id?: string | null
          url_arquivo?: string
        }
        Relationships: [
          {
            foreignKeyName: "anexos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_titulos_completos"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_ip: string | null
          after_data: Json | null
          before_data: Json | null
          changed_fields: string[] | null
          company_id: string | null
          context: Json | null
          id: string
          occurred_at: string
          record_id: string | null
          reverted: boolean
          reverted_by_id: string | null
          table_name: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_ip?: string | null
          after_data?: Json | null
          before_data?: Json | null
          changed_fields?: string[] | null
          company_id?: string | null
          context?: Json | null
          id?: string
          occurred_at?: string
          record_id?: string | null
          reverted?: boolean
          reverted_by_id?: string | null
          table_name?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_ip?: string | null
          after_data?: Json | null
          before_data?: Json | null
          changed_fields?: string[] | null
          company_id?: string | null
          context?: Json | null
          id?: string
          occurred_at?: string
          record_id?: string | null
          reverted?: boolean
          reverted_by_id?: string | null
          table_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_reverted_by_id_fkey"
            columns: ["reverted_by_id"]
            isOneToOne: false
            referencedRelation: "audit_log"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_logs: {
        Row: {
          campanha_id: string
          cliente: string
          company_id: string
          contato: string
          erro_mensagem: string | null
          id: string
          sent_at: string
          status: string
          titulo_id: string | null
        }
        Insert: {
          campanha_id: string
          cliente: string
          company_id: string
          contato: string
          erro_mensagem?: string | null
          id?: string
          sent_at?: string
          status?: string
          titulo_id?: string | null
        }
        Update: {
          campanha_id?: string
          cliente?: string
          company_id?: string
          contato?: string
          erro_mensagem?: string | null
          id?: string
          sent_at?: string
          status?: string
          titulo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_logs_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_logs_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_logs_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_titulos_completos"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas: {
        Row: {
          canal: string
          company_id: string
          created_at: string
          created_by: string
          deleted_at: string | null
          filtros: Json | null
          id: string
          mensagem: string
          nome: string
          status: string
          updated_at: string
        }
        Insert: {
          canal: string
          company_id: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          filtros?: Json | null
          id?: string
          mensagem: string
          nome: string
          status?: string
          updated_at?: string
        }
        Update: {
          canal?: string
          company_id?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          filtros?: Json | null
          id?: string
          mensagem?: string
          nome?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          cep: string | null
          cidade: string | null
          cobrador_id: string | null
          company_id: string
          cpf_cnpj: string
          created_at: string
          created_by: string
          deleted_at: string | null
          email: string | null
          endereco_completo: string | null
          estado: string | null
          id: string
          nome: string
          observacoes: string | null
          status: string
          telefone: string | null
          updated_at: string
          vendedor_id: string | null
        }
        Insert: {
          cep?: string | null
          cidade?: string | null
          cobrador_id?: string | null
          company_id: string
          cpf_cnpj: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          email?: string | null
          endereco_completo?: string | null
          estado?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
          vendedor_id?: string | null
        }
        Update: {
          cep?: string | null
          cidade?: string | null
          cobrador_id?: string | null
          company_id?: string
          cpf_cnpj?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          email?: string | null
          endereco_completo?: string | null
          estado?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_cobrador_id_fkey"
            columns: ["cobrador_id"]
            isOneToOne: false
            referencedRelation: "cobradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      cobradores: {
        Row: {
          ativo: boolean
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobradores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cnpj: string | null
          created_at: string
          deleted_at: string | null
          id: string
          nome: string
          plano: string
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome: string
          plano?: string
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome?: string
          plano?: string
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      comunicacoes: {
        Row: {
          anexos: Json | null
          assunto: string
          canal: string
          cliente_id: string
          company_id: string
          created_at: string
          created_by: string
          data_contato: string | null
          id: string
          mensagem: string | null
          resultado: string | null
          tipo: string
        }
        Insert: {
          anexos?: Json | null
          assunto: string
          canal: string
          cliente_id: string
          company_id: string
          created_at?: string
          created_by: string
          data_contato?: string | null
          id?: string
          mensagem?: string | null
          resultado?: string | null
          tipo: string
        }
        Update: {
          anexos?: Json | null
          assunto?: string
          canal?: string
          cliente_id?: string
          company_id?: string
          created_at?: string
          created_by?: string
          data_contato?: string | null
          id?: string
          mensagem?: string | null
          resultado?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicacoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      convites: {
        Row: {
          cobrador_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          nome_sugerido: string | null
          status: string
          token: string
          used_by: string | null
          vendedor_id: string | null
        }
        Insert: {
          cobrador_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          nome_sugerido?: string | null
          status?: string
          token: string
          used_by?: string | null
          vendedor_id?: string | null
        }
        Update: {
          cobrador_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          nome_sugerido?: string | null
          status?: string
          token?: string
          used_by?: string | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "convites_cobrador_id_fkey"
            columns: ["cobrador_id"]
            isOneToOne: false
            referencedRelation: "cobradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_parcela: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          descricao: string | null
          efeito: number
          estornado: boolean | null
          estornado_por_id: string | null
          id: string
          meio_pagamento: string | null
          metadata: Json | null
          parcela_id: string
          tipo: string
          valor: number
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          efeito: number
          estornado?: boolean | null
          estornado_por_id?: string | null
          id?: string
          meio_pagamento?: string | null
          metadata?: Json | null
          parcela_id: string
          tipo: string
          valor: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          efeito?: number
          estornado?: boolean | null
          estornado_por_id?: string | null
          id?: string
          meio_pagamento?: string | null
          metadata?: Json | null
          parcela_id?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "eventos_parcela_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_parcela_estornado_por_id_fkey"
            columns: ["estornado_por_id"]
            isOneToOne: false
            referencedRelation: "eventos_parcela"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_parcela_parcela_id_fkey"
            columns: ["parcela_id"]
            isOneToOne: false
            referencedRelation: "mv_parcelas_consolidadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_parcela_parcela_id_fkey"
            columns: ["parcela_id"]
            isOneToOne: false
            referencedRelation: "parcelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_parcela_parcela_id_fkey"
            columns: ["parcela_id"]
            isOneToOne: false
            referencedRelation: "vw_parcelas_consolidadas"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          company_id: string
          created_at: string
          data_agendamento: string | null
          id: string
          lida: boolean
          mensagem: string
          metadata: Json | null
          prioridade: string
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          data_agendamento?: string | null
          id?: string
          lida?: boolean
          mensagem: string
          metadata?: Json | null
          prioridade?: string
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          data_agendamento?: string | null
          id?: string
          lida?: boolean
          mensagem?: string
          metadata?: Json | null
          prioridade?: string
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      parcelas: {
        Row: {
          company_id: string
          created_at: string | null
          deleted_at: string | null
          id: string
          numero_parcela: number
          titulo_id: string
          valor_nominal: number
          vencimento: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          numero_parcela: number
          titulo_id: string
          valor_nominal: number
          vencimento: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          numero_parcela?: number
          titulo_id?: string
          valor_nominal?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelas_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelas_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_titulos_completos"
            referencedColumns: ["id"]
          },
        ]
      }
      parcelas_acordo: {
        Row: {
          acordo_id: string
          company_id: string
          created_at: string
          data_pagamento: string | null
          data_vencimento: string
          deleted_at: string | null
          id: string
          numero_parcela: number
          observacoes: string | null
          status: string
          updated_at: string
          valor: number
          valor_juros: number
          valor_total: number
        }
        Insert: {
          acordo_id: string
          company_id: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento: string
          deleted_at?: string | null
          id?: string
          numero_parcela: number
          observacoes?: string | null
          status?: string
          updated_at?: string
          valor: number
          valor_juros?: number
          valor_total: number
        }
        Update: {
          acordo_id?: string
          company_id?: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string
          deleted_at?: string | null
          id?: string
          numero_parcela?: number
          observacoes?: string | null
          status?: string
          updated_at?: string
          valor?: number
          valor_juros?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_acordo_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelas_acordo_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email: string
          id?: string
          nome: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string
          id?: string
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      titulos: {
        Row: {
          cliente_id: string | null
          company_id: string
          created_at: string
          created_by: string
          deleted_at: string | null
          descricao: string | null
          id: string
          metadata: Json | null
          numero_documento: string | null
          status: string
          updated_at: string
          valor_original: number
          vencimento_original: string
        }
        Insert: {
          cliente_id?: string | null
          company_id: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          metadata?: Json | null
          numero_documento?: string | null
          status?: string
          updated_at?: string
          valor_original: number
          vencimento_original: string
        }
        Update: {
          cliente_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          metadata?: Json | null
          numero_documento?: string | null
          status?: string
          updated_at?: string
          valor_original?: number
          vencimento_original?: string
        }
        Relationships: [
          {
            foreignKeyName: "titulos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      vendedores: {
        Row: {
          ativo: boolean
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendedores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mv_parcelas_consolidadas: {
        Row: {
          company_id: string | null
          data_ultimo_pagamento: string | null
          descontos: number | null
          id: string | null
          juros: number | null
          multa: number | null
          numero_parcela: number | null
          saldo_atual: number | null
          status: string | null
          titulo_id: string | null
          total_eventos: number | null
          total_pago: number | null
          valor_nominal: number | null
          vencimento: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelas_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelas_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_titulos_completos"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_parcelas_consolidadas: {
        Row: {
          company_id: string | null
          data_ultimo_pagamento: string | null
          descontos: number | null
          id: string | null
          juros: number | null
          multa: number | null
          numero_parcela: number | null
          saldo_atual: number | null
          status: string | null
          titulo_id: string | null
          total_eventos: number | null
          total_pago: number | null
          valor_nominal: number | null
          vencimento: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelas_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelas_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_titulos_completos"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_titulos_completos: {
        Row: {
          cliente_cpf_cnpj: string | null
          cliente_email: string | null
          cliente_id: string | null
          cliente_nome: string | null
          cliente_telefone: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          descricao: string | null
          id: string | null
          metadata: Json | null
          numero_documento: string | null
          parcelas_pagas: number | null
          parcelas_pendentes: number | null
          parcelas_vencidas: number | null
          proximo_vencimento: string | null
          quantidade_parcelas: number | null
          saldo_devedor: number | null
          status: string | null
          tipo: string | null
          titulo_status: string | null
          total_descontos: number | null
          total_juros: number | null
          total_multa: number | null
          total_pago: number | null
          updated_at: string | null
          valor_original: number | null
          vencimento_original: string | null
        }
        Relationships: [
          {
            foreignKeyName: "titulos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      aplicar_encargo_parcela: {
        Args: {
          p_created_by?: string
          p_descricao?: string
          p_motivo?: string
          p_parcela_id: string
          p_tipo: string
          p_valor: number
        }
        Returns: Json
      }
      cancelar_titulo: {
        Args: { p_motivo?: string; p_titulo_id: string }
        Returns: Json
      }
      check_overdue_parcelas: { Args: never; Returns: undefined }
      cobrador_ve_cliente: { Args: { _cliente_id: string }; Returns: boolean }
      cobrador_ve_titulo: { Args: { _titulo_id: string }; Returns: boolean }
      conceder_desconto_parcela: {
        Args: {
          p_created_by?: string
          p_descricao?: string
          p_motivo?: string
          p_parcela_id: string
          p_valor: number
        }
        Returns: Json
      }
      criar_empresa_e_admin: {
        Args: { p_cnpj?: string; p_nome: string; p_slug?: string }
        Returns: Json
      }
      criar_titulo_com_parcelas: {
        Args: {
          p_cliente_id: string
          p_created_by?: string
          p_descricao?: string
          p_intervalo_dias?: number
          p_numero_documento?: string
          p_numero_parcelas?: number
          p_valor_original: number
          p_vencimento_original: string
        }
        Returns: Json
      }
      current_cobrador_id: { Args: never; Returns: string }
      current_company_id: { Args: never; Returns: string }
      current_vendedor_id: { Args: never; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      estornar_evento_parcela: {
        Args: { p_created_by?: string; p_evento_id: string; p_motivo: string }
        Returns: Json
      }
      find_or_create_cobrador: { Args: { p_nome: string }; Returns: string }
      find_or_create_vendedor: { Args: { p_nome: string }; Returns: string }
      has_min_role: {
        Args: { _min: Database["public"]["Enums"]["app_role"]; _uid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      importar_titulo: {
        Args: {
          p_cliente_nome: string
          p_cobrador?: string
          p_company_id: string
          p_contato?: string
          p_cpf_cnpj: string
          p_descricao?: string
          p_valor: number
          p_vencimento: string
          p_vendedor?: string
        }
        Returns: Json
      }
      is_super_admin: { Args: never; Returns: boolean }
      migrate_existing_titulos_to_clientes: { Args: never; Returns: undefined }
      refresh_mv_parcelas: { Args: never; Returns: undefined }
      registrar_pagamento_parcela: {
        Args: {
          p_created_by?: string
          p_descricao?: string
          p_meio_pagamento: string
          p_parcela_id: string
          p_valor: number
        }
        Returns: Json
      }
      reverter_audit_log: {
        Args: { p_audit_id: string; p_motivo: string }
        Returns: Json
      }
      role_rank: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: number
      }
    }
    Enums: {
      app_role:
        | "leitura"
        | "vendedor"
        | "operador"
        | "financeiro"
        | "admin"
        | "super_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "leitura",
        "vendedor",
        "operador",
        "financeiro",
        "admin",
        "super_admin",
      ],
    },
  },
} as const
