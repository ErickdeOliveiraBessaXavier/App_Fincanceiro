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
  public: {
    Tables: {
      acordos: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string
          data_acordo: string
          data_inicio: string
          data_vencimento_primeira_parcela: string
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
          created_at?: string
          created_by: string
          data_acordo?: string
          data_inicio?: string
          data_vencimento_primeira_parcela: string
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
          created_at?: string
          created_by?: string
          data_acordo?: string
          data_inicio?: string
          data_vencimento_primeira_parcela?: string
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
            foreignKeyName: "fk_cliente"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_titulo"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_titulo"
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
          created_at: string
          descricao: string
          id: string
          recurso_id: string | null
          recurso_tipo: string
          user_id: string
        }
        Insert: {
          acao: string
          created_at?: string
          descricao: string
          id?: string
          recurso_id?: string | null
          recurso_tipo: string
          user_id: string
        }
        Update: {
          acao?: string
          created_at?: string
          descricao?: string
          id?: string
          recurso_id?: string | null
          recurso_tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      agendamentos: {
        Row: {
          acordo_id: string | null
          cliente_id: string
          created_at: string | null
          created_by: string
          data_agendamento: string
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
          created_at?: string | null
          created_by: string
          data_agendamento: string
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
          created_at?: string | null
          created_by?: string
          data_agendamento?: string
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
            foreignKeyName: "agendamentos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
          created_at: string
          created_by: string
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
          created_at?: string
          created_by: string
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
          created_at?: string
          created_by?: string
          id?: string
          nome_arquivo?: string
          tamanho_arquivo?: number | null
          tipo_arquivo?: string
          titulo_id?: string | null
          url_arquivo?: string
        }
        Relationships: []
      }
      campaign_logs: {
        Row: {
          campanha_id: string
          cliente: string
          contato: string
          erro_mensagem: string | null
          id: string
          sent_at: string
          status: string
          titulo_id: string
        }
        Insert: {
          campanha_id: string
          cliente: string
          contato: string
          erro_mensagem?: string | null
          id?: string
          sent_at?: string
          status?: string
          titulo_id: string
        }
        Update: {
          campanha_id?: string
          cliente?: string
          contato?: string
          erro_mensagem?: string | null
          id?: string
          sent_at?: string
          status?: string
          titulo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_logs_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas: {
        Row: {
          canal: string
          created_at: string
          created_by: string
          filtros: Json | null
          id: string
          mensagem: string
          nome: string
          status: string
          updated_at: string
        }
        Insert: {
          canal: string
          created_at?: string
          created_by: string
          filtros?: Json | null
          id?: string
          mensagem: string
          nome: string
          status?: string
          updated_at?: string
        }
        Update: {
          canal?: string
          created_at?: string
          created_by?: string
          filtros?: Json | null
          id?: string
          mensagem?: string
          nome?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          cep: string | null
          cidade: string | null
          cpf_cnpj: string
          created_at: string
          created_by: string
          email: string | null
          endereco_completo: string | null
          estado: string | null
          id: string
          nome: string
          observacoes: string | null
          status: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cep?: string | null
          cidade?: string | null
          cpf_cnpj: string
          created_at?: string
          created_by: string
          email?: string | null
          endereco_completo?: string | null
          estado?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cep?: string | null
          cidade?: string | null
          cpf_cnpj?: string
          created_at?: string
          created_by?: string
          email?: string | null
          endereco_completo?: string | null
          estado?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
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
            foreignKeyName: "comunicacoes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      eventos_parcela: {
        Row: {
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
        ]
      }
      notificacoes: {
        Row: {
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
        Relationships: []
      }
      parcelas: {
        Row: {
          created_at: string | null
          id: string
          numero_parcela: number
          titulo_id: string
          valor_nominal: number
          vencimento: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          numero_parcela: number
          titulo_id: string
          valor_nominal: number
          vencimento: string
        }
        Update: {
          created_at?: string | null
          id?: string
          numero_parcela?: number
          titulo_id?: string
          valor_nominal?: number
          vencimento?: string
        }
        Relationships: [
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
          created_at: string
          data_pagamento: string | null
          data_vencimento: string
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
          created_at?: string
          data_pagamento?: string | null
          data_vencimento: string
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
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string
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
            foreignKeyName: "fk_acordo"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          nome: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      titulos: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string
          descricao: string | null
          id: string
          metadata: Json | null
          numero_documento: string | null
          updated_at: string
          valor_original: number
          vencimento_original: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by: string
          descricao?: string | null
          id?: string
          metadata?: Json | null
          numero_documento?: string | null
          updated_at?: string
          valor_original: number
          vencimento_original: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string
          descricao?: string | null
          id?: string
          metadata?: Json | null
          numero_documento?: string | null
          updated_at?: string
          valor_original?: number
          vencimento_original?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_cliente"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      mv_parcelas_consolidadas: {
        Row: {
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
            foreignKeyName: "fk_cliente"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
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
          p_parcela_id: string
          p_tipo: string
          p_valor: number
        }
        Returns: Json
      }
      check_overdue_parcelas: { Args: never; Returns: undefined }
      conceder_desconto_parcela: {
        Args: {
          p_created_by?: string
          p_descricao?: string
          p_parcela_id: string
          p_valor: number
        }
        Returns: Json
      }
      estornar_evento_parcela: {
        Args: { p_created_by?: string; p_evento_id: string; p_motivo: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
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
    }
    Enums: {
      app_role: "admin" | "operador"
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
  public: {
    Enums: {
      app_role: ["admin", "operador"],
    },
  },
} as const
