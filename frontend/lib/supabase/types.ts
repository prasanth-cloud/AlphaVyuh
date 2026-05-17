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
      bhavcopy_ingestion_log: {
        Row: {
          error_message: string | null
          ingested_at: string | null
          rows_ingested: number | null
          status: string
          trade_date: string
        }
        Insert: {
          error_message?: string | null
          ingested_at?: string | null
          rows_ingested?: number | null
          status: string
          trade_date: string
        }
        Update: {
          error_message?: string | null
          ingested_at?: string | null
          rows_ingested?: number | null
          status?: string
          trade_date?: string
        }
        Relationships: []
      }
      broker_credential_audit: {
        Row: {
          action: string
          actor: string | null
          broker: string
          created_at: string
          id: number
          key_name: string
          user_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          broker: string
          created_at?: string
          id?: number
          key_name: string
          user_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          broker?: string
          created_at?: string
          id?: number
          key_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_credential_audit_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_credentials: {
        Row: {
          broker: string
          created_at: string
          id: string
          key_name: string
          key_value: string
          key_version: number
          updated_at: string
          user_id: string
        }
        Insert: {
          broker: string
          created_at?: string
          id?: string
          key_name: string
          key_value: string
          key_version?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          broker?: string
          created_at?: string
          id?: string
          key_name?: string
          key_value?: string
          key_version?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_layouts: {
        Row: {
          created_at: string | null
          drawing_tools: Json
          id: string
          indicators: Json
          symbol: string
          timeframe: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          drawing_tools?: Json
          id?: string
          indicators?: Json
          symbol: string
          timeframe?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          drawing_tools?: Json
          id?: string
          indicators?: Json
          symbol?: string
          timeframe?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_layouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      corporate_actions: {
        Row: {
          action_date: string
          action_type: string
          created_at: string | null
          details: string | null
          id: string
          ratio: number | null
          symbol: string
        }
        Insert: {
          action_date: string
          action_type: string
          created_at?: string | null
          details?: string | null
          id?: string
          ratio?: number | null
          symbol: string
        }
        Update: {
          action_date?: string
          action_type?: string
          created_at?: string | null
          details?: string | null
          id?: string
          ratio?: number | null
          symbol?: string
        }
        Relationships: []
      }
      daily_ohlcv: {
        Row: {
          adx_14: number | null
          atr_14: number | null
          avg_volume_20d: number | null
          bb_lower: number | null
          bb_middle: number | null
          bb_upper: number | null
          bb_width: number | null
          cci_20: number | null
          close: number
          delivery_pct: number | null
          ema_10: number | null
          ema_20: number | null
          ema_200: number | null
          ema_50: number | null
          gap_pct: number | null
          high: number
          id: number
          is_inside_bar: boolean | null
          is_new_52w_high: boolean | null
          is_new_52w_low: boolean | null
          is_outside_bar: boolean | null
          low: number
          macd_hist: number | null
          macd_line: number | null
          macd_signal: number | null
          market_cap_category: string | null
          obv: number | null
          open: number
          pct_change: number | null
          prev_close: number | null
          rs_score: number | null
          rsi_14: number | null
          sma_150: number | null
          sma_20: number | null
          sma_200: number | null
          sma_50: number | null
          stoch_d: number | null
          stoch_k: number | null
          symbol: string | null
          trade_date: string
          turnover: number | null
          volume: number
          volume_ratio: number | null
          vwap: number | null
          w52h_pct: number | null
          w52l_pct: number | null
          week_52_high: number | null
          week_52_low: number | null
          williams_r: number | null
        }
        Insert: {
          adx_14?: number | null
          atr_14?: number | null
          avg_volume_20d?: number | null
          bb_lower?: number | null
          bb_middle?: number | null
          bb_upper?: number | null
          bb_width?: number | null
          cci_20?: number | null
          close: number
          delivery_pct?: number | null
          ema_10?: number | null
          ema_20?: number | null
          ema_200?: number | null
          ema_50?: number | null
          gap_pct?: number | null
          high: number
          id?: number
          is_inside_bar?: boolean | null
          is_new_52w_high?: boolean | null
          is_new_52w_low?: boolean | null
          is_outside_bar?: boolean | null
          low: number
          macd_hist?: number | null
          macd_line?: number | null
          macd_signal?: number | null
          market_cap_category?: string | null
          obv?: number | null
          open: number
          pct_change?: number | null
          prev_close?: number | null
          rs_score?: number | null
          rsi_14?: number | null
          sma_150?: number | null
          sma_20?: number | null
          sma_200?: number | null
          sma_50?: number | null
          stoch_d?: number | null
          stoch_k?: number | null
          symbol?: string | null
          trade_date: string
          turnover?: number | null
          volume: number
          volume_ratio?: number | null
          vwap?: number | null
          w52h_pct?: number | null
          w52l_pct?: number | null
          week_52_high?: number | null
          week_52_low?: number | null
          williams_r?: number | null
        }
        Update: {
          adx_14?: number | null
          atr_14?: number | null
          avg_volume_20d?: number | null
          bb_lower?: number | null
          bb_middle?: number | null
          bb_upper?: number | null
          bb_width?: number | null
          cci_20?: number | null
          close?: number
          delivery_pct?: number | null
          ema_10?: number | null
          ema_20?: number | null
          ema_200?: number | null
          ema_50?: number | null
          gap_pct?: number | null
          high?: number
          id?: number
          is_inside_bar?: boolean | null
          is_new_52w_high?: boolean | null
          is_new_52w_low?: boolean | null
          is_outside_bar?: boolean | null
          low?: number
          macd_hist?: number | null
          macd_line?: number | null
          macd_signal?: number | null
          market_cap_category?: string | null
          obv?: number | null
          open?: number
          pct_change?: number | null
          prev_close?: number | null
          rs_score?: number | null
          rsi_14?: number | null
          sma_150?: number | null
          sma_20?: number | null
          sma_200?: number | null
          sma_50?: number | null
          stoch_d?: number | null
          stoch_k?: number | null
          symbol?: string | null
          trade_date?: string
          turnover?: number | null
          volume?: number
          volume_ratio?: number | null
          vwap?: number | null
          w52h_pct?: number | null
          w52l_pct?: number | null
          week_52_high?: number | null
          week_52_low?: number | null
          williams_r?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_ohlcv_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "stock_universe"
            referencedColumns: ["symbol"]
          },
          {
            foreignKeyName: "fk_daily_ohlcv_symbol"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "stock_universe"
            referencedColumns: ["symbol"]
          },
        ]
      }
      drawings: {
        Row: {
          created_at: string | null
          id: string
          points: Json
          style: Json
          symbol: string
          timeframe: string
          tool_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          points: Json
          style?: Json
          symbol: string
          timeframe?: string
          tool_type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          points?: Json
          style?: Json
          symbol?: string
          timeframe?: string
          tool_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_runs: {
        Row: {
          created_at: string | null
          duration_s: number | null
          error_count: number | null
          errors: Json | null
          event_count: number | null
          id: string
          meta: Json | null
          run_id: string | null
          started_at: string
        }
        Insert: {
          created_at?: string | null
          duration_s?: number | null
          error_count?: number | null
          errors?: Json | null
          event_count?: number | null
          id?: string
          meta?: Json | null
          run_id?: string | null
          started_at: string
        }
        Update: {
          created_at?: string | null
          duration_s?: number | null
          error_count?: number | null
          errors?: Json | null
          event_count?: number | null
          id?: string
          meta?: Json | null
          run_id?: string | null
          started_at?: string
        }
        Relationships: []
      }
      order_idempotency: {
        Row: {
          broker_id: string
          broker_order_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          result: Json | null
          user_id: string
        }
        Insert: {
          broker_id: string
          broker_order_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          result?: Json | null
          user_id: string
        }
        Update: {
          broker_id?: string
          broker_order_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          result?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_idempotency_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_logs: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          plan: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          plan: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          plan?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      price_alerts: {
        Row: {
          condition: string
          created_at: string
          id: string
          is_active: boolean
          note: string | null
          symbol: string
          target_price: number
          triggered_at: string | null
          user_id: string
        }
        Insert: {
          condition: string
          created_at?: string
          id?: string
          is_active?: boolean
          note?: string | null
          symbol: string
          target_price: number
          triggered_at?: string | null
          user_id: string
        }
        Update: {
          condition?: string
          created_at?: string
          id?: string
          is_active?: boolean
          note?: string | null
          symbol?: string
          target_price?: number
          triggered_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_rewards: {
        Row: {
          applied_at: string
          id: string
          referred_id: string
          referrer_id: string
          reward_days: number
          reward_type: string
        }
        Insert: {
          applied_at?: string
          id?: string
          referred_id: string
          referrer_id: string
          reward_days?: number
          reward_type?: string
        }
        Update: {
          applied_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
          reward_days?: number
          reward_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_rewards_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_rewards_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_screens: {
        Row: {
          created_at: string | null
          filters: Json
          id: string
          is_default: boolean | null
          last_run_at: string | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          filters?: Json
          id?: string
          is_default?: boolean | null
          last_run_at?: string | null
          name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          filters?: Json
          id?: string
          is_default?: boolean | null
          last_run_at?: string | null
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_screens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_alert_matches: {
        Row: {
          alert_id: string
          created_at: string
          id: string
          match_count: number
          error_message: string | null
          run_date: string
          run_status: string
          symbols: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          match_count?: number
          run_date: string
          run_status?: string
          symbols?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          match_count?: number
          run_date?: string
          run_status?: string
          symbols?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_alert_matches_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "scan_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_alerts: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_active: boolean
          last_error: string | null
          last_match_count: number | null
          last_run_at: string | null
          last_run_status: string
          name: string
          sort_by: string
          sort_order: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_match_count?: number | null
          last_run_at?: string | null
          last_run_status?: string
          name: string
          sort_by?: string
          sort_order?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_match_count?: number | null
          last_run_at?: string | null
          last_run_status?: string
          name?: string
          sort_by?: string
          sort_order?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      screen_upvotes: {
        Row: {
          screen_id: string
          user_id: string
        }
        Insert: {
          screen_id: string
          user_id: string
        }
        Update: {
          screen_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "screen_upvotes_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "shared_screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screen_upvotes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_screens: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_featured: boolean
          screen_id: string
          tags: string[] | null
          title: string
          updated_at: string
          upvotes: number
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          screen_id: string
          tags?: string[] | null
          title: string
          updated_at?: string
          upvotes?: number
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          screen_id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          upvotes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_screens_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "saved_screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_screens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_universe: {
        Row: {
          book_value: number | null
          company_name: string
          currency: string
          debt_to_equity: number | null
          dividend_yield: number | null
          eps: number | null
          face_value: number | null
          fundamentals_updated_at: string | null
          is_active: boolean | null
          isin: string | null
          market: string
          market_cap_cr: number | null
          net_profit_cr: number | null
          pb_ratio: number | null
          pe_ratio: number | null
          revenue_cr: number | null
          roce: number | null
          roe: number | null
          sector: string | null
          series: string
          symbol: string
          updated_at: string | null
        }
        Insert: {
          book_value?: number | null
          company_name: string
          currency?: string
          debt_to_equity?: number | null
          dividend_yield?: number | null
          eps?: number | null
          face_value?: number | null
          fundamentals_updated_at?: string | null
          is_active?: boolean | null
          isin?: string | null
          market?: string
          market_cap_cr?: number | null
          net_profit_cr?: number | null
          pb_ratio?: number | null
          pe_ratio?: number | null
          revenue_cr?: number | null
          roce?: number | null
          roe?: number | null
          sector?: string | null
          series: string
          symbol: string
          updated_at?: string | null
        }
        Update: {
          book_value?: number | null
          company_name?: string
          currency?: string
          debt_to_equity?: number | null
          dividend_yield?: number | null
          eps?: number | null
          face_value?: number | null
          fundamentals_updated_at?: string | null
          is_active?: boolean | null
          isin?: string | null
          market?: string
          market_cap_cr?: number | null
          net_profit_cr?: number | null
          pb_ratio?: number | null
          pe_ratio?: number | null
          revenue_cr?: number | null
          roce?: number | null
          roe?: number | null
          sector?: string | null
          series?: string
          symbol?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: string
          razorpay_order_id: string | null
          razorpay_sub_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id: string
          plan: string
          razorpay_order_id?: string | null
          razorpay_sub_id?: string | null
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          razorpay_order_id?: string | null
          razorpay_sub_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_journal: {
        Row: {
          company_name: string | null
          created_at: string | null
          entry_date: string
          entry_price: number
          entry_reason: string | null
          exit_date: string | null
          exit_price: number | null
          exit_reason: string | null
          holding_days: number | null
          id: string
          lessons: string | null
          mistakes: string | null
          pnl: number | null
          pnl_pct: number | null
          quantity: number
          risk_reward: number | null
          setup_type: string | null
          status: string
          stop_loss: number | null
          symbol: string
          target_price: number | null
          trade_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          entry_date: string
          entry_price: number
          entry_reason?: string | null
          exit_date?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          holding_days?: number | null
          id?: string
          lessons?: string | null
          mistakes?: string | null
          pnl?: number | null
          pnl_pct?: number | null
          quantity: number
          risk_reward?: number | null
          setup_type?: string | null
          status?: string
          stop_loss?: number | null
          symbol: string
          target_price?: number | null
          trade_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          entry_date?: string
          entry_price?: number
          entry_reason?: string | null
          exit_date?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          holding_days?: number | null
          id?: string
          lessons?: string | null
          mistakes?: string | null
          pnl?: number | null
          pnl_pct?: number | null
          quantity?: number
          risk_reward?: number | null
          setup_type?: string | null
          status?: string
          stop_loss?: number | null
          symbol?: string
          target_price?: number | null
          trade_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_journal_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          billing_currency: string
          billing_period: string
          billing_region: string
          broker_access_token: string | null
          broker_api_key: string | null
          broker_api_secret: string | null
          broker_connected_at: string | null
          broker_token_expires_at: string | null
          broker_type: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          onboarding_completed: boolean | null
          plan: string
          plan_expires_at: string | null
          referral_code: string | null
          referred_by: string | null
          telegram_chat_id: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          billing_currency?: string
          billing_period?: string
          billing_region?: string
          broker_access_token?: string | null
          broker_api_key?: string | null
          broker_api_secret?: string | null
          broker_connected_at?: string | null
          broker_token_expires_at?: string | null
          broker_type?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          onboarding_completed?: boolean | null
          plan?: string
          plan_expires_at?: string | null
          referral_code?: string | null
          referred_by?: string | null
          telegram_chat_id?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          billing_currency?: string
          billing_period?: string
          billing_region?: string
          broker_access_token?: string | null
          broker_api_key?: string | null
          broker_api_secret?: string | null
          broker_connected_at?: string | null
          broker_token_expires_at?: string | null
          broker_type?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean | null
          plan?: string
          plan_expires_at?: string | null
          referral_code?: string | null
          referred_by?: string | null
          telegram_chat_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string | null
          email: string
          id: string
          source: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          source?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          source?: string | null
        }
        Relationships: []
      }
      watchlist_items: {
        Row: {
          added_at: string | null
          id: string
          sort_order: number | null
          symbol: string
          watchlist_id: string
        }
        Insert: {
          added_at?: string | null
          id?: string
          sort_order?: number | null
          symbol: string
          watchlist_id: string
        }
        Update: {
          added_at?: string | null
          id?: string
          sort_order?: number | null
          symbol?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_items_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "stock_universe"
            referencedColumns: ["symbol"]
          },
          {
            foreignKeyName: "watchlist_items_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      data_health: {
        Row: {
          hours_since_last_run: number | null
          last_run_errors: number | null
          last_run_id: string | null
          latest_trade_date: string | null
          null_ema200_latest: number | null
          null_rsi_latest: number | null
          symbols_latest: number | null
          total_rows: number | null
          universe_active: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      delete_broker_credentials: {
        Args: { p_broker: string; p_user_id: string }
        Returns: undefined
      }
      get_encrypted_credential: {
        Args: { p_broker: string; p_key_name: string; p_user_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
