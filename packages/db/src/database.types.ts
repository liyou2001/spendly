export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      budgets: {
        Row: {
          amount_cents: number | null;
          category_id: string;
          month: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_cents?: number | null;
          category_id: string;
          month: string;
          user_id?: string;
        };
        Update: {
          amount_cents?: number | null;
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
          by_units: boolean;
          expense_id: string;
          id: string;
          kind: string;
          name: string;
          position: number;
          quantity: number;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          by_units?: boolean;
          expense_id: string;
          id?: string;
          kind: string;
          name: string;
          position: number;
          quantity?: number;
        };
        Update: {
          amount_cents?: number;
          by_units?: boolean;
          expense_id?: string;
          id?: string;
          kind?: string;
          name?: string;
          position?: number;
          quantity?: number;
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
      expense_receipts: {
        Row: {
          attached_by: string;
          created_at: string;
          expense_id: string;
          storage_path: string;
        };
        ComputedFields: never;
        Insert: {
          attached_by?: string;
          created_at?: string;
          expense_id: string;
          storage_path: string;
        };
        Update: {
          attached_by?: string;
          created_at?: string;
          expense_id?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'expense_receipts_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: true;
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
      feedback: {
        Row: {
          app_version: string | null;
          created_at: string;
          id: string;
          message: string;
          platform: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          app_version?: string | null;
          created_at?: string;
          id?: string;
          message: string;
          platform?: string | null;
          user_id?: string;
        };
        Update: {
          app_version?: string | null;
          created_at?: string;
          id?: string;
          message?: string;
          platform?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      forwarding_codes: {
        Row: {
          code: string;
          created_at: string;
          dismissed_at: string | null;
          id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          dismissed_at?: string | null;
          id?: string;
          user_id: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          dismissed_at?: string | null;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      group_invites: {
        Row: {
          created_at: string;
          decided_at: string | null;
          id: string;
          invited_by: string;
          invited_user_id: string;
          participant_id: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          id?: string;
          invited_by: string;
          invited_user_id: string;
          participant_id: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          id?: string;
          invited_by?: string;
          invited_user_id?: string;
          participant_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_invites_participant_id_fkey';
            columns: ['participant_id'];
            isOneToOne: false;
            referencedRelation: 'participants';
            referencedColumns: ['id'];
          },
        ];
      };
      groups: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          is_one_off: boolean;
          is_personal: boolean;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string;
          id?: string;
          is_one_off?: boolean;
          is_personal?: boolean;
          name: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          is_one_off?: boolean;
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
          subject: string | null;
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
          subject?: string | null;
          user_id?: string | null;
        };
        Update: {
          error?: string | null;
          from_address?: string;
          id?: string;
          provider_message_id?: string;
          received_at?: string;
          status?: string;
          subject?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      item_assignments: {
        Row: {
          item_id: string;
          participant_id: string;
          units: number;
        };
        ComputedFields: never;
        Insert: {
          item_id: string;
          participant_id: string;
          units?: number;
        };
        Update: {
          item_id?: string;
          participant_id?: string;
          units?: number;
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
      problem_reports: {
        Row: {
          created_at: string;
          from_participant: string;
          group_id: string;
          id: string;
          message: string;
          resolved_at: string | null;
          to_participant: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          from_participant: string;
          group_id: string;
          id?: string;
          message: string;
          resolved_at?: string | null;
          to_participant: string;
        };
        Update: {
          created_at?: string;
          from_participant?: string;
          group_id?: string;
          id?: string;
          message?: string;
          resolved_at?: string | null;
          to_participant?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'problem_reports_from_participant_group_id_fkey';
            columns: ['from_participant', 'group_id'];
            isOneToOne: false;
            referencedRelation: 'participants';
            referencedColumns: ['id', 'group_id'];
          },
          {
            foreignKeyName: 'problem_reports_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'problem_reports_to_participant_group_id_fkey';
            columns: ['to_participant', 'group_id'];
            isOneToOne: false;
            referencedRelation: 'participants';
            referencedColumns: ['id', 'group_id'];
          },
        ];
      };
      profiles: {
        Row: {
          auto_confirm_days: number | null;
          cashapp_tag: string | null;
          created_at: string;
          display_name: string;
          id: string;
          paypal_username: string | null;
          time_zone: string | null;
          username: string;
          venmo_username: string | null;
          zelle_contact: string | null;
        };
        ComputedFields: never;
        Insert: {
          auto_confirm_days?: number | null;
          cashapp_tag?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          paypal_username?: string | null;
          time_zone?: string | null;
          username: string;
          venmo_username?: string | null;
          zelle_contact?: string | null;
        };
        Update: {
          auto_confirm_days?: number | null;
          cashapp_tag?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          paypal_username?: string | null;
          time_zone?: string | null;
          username?: string;
          venmo_username?: string | null;
          zelle_contact?: string | null;
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
      receipt_drafts: {
        Row: {
          created_at: string;
          dismissed_at: string | null;
          gap_cents: number;
          id: string;
          inbound_email_id: string | null;
          receipt: NonNullable<Json>;
          status: string;
          used_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          dismissed_at?: string | null;
          gap_cents?: number;
          id?: string;
          inbound_email_id?: string | null;
          receipt: NonNullable<Json>;
          status: string;
          used_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          dismissed_at?: string | null;
          gap_cents?: number;
          id?: string;
          inbound_email_id?: string | null;
          receipt?: NonNullable<Json>;
          status?: string;
          used_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'receipt_drafts_inbound_email_id_fkey';
            columns: ['inbound_email_id'];
            isOneToOne: false;
            referencedRelation: 'inbound_emails';
            referencedColumns: ['id'];
          },
        ];
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
      reminders: {
        Row: {
          amount_cents: number;
          channel: string;
          created_at: string;
          creditor_id: string;
          debtor_id: string;
          group_id: string;
          id: string;
          outbound_message_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          channel: string;
          created_at?: string;
          creditor_id: string;
          debtor_id: string;
          group_id: string;
          id?: string;
          outbound_message_id?: string | null;
        };
        Update: {
          amount_cents?: number;
          channel?: string;
          created_at?: string;
          creditor_id?: string;
          debtor_id?: string;
          group_id?: string;
          id?: string;
          outbound_message_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'reminders_creditor_id_group_id_fkey';
            columns: ['creditor_id', 'group_id'];
            isOneToOne: false;
            referencedRelation: 'participants';
            referencedColumns: ['id', 'group_id'];
          },
          {
            foreignKeyName: 'reminders_debtor_id_group_id_fkey';
            columns: ['debtor_id', 'group_id'];
            isOneToOne: false;
            referencedRelation: 'participants';
            referencedColumns: ['id', 'group_id'];
          },
          {
            foreignKeyName: 'reminders_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reminders_outbound_message_id_fkey';
            columns: ['outbound_message_id'];
            isOneToOne: false;
            referencedRelation: 'outbound_messages';
            referencedColumns: ['id'];
          },
        ];
      };
      share_categories: {
        Row: {
          category_id: string;
          expense_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          category_id: string;
          expense_id: string;
          user_id?: string;
        };
        Update: {
          category_id?: string;
          expense_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'share_categories_category_id_user_id_fkey';
            columns: ['category_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'share_categories_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
        ];
      };
      share_links: {
        Row: {
          created_at: string;
          id: string;
          participant_id: string;
          requested_by: string;
          revoked_at: string | null;
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          participant_id: string;
          requested_by: string;
          revoked_at?: string | null;
          token_hash: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          participant_id?: string;
          requested_by?: string;
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
          {
            foreignKeyName: 'share_links_requested_by_fkey';
            columns: ['requested_by'];
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
          is_sign_in: boolean;
          user_id: string;
          verified_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          email: string;
          is_sign_in?: boolean;
          user_id: string;
          verified_at?: string | null;
        };
        Update: {
          email?: string;
          is_sign_in?: boolean;
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
      active_share_links: { Args: { p_participant_id: string }; Returns: number };
      add_person: {
        Args: {
          p_display_name: string;
          p_group_id: string;
          p_invite_user_id?: string;
          p_phone?: string;
        };
        Returns: string;
      };
      attach_receipt: { Args: { p_expense_id: string; p_path: string }; Returns: undefined };
      balances: {
        Args: Record<PropertyKey, never>;
        Returns: {
          amount_cents: number;
          from_participant: string;
          group_id: string;
          to_participant: string;
        }[];
      };
      cancel_invite: { Args: { p_invite_id: string }; Returns: undefined };
      claim_notice: { Args: { p_payment_id: string; p_user_id: string }; Returns: Json };
      claim_payment: {
        Args: { p_amount_cents: number; p_group_id: string; p_method?: string; p_to: string };
        Returns: string;
      };
      close_draft: { Args: { p_draft_id: string; p_used: boolean }; Returns: undefined };
      create_group: {
        Args: { p_name: string; p_one_off?: boolean; p_people?: Json };
        Returns: string;
      };
      create_share_link: { Args: { p_participant_id: string }; Returns: string };
      decide_payment: { Args: { p_accept: boolean; p_payment_id: string }; Returns: undefined };
      dismiss_forwarding_code: { Args: { p_id: string }; Returns: undefined };
      due_reminders: {
        Args: { p_now?: string };
        Returns: {
          amount_cents: number;
          channel: string;
          creditor_id: string;
          creditor_name: string;
          creditor_user_id: string;
          debtor_id: string;
          debtor_name: string;
          debtor_user_id: string;
          group_id: string;
          group_name: string;
          oldest_unpaid_at: string;
          phone: string;
          time_zone: string;
        }[];
      };
      email_code_create: { Args: { p_email: string; p_user_id: string }; Returns: string };
      find_user: {
        Args: { p_username: string };
        Returns: {
          display_name: string;
          user_id: string;
          username: string;
        }[];
      };
      forgive_debt: {
        Args: { p_amount_cents: number; p_debtor: string; p_group_id: string };
        Returns: undefined;
      };
      get_my_shares: {
        Args: Record<PropertyKey, never>;
        Returns: {
          amount_cents: number;
          category_id: string;
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
      hit_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number };
        Returns: boolean;
      };
      inbound_find_user: { Args: { p_addresses: string[] }; Returns: string };
      inbound_is_duplicate: {
        Args: { p_date?: string; p_merchant: string; p_total_cents: number; p_user_id: string };
        Returns: boolean;
      };
      invite_to_group: { Args: { p_participant_id: string; p_user_id: string }; Returns: string };
      link_claim: {
        Args: { p_amount_cents: number; p_method?: string; p_token_hash: string };
        Returns: Json;
      };
      link_flag: { Args: { p_message: string; p_token_hash: string }; Returns: Json };
      link_share: { Args: { p_token_hash: string }; Returns: Json };
      link_text_opt_in: {
        Args: { p_opt_in: boolean; p_phone: string; p_token_hash: string };
        Returns: boolean;
      };
      my_category_for: { Args: { p_expense_id: string }; Returns: string };
      my_invites: {
        Args: Record<PropertyKey, never>;
        Returns: {
          added_as: string;
          created_at: string;
          group_id: string;
          group_name: string;
          invite_id: string;
          invited_by_name: string;
          invited_by_username: string;
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
      my_spending_items: {
        Args: { p_month: string };
        Returns: {
          amount_cents: number;
          category_id: string;
          expense_date: string;
          expense_id: string;
          group_id: string;
          is_forgiveness: boolean;
          item_id: string;
          merchant: string;
          paid_by_name: string;
          total_cents: number;
          you_paid: boolean;
        }[];
      };
      push_tokens_for: { Args: { p_user_id: string }; Returns: string[] };
      receipt_scans_this_month: { Args: { p_user_id: string }; Returns: number };
      record_payment: {
        Args: {
          p_amount_cents: number;
          p_from: string;
          p_group_id: string;
          p_method?: string;
          p_to: string;
        };
        Returns: string;
      };
      register_push_token: { Args: { p_token: string }; Returns: undefined };
      remove_email: { Args: { p_email: string }; Returns: undefined };
      resolve_problem: { Args: { p_report_id: string }; Returns: undefined };
      respond_to_invite: { Args: { p_accept: boolean; p_invite_id: string }; Returns: string };
      revoke_share_links: { Args: { p_participant_id: string }; Returns: number };
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
      set_budget: {
        Args: { p_amount_cents?: number; p_category_id: string; p_month: string };
        Returns: undefined;
      };
      set_share_category: {
        Args: { p_category_id?: string; p_expense_id: string };
        Returns: undefined;
      };
      set_time_zone: { Args: { p_time_zone: string }; Returns: undefined };
      unattached_receipts: { Args: { p_older_than: string }; Returns: string[] };
      username_available: { Args: { p_username: string }; Returns: boolean };
      verify_email: { Args: { p_code: string; p_email: string }; Returns: undefined };
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
