export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      budgets: {
        Row: {
          amount_cents: number;
          category_id: string;
          month: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          category_id: string;
          month: string;
          user_id?: string;
        };
        Update: {
          amount_cents?: number;
          category_id?: string;
          month?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'budgets_category_id_user_id_fkey';
            columns: ['category_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      expense_items: {
        Row: {
          amount_cents: number;
          expense_id: string;
          id: string;
          kind: string;
          name: string;
          position: number;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          expense_id: string;
          id?: string;
          kind: string;
          name: string;
          position: number;
        };
        Update: {
          amount_cents?: number;
          expense_id?: string;
          id?: string;
          kind?: string;
          name?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'expense_items_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
        ];
      };
      expenses: {
        Row: {
          category_id: string | null;
          created_at: string;
          created_by: string;
          expense_date: string;
          group_id: string;
          id: string;
          merchant: string;
          paid_by: string;
          replaces_expense_id: string | null;
          source: string;
          total_cents: number;
          voided_at: string | null;
          voided_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          category_id?: string | null;
          created_at?: string;
          created_by: string;
          expense_date: string;
          group_id: string;
          id?: string;
          merchant: string;
          paid_by: string;
          replaces_expense_id?: string | null;
          source?: string;
          total_cents: number;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          category_id?: string | null;
          created_at?: string;
          created_by?: string;
          expense_date?: string;
          group_id?: string;
          id?: string;
          merchant?: string;
          paid_by?: string;
          replaces_expense_id?: string | null;
          source?: string;
          total_cents?: number;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'expenses_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_paid_by_group_id_fkey';
            columns: ['paid_by', 'group_id'];
            isOneToOne: false;
            referencedRelation: 'participants';
            referencedColumns: ['id', 'group_id'];
          },
          {
            foreignKeyName: 'expenses_replaces_expense_id_fkey';
            columns: ['replaces_expense_id'];
            isOneToOne: true;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
        ];
      };
      groups: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          is_personal: boolean;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string;
          id?: string;
          is_personal?: boolean;
          name: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          is_personal?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      inbound_emails: {
        Row: {
          error: string | null;
          from_address: string;
          id: string;
          provider_message_id: string;
          received_at: string;
          status: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          error?: string | null;
          from_address: string;
          id?: string;
          provider_message_id: string;
          received_at?: string;
          status: string;
          user_id?: string | null;
        };
        Update: {
          error?: string | null;
          from_address?: string;
          id?: string;
          provider_message_id?: string;
          received_at?: string;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      item_assignments: {
        Row: {
          item_id: string;
          participant_id: string;
        };
        ComputedFields: never;
        Insert: {
          item_id: string;
          participant_id: string;
        };
        Update: {
          item_id?: string;
          participant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'item_assignments_item_id_fkey';
            columns: ['item_id'];
            isOneToOne: false;
            referencedRelation: 'expense_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'item_assignments_participant_id_fkey';
            columns: ['participant_id'];
            isOneToOne: false;
            referencedRelation: 'participants';
            referencedColumns: ['id'];
          },
        ];
      };
      outbound_messages: {
        Row: {
          body: string;
          created_at: string;
          error: string | null;
          id: string;
          provider_id: string | null;
          status: string;
          to_phone: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          provider_id?: string | null;
          status: string;
          to_phone: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          provider_id?: string | null;
          status?: string;
          to_phone?: string;
        };
        Relationships: [];
      };
      participants: {
        Row: {
          created_at: string;
          display_name: string;
          group_id: string;
          id: string;
          phone: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name: string;
          group_id: string;
          id?: string;
          phone?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          group_id?: string;
          id?: string;
          phone?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'participants_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount_cents: number;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          expense_id: string | null;
          from_participant: string;
          group_id: string;
          id: string;
          kind: string;
          method: string | null;
          recorded_by: string | null;
          status: string;
          to_participant: string;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          expense_id?: string | null;
          from_participant: string;
          group_id: string;
          id?: string;
          kind: string;
          method?: string | null;
          recorded_by?: string | null;
          status: string;
          to_participant: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          expense_id?: string | null;
          from_participant?: string;
          group_id?: string;
          id?: string;
          kind?: string;
          method?: string | null;
          recorded_by?: string | null;
          status?: string;
          to_participant?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_from_participant_group_id_fkey';
            columns: ['from_participant', 'group_id'];
            isOneToOne: false;
            referencedRelation: 'participants';
            referencedColumns: ['id', 'group_id'];
          },
          {
            foreignKeyName: 'payments_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_to_participant_group_id_fkey';
            columns: ['to_participant', 'group_id'];
            isOneToOne: false;
            referencedRelation: 'participants';
            referencedColumns: ['id', 'group_id'];
          },
        ];
      };
      profiles: {
        Row: {
          cashapp_tag: string | null;
          created_at: string;
          display_name: string;
          id: string;
          paypal_username: string | null;
          venmo_username: string | null;
        };
        ComputedFields: never;
        Insert: {
          cashapp_tag?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          paypal_username?: string | null;
          venmo_username?: string | null;
        };
        Update: {
          cashapp_tag?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          paypal_username?: string | null;
          venmo_username?: string | null;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          created_at: string;
          token: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          token: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          token?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      receipt_extractions: {
        Row: {
          created_at: string;
          error: string | null;
          id: string;
          model: string | null;
          result: Json | null;
          source: string;
          status: string;
          storage_path: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          error?: string | null;
          id?: string;
          model?: string | null;
          result?: Json | null;
          source: string;
          status: string;
          storage_path?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          id?: string;
          model?: string | null;
          result?: Json | null;
          source?: string;
          status?: string;
          storage_path?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      share_links: {
        Row: {
          created_at: string;
          id: string;
          participant_id: string;
          revoked_at: string | null;
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          participant_id: string;
          revoked_at?: string | null;
          token_hash: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          participant_id?: string;
          revoked_at?: string | null;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'share_links_participant_id_fkey';
            columns: ['participant_id'];
            isOneToOne: false;
            referencedRelation: 'participants';
            referencedColumns: ['id'];
          },
        ];
      };
      shares: {
        Row: {
          amount_cents: number;
          category_override_id: string | null;
          expense_id: string;
          participant_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          category_override_id?: string | null;
          expense_id: string;
          participant_id: string;
        };
        Update: {
          amount_cents?: number;
          category_override_id?: string | null;
          expense_id?: string;
          participant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shares_category_override_id_fkey';
            columns: ['category_override_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shares_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shares_participant_id_fkey';
            columns: ['participant_id'];
            isOneToOne: false;
            referencedRelation: 'participants';
            referencedColumns: ['id'];
          },
        ];
      };
      sms_consents: {
        Row: {
          consented_at: string;
          id: string;
          participant_id: string | null;
          phone: string;
          revoked_at: string | null;
          source: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          consented_at?: string;
          id?: string;
          participant_id?: string | null;
          phone: string;
          revoked_at?: string | null;
          source: string;
          user_id?: string | null;
        };
        Update: {
          consented_at?: string;
          id?: string;
          participant_id?: string | null;
          phone?: string;
          revoked_at?: string | null;
          source?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'sms_consents_participant_id_fkey';
            columns: ['participant_id'];
            isOneToOne: false;
            referencedRelation: 'participants';
            referencedColumns: ['id'];
          },
        ];
      };
      verified_emails: {
        Row: {
          email: string;
          user_id: string;
          verified_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          email: string;
          user_id: string;
          verified_at?: string | null;
        };
        Update: {
          email?: string;
          user_id?: string;
          verified_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      balances: {
        Args: Record<PropertyKey, never>;
        Returns: {
          amount_cents: number;
          from_participant: string;
          group_id: string;
          to_participant: string;
        }[];
      };
      get_my_shares: {
        Args: Record<PropertyKey, never>;
        Returns: {
          amount_cents: number;
          category_override_id: string;
          expense_date: string;
          expense_id: string;
          group_id: string;
          items: Json;
          merchant: string;
          paid_by: string;
          participant_id: string;
          payer_name: string;
        }[];
      };
      my_spending: {
        Args: Record<PropertyKey, never>;
        Returns: {
          amount_cents: number;
          category_id: string;
          month: string;
        }[];
      };
      save_expense: {
        Args: {
          p_category_id?: string;
          p_expense_date: string;
          p_group_id: string;
          p_items?: Json;
          p_merchant: string;
          p_paid_by: string;
          p_replaces_expense_id?: string;
          p_shares: Json;
          p_source?: string;
          p_total_cents: number;
        };
        Returns: string;
      };
      void_expense: { Args: { p_expense_id: string }; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
