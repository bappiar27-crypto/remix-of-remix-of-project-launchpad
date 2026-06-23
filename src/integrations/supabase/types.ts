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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ad_accounts: {
        Row: {
          account_name: string | null
          account_status: number | null
          active_campaigns: number | null
          business_name: string | null
          client_id: string
          connection_id: string | null
          created_at: string
          currency: string | null
          fb_account_id: string
          id: string
          is_active: boolean
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: Database["public"]["Enums"]["sync_status"] | null
          timezone_name: string | null
          total_clicks: number | null
          total_impressions: number | null
          total_reach: number | null
          total_results: number | null
          total_spend: number | null
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_status?: number | null
          active_campaigns?: number | null
          business_name?: string | null
          client_id: string
          connection_id?: string | null
          created_at?: string
          currency?: string | null
          fb_account_id: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: Database["public"]["Enums"]["sync_status"] | null
          timezone_name?: string | null
          total_clicks?: number | null
          total_impressions?: number | null
          total_reach?: number | null
          total_results?: number | null
          total_spend?: number | null
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_status?: number | null
          active_campaigns?: number | null
          business_name?: string | null
          client_id?: string
          connection_id?: string | null
          created_at?: string
          currency?: string | null
          fb_account_id?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: Database["public"]["Enums"]["sync_status"] | null
          timezone_name?: string | null
          total_clicks?: number | null
          total_impressions?: number | null
          total_reach?: number | null
          total_results?: number | null
          total_spend?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "meta_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_sets: {
        Row: {
          ad_account_id: string
          bid_amount: number | null
          billing_event: string | null
          campaign_id: string
          clicks: number | null
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          daily_budget: number | null
          effective_status: Database["public"]["Enums"]["entity_status"] | null
          end_time: string | null
          fb_adset_id: string
          frequency: number | null
          id: string
          impressions: number | null
          last_sync_at: string | null
          lifetime_budget: number | null
          name: string
          optimization_goal: string | null
          reach: number | null
          results: number | null
          spend: number | null
          start_time: string | null
          status: Database["public"]["Enums"]["entity_status"] | null
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          bid_amount?: number | null
          billing_event?: string | null
          campaign_id: string
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          daily_budget?: number | null
          effective_status?: Database["public"]["Enums"]["entity_status"] | null
          end_time?: string | null
          fb_adset_id: string
          frequency?: number | null
          id?: string
          impressions?: number | null
          last_sync_at?: string | null
          lifetime_budget?: number | null
          name: string
          optimization_goal?: string | null
          reach?: number | null
          results?: number | null
          spend?: number | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["entity_status"] | null
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          bid_amount?: number | null
          billing_event?: string | null
          campaign_id?: string
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          daily_budget?: number | null
          effective_status?: Database["public"]["Enums"]["entity_status"] | null
          end_time?: string | null
          fb_adset_id?: string
          frequency?: number | null
          id?: string
          impressions?: number | null
          last_sync_at?: string | null
          lifetime_budget?: number | null
          name?: string
          optimization_goal?: string | null
          reach?: number | null
          results?: number | null
          spend?: number | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["entity_status"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_sets_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_sets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ads: {
        Row: {
          ad_account_id: string
          ad_set_id: string
          campaign_id: string
          clicks: number | null
          cpc: number | null
          cpm: number | null
          created_at: string
          creative_id: string | null
          creative_thumbnail: string | null
          ctr: number | null
          effective_status: Database["public"]["Enums"]["entity_status"] | null
          fb_ad_id: string
          frequency: number | null
          id: string
          impressions: number | null
          last_sync_at: string | null
          name: string
          preview_link: string | null
          reach: number | null
          results: number | null
          spend: number | null
          status: Database["public"]["Enums"]["entity_status"] | null
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          ad_set_id: string
          campaign_id: string
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          creative_id?: string | null
          creative_thumbnail?: string | null
          ctr?: number | null
          effective_status?: Database["public"]["Enums"]["entity_status"] | null
          fb_ad_id: string
          frequency?: number | null
          id?: string
          impressions?: number | null
          last_sync_at?: string | null
          name: string
          preview_link?: string | null
          reach?: number | null
          results?: number | null
          spend?: number | null
          status?: Database["public"]["Enums"]["entity_status"] | null
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          ad_set_id?: string
          campaign_id?: string
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          creative_id?: string | null
          creative_thumbnail?: string | null
          ctr?: number | null
          effective_status?: Database["public"]["Enums"]["entity_status"] | null
          fb_ad_id?: string
          frequency?: number | null
          id?: string
          impressions?: number | null
          last_sync_at?: string | null
          name?: string
          preview_link?: string | null
          reach?: number | null
          results?: number | null
          spend?: number | null
          status?: Database["public"]["Enums"]["entity_status"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_ad_set_id_fkey"
            columns: ["ad_set_id"]
            isOneToOne: false
            referencedRelation: "ad_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          ad_account_id: string | null
          client_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          metadata: Json | null
          severity: Database["public"]["Enums"]["alert_severity"]
          title: string
          type: string
        }
        Insert: {
          ad_account_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          title: string
          type: string
        }
        Update: {
          ad_account_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          auto_sync_enabled: boolean
          brand_logo_url: string | null
          brand_primary_color: string | null
          brand_secondary_color: string | null
          fb_app_id: string | null
          fb_app_secret: string | null
          fb_business_id: string | null
          fb_system_user_token: string | null
          fb_verify_token: string | null
          id: number
          org_address: string | null
          org_email: string | null
          org_name: string | null
          org_phone: string | null
          pref_attribution_window: string | null
          pref_currency: string | null
          pref_language: string | null
          pref_timezone: string | null
          sync_interval_minutes: number
          token_checked_at: string | null
          token_error: string | null
          token_expires_at: string | null
          token_missing_scopes: string[] | null
          token_scopes: string[] | null
          token_status: string | null
          token_user_name: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_sync_enabled?: boolean
          brand_logo_url?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          fb_app_id?: string | null
          fb_app_secret?: string | null
          fb_business_id?: string | null
          fb_system_user_token?: string | null
          fb_verify_token?: string | null
          id?: number
          org_address?: string | null
          org_email?: string | null
          org_name?: string | null
          org_phone?: string | null
          pref_attribution_window?: string | null
          pref_currency?: string | null
          pref_language?: string | null
          pref_timezone?: string | null
          sync_interval_minutes?: number
          token_checked_at?: string | null
          token_error?: string | null
          token_expires_at?: string | null
          token_missing_scopes?: string[] | null
          token_scopes?: string[] | null
          token_status?: string | null
          token_user_name?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_sync_enabled?: boolean
          brand_logo_url?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          fb_app_id?: string | null
          fb_app_secret?: string | null
          fb_business_id?: string | null
          fb_system_user_token?: string | null
          fb_verify_token?: string | null
          id?: number
          org_address?: string | null
          org_email?: string | null
          org_name?: string | null
          org_phone?: string | null
          pref_attribution_window?: string | null
          pref_currency?: string | null
          pref_language?: string | null
          pref_timezone?: string | null
          sync_interval_minutes?: number
          token_checked_at?: string | null
          token_error?: string | null
          token_expires_at?: string | null
          token_missing_scopes?: string[] | null
          token_scopes?: string[] | null
          token_status?: string | null
          token_user_name?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          ad_account_id: string
          buying_type: string | null
          clicks: number | null
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          daily_budget: number | null
          effective_status: Database["public"]["Enums"]["entity_status"] | null
          fb_campaign_id: string
          frequency: number | null
          id: string
          impressions: number | null
          last_sync_at: string | null
          lifetime_budget: number | null
          name: string
          objective: string | null
          reach: number | null
          results: number | null
          spend: number | null
          start_time: string | null
          status: Database["public"]["Enums"]["entity_status"] | null
          stop_time: string | null
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          buying_type?: string | null
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          daily_budget?: number | null
          effective_status?: Database["public"]["Enums"]["entity_status"] | null
          fb_campaign_id: string
          frequency?: number | null
          id?: string
          impressions?: number | null
          last_sync_at?: string | null
          lifetime_budget?: number | null
          name: string
          objective?: string | null
          reach?: number | null
          results?: number | null
          spend?: number | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["entity_status"] | null
          stop_time?: string | null
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          buying_type?: string | null
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          daily_budget?: number | null
          effective_status?: Database["public"]["Enums"]["entity_status"] | null
          fb_campaign_id?: string
          frequency?: number | null
          id?: string
          impressions?: number | null
          last_sync_at?: string | null
          lifetime_budget?: number | null
          name?: string
          objective?: string | null
          reach?: number | null
          results?: number | null
          spend?: number | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["entity_status"] | null
          stop_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_campaigns: {
        Row: {
          campaign_id: string
          client_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          client_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          client_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_campaigns_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          bdt_rate: number | null
          brand_color: string | null
          client_code: string
          commission_enabled: boolean
          commission_notes: string | null
          commission_percent: number
          company: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          deposit_amount: number
          deposit_currency: string
          id: string
          logo_url: string | null
          monthly_budget: number | null
          name: string
          notes: string | null
          portal_password: string | null
          portal_token: string | null
          slug: string
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          bdt_rate?: number | null
          brand_color?: string | null
          client_code?: string
          commission_enabled?: boolean
          commission_notes?: string | null
          commission_percent?: number
          company?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount?: number
          deposit_currency?: string
          id?: string
          logo_url?: string | null
          monthly_budget?: number | null
          name: string
          notes?: string | null
          portal_password?: string | null
          portal_token?: string | null
          slug: string
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          bdt_rate?: number | null
          brand_color?: string | null
          client_code?: string
          commission_enabled?: boolean
          commission_notes?: string | null
          commission_percent?: number
          company?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount?: number
          deposit_currency?: string
          id?: string
          logo_url?: string | null
          monthly_budget?: number | null
          name?: string
          notes?: string | null
          portal_password?: string | null
          portal_token?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      insights_snapshots: {
        Row: {
          ad_account_id: string
          captured_at: string
          clicks: number | null
          cpc: number | null
          cpm: number | null
          ctr: number | null
          date_start: string
          date_stop: string
          entity_id: string
          frequency: number | null
          id: string
          impressions: number | null
          level: Database["public"]["Enums"]["insight_level"]
          raw: Json | null
          reach: number | null
          results: number | null
          spend: number | null
        }
        Insert: {
          ad_account_id: string
          captured_at?: string
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          date_start: string
          date_stop: string
          entity_id: string
          frequency?: number | null
          id?: string
          impressions?: number | null
          level: Database["public"]["Enums"]["insight_level"]
          raw?: Json | null
          reach?: number | null
          results?: number | null
          spend?: number | null
        }
        Update: {
          ad_account_id?: string
          captured_at?: string
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          date_start?: string
          date_stop?: string
          entity_id?: string
          frequency?: number | null
          id?: string
          impressions?: number | null
          level?: Database["public"]["Enums"]["insight_level"]
          raw?: Json | null
          reach?: number | null
          results?: number | null
          spend?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "insights_snapshots_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_connections: {
        Row: {
          created_at: string
          created_by: string | null
          fb_app_id: string | null
          fb_app_secret: string | null
          fb_business_id: string | null
          fb_system_user_token: string | null
          id: string
          is_active: boolean
          label: string
          token_checked_at: string | null
          token_error: string | null
          token_expires_at: string | null
          token_missing_scopes: string[] | null
          token_scopes: string[] | null
          token_status: string | null
          token_user_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fb_app_id?: string | null
          fb_app_secret?: string | null
          fb_business_id?: string | null
          fb_system_user_token?: string | null
          id?: string
          is_active?: boolean
          label: string
          token_checked_at?: string | null
          token_error?: string | null
          token_expires_at?: string | null
          token_missing_scopes?: string[] | null
          token_scopes?: string[] | null
          token_status?: string | null
          token_user_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fb_app_id?: string | null
          fb_app_secret?: string | null
          fb_business_id?: string | null
          fb_system_user_token?: string | null
          id?: string
          is_active?: boolean
          label?: string
          token_checked_at?: string | null
          token_error?: string | null
          token_expires_at?: string | null
          token_missing_scopes?: string[] | null
          token_scopes?: string[] | null
          token_status?: string | null
          token_user_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      meta_webhook_events: {
        Row: {
          ad_account_id: string | null
          error: string | null
          fb_account_id: string | null
          field: string | null
          id: string
          object: string | null
          payload: Json
          processed: boolean
          received_at: string
          signature_valid: boolean
        }
        Insert: {
          ad_account_id?: string | null
          error?: string | null
          fb_account_id?: string | null
          field?: string | null
          id?: string
          object?: string | null
          payload: Json
          processed?: boolean
          received_at?: string
          signature_valid?: boolean
        }
        Update: {
          ad_account_id?: string | null
          error?: string | null
          fb_account_id?: string | null
          field?: string | null
          id?: string
          object?: string | null
          payload?: Json
          processed?: boolean
          received_at?: string
          signature_valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "meta_webhook_events_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          ad_account_id: string | null
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          items_synced: number | null
          started_at: string
          status: Database["public"]["Enums"]["sync_status"]
        }
        Insert: {
          ad_account_id?: string | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          items_synced?: number | null
          started_at?: string
          status: Database["public"]["Enums"]["sync_status"]
        }
        Update: {
          ad_account_id?: string | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          items_synced?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
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
      [_ in never]: never
    }
    Functions: {
      admin_clear_all_data: { Args: { _user_id: string }; Returns: Json }
      generate_client_code: { Args: never; Returns: string }
      get_meta_connections_public: {
        Args: never
        Returns: {
          account_count: number
          created_at: string
          fb_app_id: string
          fb_business_id: string
          has_app_secret: boolean
          has_token: boolean
          id: string
          is_active: boolean
          label: string
          token_checked_at: string
          token_error: string
          token_expires_at: string
          token_missing_scopes: string[]
          token_scopes: string[]
          token_status: string
          token_user_name: string
          updated_at: string
        }[]
      }
      get_settings_public: {
        Args: never
        Returns: {
          auto_sync_enabled: boolean
          brand_logo_url: string
          brand_primary_color: string
          brand_secondary_color: string
          fb_app_id: string
          fb_business_id: string
          has_app_secret: boolean
          has_token: boolean
          has_verify_token: boolean
          org_address: string
          org_email: string
          org_name: string
          org_phone: string
          pref_attribution_window: string
          pref_currency: string
          pref_language: string
          pref_timezone: string
          sync_interval_minutes: number
          token_checked_at: string
          token_error: string
          token_expires_at: string
          token_missing_scopes: string[]
          token_scopes: string[]
          token_status: string
          token_user_name: string
          updated_at: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      alert_severity: "info" | "warning" | "critical"
      app_role: "admin" | "member"
      client_status: "active" | "paused" | "archived"
      entity_status:
        | "ACTIVE"
        | "PAUSED"
        | "DELETED"
        | "ARCHIVED"
        | "PENDING_REVIEW"
        | "DISAPPROVED"
        | "PREAPPROVED"
        | "PENDING_BILLING_INFO"
        | "CAMPAIGN_PAUSED"
        | "ADSET_PAUSED"
        | "IN_PROCESS"
        | "WITH_ISSUES"
      insight_level: "account" | "campaign" | "adset" | "ad"
      sync_status: "running" | "success" | "failed"
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
      alert_severity: ["info", "warning", "critical"],
      app_role: ["admin", "member"],
      client_status: ["active", "paused", "archived"],
      entity_status: [
        "ACTIVE",
        "PAUSED",
        "DELETED",
        "ARCHIVED",
        "PENDING_REVIEW",
        "DISAPPROVED",
        "PREAPPROVED",
        "PENDING_BILLING_INFO",
        "CAMPAIGN_PAUSED",
        "ADSET_PAUSED",
        "IN_PROCESS",
        "WITH_ISSUES",
      ],
      insight_level: ["account", "campaign", "adset", "ad"],
      sync_status: ["running", "success", "failed"],
    },
  },
} as const
