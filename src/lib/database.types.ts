// src/lib/database.types.ts
//
// AUTO-GENERATED — do not edit by hand.
// Source: docs/supabase_lhportal_schema8.csv
// Regenerate: node scripts/gen-db-types.mjs
//
// Mirrors the shape of `supabase gen types typescript`. See
// scripts/gen-db-types.mjs for limitations and CLAUDE.md "DB types" for the
// CLI verification steps.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      actions: {
        Row: {
          id: string
          issue_id: string | null
          action_text: string
          name_text: string | null
          date_deadline: string | null
          status: string | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          updated_by: string | null
          source_activity_id: string | null
          meeting_id: string | null
        }
        Insert: {
          id?: string
          issue_id?: string | null
          action_text?: string
          name_text?: string | null
          date_deadline?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          source_activity_id?: string | null
          meeting_id?: string | null
        }
        Update: {
          id?: string
          issue_id?: string | null
          action_text?: string
          name_text?: string | null
          date_deadline?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          source_activity_id?: string | null
          meeting_id?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "actions_issue_id_fkey"
              columns: ["issue_id"]
              isOneToOne: false
              referencedRelation: "issues"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "actions_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "actions_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "actions_source_activity_id_fkey"
              columns: ["source_activity_id"]
              isOneToOne: false
              referencedRelation: "activities"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "actions_meeting_id_fkey"
              columns: ["meeting_id"]
              isOneToOne: false
              referencedRelation: "meetings"
              referencedColumns: ["id"]
            }
          ]
      }
      activities: {
        Row: {
          id: string
          issue_id: string | null
          body: string
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          updated_by: string | null
          historic: boolean | null
          meeting_id: string | null
          activity_type: string
          fields: Json | null
          sequence: number | null
        }
        Insert: {
          id?: string
          issue_id?: string | null
          body?: string
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          historic?: boolean | null
          meeting_id?: string | null
          activity_type?: string
          fields?: Json | null
          sequence?: number | null
        }
        Update: {
          id?: string
          issue_id?: string | null
          body?: string
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          historic?: boolean | null
          meeting_id?: string | null
          activity_type?: string
          fields?: Json | null
          sequence?: number | null
        }
        Relationships: [
            {
              foreignKeyName: "activities_issue_id_fkey"
              columns: ["issue_id"]
              isOneToOne: false
              referencedRelation: "issues"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "activities_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "activities_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "activities_meeting_id_fkey"
              columns: ["meeting_id"]
              isOneToOne: false
              referencedRelation: "meetings"
              referencedColumns: ["id"]
            }
          ]
      }
      app_permissions: {
        Row: {
          id: string
          user_id: string
          app_id: string
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          updated_by: string | null
          is_read_only: boolean | null
        }
        Insert: {
          id?: string
          user_id?: string
          app_id?: string
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          is_read_only?: boolean | null
        }
        Update: {
          id?: string
          user_id?: string
          app_id?: string
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          is_read_only?: boolean | null
        }
        Relationships: [
            {
              foreignKeyName: "app_permissions_user_id_fkey"
              columns: ["user_id"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "app_permissions_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "app_permissions_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      audit_logs: {
        Row: {
          id: string
          created_at: string
          user_id: string | null
          user_email: string
          user_ip_address: string | null
          user_agent: string | null
          event_type: string
          event_category: string
          event_action: string
          target_type: string | null
          target_id: string | null
          target_name: string | null
          changes: Json | null
          metadata: Json | null
          severity: string | null
          flagged: boolean | null
          app_id: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          user_id?: string | null
          user_email?: string
          user_ip_address?: string | null
          user_agent?: string | null
          event_type?: string
          event_category?: string
          event_action?: string
          target_type?: string | null
          target_id?: string | null
          target_name?: string | null
          changes?: Json | null
          metadata?: Json | null
          severity?: string | null
          flagged?: boolean | null
          app_id?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          user_id?: string | null
          user_email?: string
          user_ip_address?: string | null
          user_agent?: string | null
          event_type?: string
          event_category?: string
          event_action?: string
          target_type?: string | null
          target_id?: string | null
          target_name?: string | null
          changes?: Json | null
          metadata?: Json | null
          severity?: string | null
          flagged?: boolean | null
          app_id?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "audit_logs_user_id_fkey"
              columns: ["user_id"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      building_systems: {
        Row: {
          id: string
          name: string
          uniclass_code: string | null
          description: string | null
          presentation_order: number
          visible: boolean
          notes: string | null
          created_at: string
          created_by: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          name?: string
          uniclass_code?: string | null
          description?: string | null
          presentation_order?: number
          visible?: boolean
          notes?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          name?: string
          uniclass_code?: string | null
          description?: string | null
          presentation_order?: number
          visible?: boolean
          notes?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "building_systems_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "building_systems_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      component_attributes: {
        Row: {
          id: string
          component_id: string
          type_attribute_id: string
          value: string | null
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          component_id?: string
          type_attribute_id?: string
          value?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          component_id?: string
          type_attribute_id?: string
          value?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "component_attributes_component_id_fkey"
              columns: ["component_id"]
              isOneToOne: false
              referencedRelation: "components"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "component_attributes_type_attribute_id_fkey"
              columns: ["type_attribute_id"]
              isOneToOne: false
              referencedRelation: "type_attributes"
              referencedColumns: ["id"]
            }
          ]
      }
      component_inspections: {
        Row: {
          id: string
          component_id: string
          inspection_result: string
          inspector_notes: string | null
          inspected_at: string
          inspected_by: string | null
          created_at: string
          checklist_results: Json | null
          walk_session_id: string | null
          no_access_reason: string | null
          readings: Json
        }
        Insert: {
          id?: string
          component_id?: string
          inspection_result?: string
          inspector_notes?: string | null
          inspected_at?: string
          inspected_by?: string | null
          created_at?: string
          checklist_results?: Json | null
          walk_session_id?: string | null
          no_access_reason?: string | null
          readings?: Json
        }
        Update: {
          id?: string
          component_id?: string
          inspection_result?: string
          inspector_notes?: string | null
          inspected_at?: string
          inspected_by?: string | null
          created_at?: string
          checklist_results?: Json | null
          walk_session_id?: string | null
          no_access_reason?: string | null
          readings?: Json
        }
        Relationships: [
            {
              foreignKeyName: "component_inspections_component_id_fkey"
              columns: ["component_id"]
              isOneToOne: false
              referencedRelation: "components"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "component_inspections_inspected_by_fkey"
              columns: ["inspected_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "component_inspections_walk_session_id_fkey"
              columns: ["walk_session_id"]
              isOneToOne: false
              referencedRelation: "walk_sessions"
              referencedColumns: ["id"]
            }
          ]
      }
      component_links: {
        Row: {
          id: string
          from_component_id: string
          to_component_ref: string
          link_type: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          from_component_id?: string
          to_component_ref?: string
          link_type?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          from_component_id?: string
          to_component_ref?: string
          link_type?: string | null
          created_at?: string
          created_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "component_links_from_component_id_fkey"
              columns: ["from_component_id"]
              isOneToOne: false
              referencedRelation: "components"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "component_links_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      component_presets: {
        Row: {
          id: string
          name: string
          config: Json
          created_by: string
          created_at: string | null
          updated_at: string | null
          sort_order: number | null
        }
        Insert: {
          id?: string
          name?: string
          config?: Json
          created_by?: string
          created_at?: string | null
          updated_at?: string | null
          sort_order?: number | null
        }
        Update: {
          id?: string
          name?: string
          config?: Json
          created_by?: string
          created_at?: string | null
          updated_at?: string | null
          sort_order?: number | null
        }
        Relationships: [
            {
              foreignKeyName: "component_presets_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "null"
              referencedColumns: ["null"]
            }
          ]
      }
      component_types: {
        Row: {
          id: string
          building_system_id: string
          code: string
          name: string
          description: string | null
          initial: string
          colour: string
          icon_params: Json | null
          marker_shape: string
          attribute_group: string | null
          inspection_panel: string
          default_attribute: string | null
          priority_base: string
          presentation_order: number
          visible: boolean
          notes: string | null
          created_at: string
          created_by: string | null
          updated_at: string | null
          updated_by: string | null
          marker_size: string
          highlight_attribute: string | null
          highlight_colour: string | null
        }
        Insert: {
          id?: string
          building_system_id?: string
          code?: string
          name?: string
          description?: string | null
          initial?: string
          colour?: string
          icon_params?: Json | null
          marker_shape?: string
          attribute_group?: string | null
          inspection_panel?: string
          default_attribute?: string | null
          priority_base?: string
          presentation_order?: number
          visible?: boolean
          notes?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
          marker_size?: string
          highlight_attribute?: string | null
          highlight_colour?: string | null
        }
        Update: {
          id?: string
          building_system_id?: string
          code?: string
          name?: string
          description?: string | null
          initial?: string
          colour?: string
          icon_params?: Json | null
          marker_shape?: string
          attribute_group?: string | null
          inspection_panel?: string
          default_attribute?: string | null
          priority_base?: string
          presentation_order?: number
          visible?: boolean
          notes?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
          marker_size?: string
          highlight_attribute?: string | null
          highlight_colour?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "component_types_building_system_id_fkey"
              columns: ["building_system_id"]
              isOneToOne: false
              referencedRelation: "building_systems"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "component_types_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "component_types_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      components: {
        Row: {
          id: string
          plan_id: string | null
          type_code: string
          primary_attribute: string | null
          label: string | null
          asset_id: string | null
          x_position: number
          y_position: number
          status: string
          notes: string | null
          created_at: string
          created_by: string | null
          updated_at: string | null
          updated_by: string | null
          last_inspection_id: string | null
          status_set_by: string | null
          status_set_at: string | null
          linked_component_ref: string | null
          floor_id: string | null
          inspection_sort_order: number | null
        }
        Insert: {
          id?: string
          plan_id?: string | null
          type_code?: string
          primary_attribute?: string | null
          label?: string | null
          asset_id?: string | null
          x_position?: number
          y_position?: number
          status?: string
          notes?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
          last_inspection_id?: string | null
          status_set_by?: string | null
          status_set_at?: string | null
          linked_component_ref?: string | null
          floor_id?: string | null
          inspection_sort_order?: number | null
        }
        Update: {
          id?: string
          plan_id?: string | null
          type_code?: string
          primary_attribute?: string | null
          label?: string | null
          asset_id?: string | null
          x_position?: number
          y_position?: number
          status?: string
          notes?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
          last_inspection_id?: string | null
          status_set_by?: string | null
          status_set_at?: string | null
          linked_component_ref?: string | null
          floor_id?: string | null
          inspection_sort_order?: number | null
        }
        Relationships: [
            {
              foreignKeyName: "components_plan_id_fkey"
              columns: ["plan_id"]
              isOneToOne: false
              referencedRelation: "plans"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "components_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "components_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "components_status_set_by_fkey"
              columns: ["status_set_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "components_floor_id_fkey"
              columns: ["floor_id"]
              isOneToOne: false
              referencedRelation: "floors"
              referencedColumns: ["id"]
            }
          ]
      }
      document_library: {
        Row: {
          id: string
          provider: string
          provider_file_id: string
          provider_folder_id: string | null
          filename: string
          display_name: string | null
          mime_type: string | null
          file_size: number | null
          web_view_url: string | null
          thumbnail_url: string | null
          doc_type: string
          category: string | null
          entity_type: string | null
          entity_id: string | null
          title: string | null
          description: string | null
          document_date: string | null
          expiry_date: string | null
          reference_number: string | null
          issuer: string | null
          tags: string[]
          folder_path: string | null
          uploaded_by: string | null
          created_at: string
          updated_at: string | null
          updated_by: string | null
          file_checksum: string | null
        }
        Insert: {
          id?: string
          provider?: string
          provider_file_id?: string
          provider_folder_id?: string | null
          filename?: string
          display_name?: string | null
          mime_type?: string | null
          file_size?: number | null
          web_view_url?: string | null
          thumbnail_url?: string | null
          doc_type?: string
          category?: string | null
          entity_type?: string | null
          entity_id?: string | null
          title?: string | null
          description?: string | null
          document_date?: string | null
          expiry_date?: string | null
          reference_number?: string | null
          issuer?: string | null
          tags?: string[]
          folder_path?: string | null
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string | null
          updated_by?: string | null
          file_checksum?: string | null
        }
        Update: {
          id?: string
          provider?: string
          provider_file_id?: string
          provider_folder_id?: string | null
          filename?: string
          display_name?: string | null
          mime_type?: string | null
          file_size?: number | null
          web_view_url?: string | null
          thumbnail_url?: string | null
          doc_type?: string
          category?: string | null
          entity_type?: string | null
          entity_id?: string | null
          title?: string | null
          description?: string | null
          document_date?: string | null
          expiry_date?: string | null
          reference_number?: string | null
          issuer?: string | null
          tags?: string[]
          folder_path?: string | null
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string | null
          updated_by?: string | null
          file_checksum?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "document_library_uploaded_by_fkey"
              columns: ["uploaded_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "document_library_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      dossier_doc_revisions: {
        Row: {
          id: string
          doc_id: string
          title: string | null
          blocks: Json
          summary: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          doc_id?: string
          title?: string | null
          blocks?: Json
          summary?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          doc_id?: string
          title?: string | null
          blocks?: Json
          summary?: string | null
          created_at?: string
          created_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "dossier_doc_revisions_doc_id_fkey"
              columns: ["doc_id"]
              isOneToOne: false
              referencedRelation: "dossier_docs"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "dossier_doc_revisions_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      dossier_docs: {
        Row: {
          id: string
          pack_id: string
          parent_doc_id: string | null
          slug: string
          title: string
          icon: string | null
          order_index: number
          blocks: Json
          created_at: string
          created_by: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          pack_id?: string
          parent_doc_id?: string | null
          slug?: string
          title?: string
          icon?: string | null
          order_index?: number
          blocks?: Json
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          pack_id?: string
          parent_doc_id?: string | null
          slug?: string
          title?: string
          icon?: string | null
          order_index?: number
          blocks?: Json
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "dossier_docs_pack_id_fkey"
              columns: ["pack_id"]
              isOneToOne: false
              referencedRelation: "dossier_packs"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "dossier_docs_parent_doc_id_fkey"
              columns: ["parent_doc_id"]
              isOneToOne: false
              referencedRelation: "dossier_docs"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "dossier_docs_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "dossier_docs_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      dossier_packs: {
        Row: {
          id: string
          title: string
          description: string | null
          status: string
          subject_entity_type: string | null
          subject_entity_id: string | null
          created_at: string
          created_by: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          title?: string
          description?: string | null
          status?: string
          subject_entity_type?: string | null
          subject_entity_id?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          status?: string
          subject_entity_type?: string | null
          subject_entity_id?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "dossier_packs_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "dossier_packs_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      facilities: {
        Row: {
          id: string
          name: string
          short_name: string
          address: string | null
          client_ref: string | null
          notes: string | null
          created_at: string
          created_by: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          name?: string
          short_name?: string
          address?: string | null
          client_ref?: string | null
          notes?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          name?: string
          short_name?: string
          address?: string | null
          client_ref?: string | null
          notes?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "facilities_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "facilities_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      floors: {
        Row: {
          id: string
          facility_id: string
          name: string
          short_name: string
          level_order: number
          notes: string | null
          created_at: string
          created_by: string | null
          updated_at: string | null
          updated_by: string | null
          walk_order: number | null
        }
        Insert: {
          id?: string
          facility_id?: string
          name?: string
          short_name?: string
          level_order?: number
          notes?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
          walk_order?: number | null
        }
        Update: {
          id?: string
          facility_id?: string
          name?: string
          short_name?: string
          level_order?: number
          notes?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
          walk_order?: number | null
        }
        Relationships: [
            {
              foreignKeyName: "floors_facility_id_fkey"
              columns: ["facility_id"]
              isOneToOne: false
              referencedRelation: "facilities"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "floors_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "floors_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      gt_accountable_persons: {
        Row: {
          id: string
          role: string
          name: string
          organisation: string | null
          duties: string | null
          contact: string | null
          appointed_on: string | null
          ended_on: string | null
          notes: string | null
          created_at: string
          created_by: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          role?: string
          name?: string
          organisation?: string | null
          duties?: string | null
          contact?: string | null
          appointed_on?: string | null
          ended_on?: string | null
          notes?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          role?: string
          name?: string
          organisation?: string | null
          duties?: string | null
          contact?: string | null
          appointed_on?: string | null
          ended_on?: string | null
          notes?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "gt_accountable_persons_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "gt_accountable_persons_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      gt_audit: {
        Row: {
          seq: number
          actor: string | null
          action: string
          target_table: string
          target_id: string
          before_data: Json | null
          after_data: Json | null
          occurred_at: string
          prev_hash: string | null
          curr_hash: string
        }
        Insert: {
          seq?: number
          actor?: string | null
          action?: string
          target_table?: string
          target_id?: string
          before_data?: Json | null
          after_data?: Json | null
          occurred_at?: string
          prev_hash?: string | null
          curr_hash?: string
        }
        Update: {
          seq?: number
          actor?: string | null
          action?: string
          target_table?: string
          target_id?: string
          before_data?: Json | null
          after_data?: Json | null
          occurred_at?: string
          prev_hash?: string | null
          curr_hash?: string
        }
        Relationships: []
      }
      gt_documents: {
        Row: {
          id: string
          reference: string
          schedule1_category: number
          document_type: string
          uniclass_code: string | null
          container_id: string | null
          title: string
          summary: string | null
          scope_description: string | null
          building_location: string | null
          author_id: string | null
          reviewer_id: string | null
          status: string
          effective_from: string | null
          effective_to: string | null
          review_due: string | null
          review_cycle_days: number | null
          supersedes: string | null
          superseded_by: string | null
          supersession_reason: string | null
          storage_uri: string | null
          file_checksum: string | null
          safety_critical: boolean
          access_scope: string
          contains_pii: boolean
          security_classification: string
          tags: string[]
          taxonomy_version: string | null
          created_at: string
          created_by: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          reference?: string
          schedule1_category?: number
          document_type?: string
          uniclass_code?: string | null
          container_id?: string | null
          title?: string
          summary?: string | null
          scope_description?: string | null
          building_location?: string | null
          author_id?: string | null
          reviewer_id?: string | null
          status?: string
          effective_from?: string | null
          effective_to?: string | null
          review_due?: string | null
          review_cycle_days?: number | null
          supersedes?: string | null
          superseded_by?: string | null
          supersession_reason?: string | null
          storage_uri?: string | null
          file_checksum?: string | null
          safety_critical?: boolean
          access_scope?: string
          contains_pii?: boolean
          security_classification?: string
          tags?: string[]
          taxonomy_version?: string | null
          created_at?: string
          created_by?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          reference?: string
          schedule1_category?: number
          document_type?: string
          uniclass_code?: string | null
          container_id?: string | null
          title?: string
          summary?: string | null
          scope_description?: string | null
          building_location?: string | null
          author_id?: string | null
          reviewer_id?: string | null
          status?: string
          effective_from?: string | null
          effective_to?: string | null
          review_due?: string | null
          review_cycle_days?: number | null
          supersedes?: string | null
          superseded_by?: string | null
          supersession_reason?: string | null
          storage_uri?: string | null
          file_checksum?: string | null
          safety_critical?: boolean
          access_scope?: string
          contains_pii?: boolean
          security_classification?: string
          tags?: string[]
          taxonomy_version?: string | null
          created_at?: string
          created_by?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "gt_documents_schedule1_category_fkey"
              columns: ["schedule1_category"]
              isOneToOne: false
              referencedRelation: "gt_schedule1_categories"
              referencedColumns: ["code"]
            },
            {
              foreignKeyName: "gt_documents_author_id_fkey"
              columns: ["author_id"]
              isOneToOne: false
              referencedRelation: "gt_persons"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "gt_documents_reviewer_id_fkey"
              columns: ["reviewer_id"]
              isOneToOne: false
              referencedRelation: "gt_persons"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "gt_documents_supersedes_fkey"
              columns: ["supersedes"]
              isOneToOne: false
              referencedRelation: "gt_documents"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "gt_documents_superseded_by_fkey"
              columns: ["superseded_by"]
              isOneToOne: false
              referencedRelation: "gt_documents"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "gt_documents_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "gt_documents_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      gt_links: {
        Row: {
          id: string
          source_type: string
          source_id: string
          target_type: string
          target_id: string
          relation: string
          note: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          source_type?: string
          source_id?: string
          target_type?: string
          target_id?: string
          relation?: string
          note?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          source_type?: string
          source_id?: string
          target_type?: string
          target_id?: string
          relation?: string
          note?: string | null
          created_at?: string
          created_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "gt_links_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      gt_persons: {
        Row: {
          id: string
          full_name: string
          organisation: string | null
          role: string | null
          profile_id: string | null
          qualifications: string | null
          professional_body: string | null
          scheme_registrations: string | null
          last_review: string | null
          next_review_due: string | null
          status: string
          created_at: string
          created_by: string | null
          competencies: string[]
          competence_expiry: string | null
          competence_notes: string | null
        }
        Insert: {
          id?: string
          full_name?: string
          organisation?: string | null
          role?: string | null
          profile_id?: string | null
          qualifications?: string | null
          professional_body?: string | null
          scheme_registrations?: string | null
          last_review?: string | null
          next_review_due?: string | null
          status?: string
          created_at?: string
          created_by?: string | null
          competencies?: string[]
          competence_expiry?: string | null
          competence_notes?: string | null
        }
        Update: {
          id?: string
          full_name?: string
          organisation?: string | null
          role?: string | null
          profile_id?: string | null
          qualifications?: string | null
          professional_body?: string | null
          scheme_registrations?: string | null
          last_review?: string | null
          next_review_due?: string | null
          status?: string
          created_at?: string
          created_by?: string | null
          competencies?: string[]
          competence_expiry?: string | null
          competence_notes?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "gt_persons_profile_id_fkey"
              columns: ["profile_id"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "gt_persons_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      gt_risk_links: {
        Row: {
          id: string
          risk_id: string
          target_type: string
          target_id: string
          relation: string
          note: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          risk_id?: string
          target_type?: string
          target_id?: string
          relation?: string
          note?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          risk_id?: string
          target_type?: string
          target_id?: string
          relation?: string
          note?: string | null
          created_at?: string
          created_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "gt_risk_links_risk_id_fkey"
              columns: ["risk_id"]
              isOneToOne: false
              referencedRelation: "gt_risks"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "gt_risk_links_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      gt_risks: {
        Row: {
          id: string
          reference: string
          title: string
          description: string | null
          domain: string
          hazard: string | null
          cause: string | null
          consequence: string | null
          likelihood: number
          impact: number
          inherent_score: number | null
          residual_score: number | null
          building_location: string | null
          status: string
          owner_id: string | null
          source: string | null
          identified_at: string | null
          last_reviewed: string | null
          review_due: string | null
          review_cycle_days: number | null
          supersedes: string | null
          superseded_by: string | null
          supersession_reason: string | null
          closure_reason: string | null
          created_at: string
          created_by: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          reference?: string
          title?: string
          description?: string | null
          domain?: string
          hazard?: string | null
          cause?: string | null
          consequence?: string | null
          likelihood?: number
          impact?: number
          inherent_score?: number | null
          residual_score?: number | null
          building_location?: string | null
          status?: string
          owner_id?: string | null
          source?: string | null
          identified_at?: string | null
          last_reviewed?: string | null
          review_due?: string | null
          review_cycle_days?: number | null
          supersedes?: string | null
          superseded_by?: string | null
          supersession_reason?: string | null
          closure_reason?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          reference?: string
          title?: string
          description?: string | null
          domain?: string
          hazard?: string | null
          cause?: string | null
          consequence?: string | null
          likelihood?: number
          impact?: number
          inherent_score?: number | null
          residual_score?: number | null
          building_location?: string | null
          status?: string
          owner_id?: string | null
          source?: string | null
          identified_at?: string | null
          last_reviewed?: string | null
          review_due?: string | null
          review_cycle_days?: number | null
          supersedes?: string | null
          superseded_by?: string | null
          supersession_reason?: string | null
          closure_reason?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "gt_risks_owner_id_fkey"
              columns: ["owner_id"]
              isOneToOne: false
              referencedRelation: "gt_persons"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "gt_risks_supersedes_fkey"
              columns: ["supersedes"]
              isOneToOne: false
              referencedRelation: "gt_risks"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "gt_risks_superseded_by_fkey"
              columns: ["superseded_by"]
              isOneToOne: false
              referencedRelation: "gt_risks"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "gt_risks_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "gt_risks_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      gt_schedule1_categories: {
        Row: {
          code: number
          name: string
          applicable: boolean
          notes: string | null
        }
        Insert: {
          code?: number
          name?: string
          applicable?: boolean
          notes?: string | null
        }
        Update: {
          code?: number
          name?: string
          applicable?: boolean
          notes?: string | null
        }
        Relationships: []
      }
      info_notes: {
        Row: {
          id: string
          section_id: string
          title: string
          body: string | null
          is_pinned: boolean
          tags: string[]
          status: string
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          updated_by: string | null
          slug: string | null
          summary: string | null
          visibility: string
          published_at: string | null
        }
        Insert: {
          id?: string
          section_id?: string
          title?: string
          body?: string | null
          is_pinned?: boolean
          tags?: string[]
          status?: string
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          slug?: string | null
          summary?: string | null
          visibility?: string
          published_at?: string | null
        }
        Update: {
          id?: string
          section_id?: string
          title?: string
          body?: string | null
          is_pinned?: boolean
          tags?: string[]
          status?: string
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          slug?: string | null
          summary?: string | null
          visibility?: string
          published_at?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "info_notes_section_id_fkey"
              columns: ["section_id"]
              isOneToOne: false
              referencedRelation: "info_sections"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "info_notes_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "info_notes_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      info_sections: {
        Row: {
          id: string
          name: string
          description: string | null
          colour: string
          display_order: number
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          name?: string
          description?: string | null
          colour?: string
          display_order?: number
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          colour?: string
          display_order?: number
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "info_sections_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "info_sections_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      inspection_definitions: {
        Row: {
          id: string
          name: string
          description: string | null
          active: boolean
          mode: string
          scope: Json
          checklist_mode: string
          checklist_attr_ids: string[]
          pass_fail_rule: string
          frequency_days: number | null
          link_source: string
          link_type_filter: string | null
          presentation_order: number
          created_at: string
          created_by: string | null
          updated_at: string | null
          updated_by: string | null
          statutory_ref: string | null
          test_type: string | null
        }
        Insert: {
          id?: string
          name?: string
          description?: string | null
          active?: boolean
          mode?: string
          scope?: Json
          checklist_mode?: string
          checklist_attr_ids?: string[]
          pass_fail_rule?: string
          frequency_days?: number | null
          link_source?: string
          link_type_filter?: string | null
          presentation_order?: number
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
          statutory_ref?: string | null
          test_type?: string | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          active?: boolean
          mode?: string
          scope?: Json
          checklist_mode?: string
          checklist_attr_ids?: string[]
          pass_fail_rule?: string
          frequency_days?: number | null
          link_source?: string
          link_type_filter?: string | null
          presentation_order?: number
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
          statutory_ref?: string | null
          test_type?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "inspection_definitions_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "inspection_definitions_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      issues: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string | null
          updated_at: string | null
          priority: number | null
          status: string | null
          created_by: string | null
          updated_by: string | null
          issue_number: number
          meeting_id: string | null
        }
        Insert: {
          id?: string
          name?: string
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
          priority?: number | null
          status?: string | null
          created_by?: string | null
          updated_by?: string | null
          issue_number?: number
          meeting_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
          priority?: number | null
          status?: string | null
          created_by?: string | null
          updated_by?: string | null
          issue_number?: number
          meeting_id?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "issues_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "issues_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "issues_meeting_id_fkey"
              columns: ["meeting_id"]
              isOneToOne: false
              referencedRelation: "meetings"
              referencedColumns: ["id"]
            }
          ]
      }
      login_attempts: {
        Row: {
          id: string
          email_lower: string
          ip_address: string | null
          user_agent: string | null
          succeeded: boolean
          attempted_at: string
        }
        Insert: {
          id?: string
          email_lower?: string
          ip_address?: string | null
          user_agent?: string | null
          succeeded?: boolean
          attempted_at?: string
        }
        Update: {
          id?: string
          email_lower?: string
          ip_address?: string | null
          user_agent?: string | null
          succeeded?: boolean
          attempted_at?: string
        }
        Relationships: []
      }
      maintenance_documents: {
        Row: {
          id: string
          job_id: string
          doc_type: string
          filename: string
          storage_path: string
          file_size: number | null
          mime_type: string | null
          expiry_date: string | null
          created_at: string
          uploaded_by: string | null
          library_doc_id: string | null
        }
        Insert: {
          id?: string
          job_id?: string
          doc_type?: string
          filename?: string
          storage_path?: string
          file_size?: number | null
          mime_type?: string | null
          expiry_date?: string | null
          created_at?: string
          uploaded_by?: string | null
          library_doc_id?: string | null
        }
        Update: {
          id?: string
          job_id?: string
          doc_type?: string
          filename?: string
          storage_path?: string
          file_size?: number | null
          mime_type?: string | null
          expiry_date?: string | null
          created_at?: string
          uploaded_by?: string | null
          library_doc_id?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "maintenance_documents_job_id_fkey"
              columns: ["job_id"]
              isOneToOne: false
              referencedRelation: "maintenance_jobs"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "maintenance_documents_uploaded_by_fkey"
              columns: ["uploaded_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      maintenance_groups: {
        Row: {
          id: string
          name: string
          system_ids: string[]
          type_codes: string[]
          space_ids: string[]
          last_renewal_date: string | null
          lifetime_years: number | null
          expected_cost: number | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
          plan_overrides: Json
        }
        Insert: {
          id?: string
          name?: string
          system_ids?: string[]
          type_codes?: string[]
          space_ids?: string[]
          last_renewal_date?: string | null
          lifetime_years?: number | null
          expected_cost?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          plan_overrides?: Json
        }
        Update: {
          id?: string
          name?: string
          system_ids?: string[]
          type_codes?: string[]
          space_ids?: string[]
          last_renewal_date?: string | null
          lifetime_years?: number | null
          expected_cost?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          plan_overrides?: Json
        }
        Relationships: [
            {
              foreignKeyName: "maintenance_groups_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "maintenance_groups_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      maintenance_job_components: {
        Row: {
          id: string
          job_id: string
          component_id: string
          result: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          job_id?: string
          component_id?: string
          result?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          job_id?: string
          component_id?: string
          result?: string | null
          notes?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "maintenance_job_components_job_id_fkey"
              columns: ["job_id"]
              isOneToOne: false
              referencedRelation: "maintenance_jobs"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "maintenance_job_components_component_id_fkey"
              columns: ["component_id"]
              isOneToOne: false
              referencedRelation: "components"
              referencedColumns: ["id"]
            }
          ]
      }
      maintenance_jobs: {
        Row: {
          id: string
          regime_id: string | null
          scope_type: string
          scope_id: string | null
          scope_label: string | null
          title: string
          description: string | null
          scheduled_date: string
          completed_date: string | null
          status: string
          result: string | null
          contractor_name: string | null
          engineer_name: string | null
          reference_number: string | null
          completion_notes: string | null
          next_job_id: string | null
          created_at: string
          created_by: string | null
          updated_at: string | null
          updated_by: string | null
          contractor_id: string | null
          hard_expiry_date: string | null
        }
        Insert: {
          id?: string
          regime_id?: string | null
          scope_type?: string
          scope_id?: string | null
          scope_label?: string | null
          title?: string
          description?: string | null
          scheduled_date?: string
          completed_date?: string | null
          status?: string
          result?: string | null
          contractor_name?: string | null
          engineer_name?: string | null
          reference_number?: string | null
          completion_notes?: string | null
          next_job_id?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
          contractor_id?: string | null
          hard_expiry_date?: string | null
        }
        Update: {
          id?: string
          regime_id?: string | null
          scope_type?: string
          scope_id?: string | null
          scope_label?: string | null
          title?: string
          description?: string | null
          scheduled_date?: string
          completed_date?: string | null
          status?: string
          result?: string | null
          contractor_name?: string | null
          engineer_name?: string | null
          reference_number?: string | null
          completion_notes?: string | null
          next_job_id?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
          contractor_id?: string | null
          hard_expiry_date?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "maintenance_jobs_regime_id_fkey"
              columns: ["regime_id"]
              isOneToOne: false
              referencedRelation: "maintenance_regime"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "maintenance_jobs_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "maintenance_jobs_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "maintenance_jobs_contractor_id_fkey"
              columns: ["contractor_id"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      maintenance_regime: {
        Row: {
          id: string
          type_id: string
          attribute_filter: string | null
          task_name: string
          frequency_days: number
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          type_id?: string
          attribute_filter?: string | null
          task_name?: string
          frequency_days?: number
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          type_id?: string
          attribute_filter?: string | null
          task_name?: string
          frequency_days?: number
          created_at?: string
          created_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "maintenance_regime_type_id_fkey"
              columns: ["type_id"]
              isOneToOne: false
              referencedRelation: "component_types"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "maintenance_regime_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      media_attachments: {
        Row: {
          id: string
          entity_type: string
          entity_id: string
          storage_url: string
          filename: string | null
          mime_type: string | null
          size_bytes: number | null
          storage_provider: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          entity_type?: string
          entity_id?: string
          storage_url?: string
          filename?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_provider?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          entity_type?: string
          entity_id?: string
          storage_url?: string
          filename?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_provider?: string | null
          created_at?: string
          created_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "media_attachments_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      meetings: {
        Row: {
          id: string
          title: string
          meeting_type: string
          meeting_date: string
          notes: string | null
          participants: Json
          status: string
          opened_at: string
          closed_at: string | null
          created_by: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title?: string
          meeting_type?: string
          meeting_date?: string
          notes?: string | null
          participants?: Json
          status?: string
          opened_at?: string
          closed_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          meeting_type?: string
          meeting_date?: string
          notes?: string | null
          participants?: Json
          status?: string
          opened_at?: string
          closed_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
            {
              foreignKeyName: "meetings_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "meetings_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      mor_cases: {
        Row: {
          id: string
          reference: string
          status: string
          mechanism: string | null
          urgency: boolean
          description: string
          location_text: string | null
          channel: string
          reporter_type: string
          reporter_name: string | null
          reporter_contact: string | null
          is_anonymous: boolean
          identification_date: string
          received_date: string
          acknowledged_at: string | null
          triaged_at: string | null
          decision_at: string | null
          closed_at: string | null
          triage_outcome: string | null
          triage_rationale: string | null
          triage_by: string | null
          decision_outcome: string | null
          decision_rationale: string | null
          decision_proposed_by: string | null
          decision_approved_by: string | null
          bsr_notice_ref: string | null
          bsr_notice_submitted_at: string | null
          bsr_notice_submitted_by: string | null
          bsr_notice_notes: string | null
          bsr_report_ref: string | null
          bsr_report_submitted_at: string | null
          bsr_report_submitted_by: string | null
          bsr_report_notes: string | null
          lessons_learned: string | null
          component_id: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
          verification_code: string | null
        }
        Insert: {
          id?: string
          reference?: string
          status?: string
          mechanism?: string | null
          urgency?: boolean
          description?: string
          location_text?: string | null
          channel?: string
          reporter_type?: string
          reporter_name?: string | null
          reporter_contact?: string | null
          is_anonymous?: boolean
          identification_date?: string
          received_date?: string
          acknowledged_at?: string | null
          triaged_at?: string | null
          decision_at?: string | null
          closed_at?: string | null
          triage_outcome?: string | null
          triage_rationale?: string | null
          triage_by?: string | null
          decision_outcome?: string | null
          decision_rationale?: string | null
          decision_proposed_by?: string | null
          decision_approved_by?: string | null
          bsr_notice_ref?: string | null
          bsr_notice_submitted_at?: string | null
          bsr_notice_submitted_by?: string | null
          bsr_notice_notes?: string | null
          bsr_report_ref?: string | null
          bsr_report_submitted_at?: string | null
          bsr_report_submitted_by?: string | null
          bsr_report_notes?: string | null
          lessons_learned?: string | null
          component_id?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          verification_code?: string | null
        }
        Update: {
          id?: string
          reference?: string
          status?: string
          mechanism?: string | null
          urgency?: boolean
          description?: string
          location_text?: string | null
          channel?: string
          reporter_type?: string
          reporter_name?: string | null
          reporter_contact?: string | null
          is_anonymous?: boolean
          identification_date?: string
          received_date?: string
          acknowledged_at?: string | null
          triaged_at?: string | null
          decision_at?: string | null
          closed_at?: string | null
          triage_outcome?: string | null
          triage_rationale?: string | null
          triage_by?: string | null
          decision_outcome?: string | null
          decision_rationale?: string | null
          decision_proposed_by?: string | null
          decision_approved_by?: string | null
          bsr_notice_ref?: string | null
          bsr_notice_submitted_at?: string | null
          bsr_notice_submitted_by?: string | null
          bsr_notice_notes?: string | null
          bsr_report_ref?: string | null
          bsr_report_submitted_at?: string | null
          bsr_report_submitted_by?: string | null
          bsr_report_notes?: string | null
          lessons_learned?: string | null
          component_id?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          verification_code?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "mor_cases_triage_by_fkey"
              columns: ["triage_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "mor_cases_decision_proposed_by_fkey"
              columns: ["decision_proposed_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "mor_cases_decision_approved_by_fkey"
              columns: ["decision_approved_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "mor_cases_bsr_notice_submitted_by_fkey"
              columns: ["bsr_notice_submitted_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "mor_cases_bsr_report_submitted_by_fkey"
              columns: ["bsr_report_submitted_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "mor_cases_component_id_fkey"
              columns: ["component_id"]
              isOneToOne: false
              referencedRelation: "components"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "mor_cases_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "mor_cases_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      mor_mitigations: {
        Row: {
          id: string
          case_id: string
          type: string
          description: string
          owner: string | null
          target_date: string | null
          status: string
          completed_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          case_id?: string
          type?: string
          description?: string
          owner?: string | null
          target_date?: string | null
          status?: string
          completed_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          case_id?: string
          type?: string
          description?: string
          owner?: string | null
          target_date?: string | null
          status?: string
          completed_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "mor_mitigations_case_id_fkey"
              columns: ["case_id"]
              isOneToOne: false
              referencedRelation: "mor_cases"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "mor_mitigations_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "mor_mitigations_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      mor_timeline_entries: {
        Row: {
          id: string
          case_id: string
          entry_type: string
          from_status: string | null
          to_status: string | null
          content: string | null
          author_id: string | null
          author_name: string
          created_at: string
        }
        Insert: {
          id?: string
          case_id?: string
          entry_type?: string
          from_status?: string | null
          to_status?: string | null
          content?: string | null
          author_id?: string | null
          author_name?: string
          created_at?: string
        }
        Update: {
          id?: string
          case_id?: string
          entry_type?: string
          from_status?: string | null
          to_status?: string | null
          content?: string | null
          author_id?: string | null
          author_name?: string
          created_at?: string
        }
        Relationships: [
            {
              foreignKeyName: "mor_timeline_entries_case_id_fkey"
              columns: ["case_id"]
              isOneToOne: false
              referencedRelation: "mor_cases"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "mor_timeline_entries_author_id_fkey"
              columns: ["author_id"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      plan_annotations: {
        Row: {
          id: string
          plan_id: string
          floor_id: string | null
          text: string
          x_position: number
          y_position: number
          font_size: string
          colour: string
          bold: boolean
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          plan_id?: string
          floor_id?: string | null
          text?: string
          x_position?: number
          y_position?: number
          font_size?: string
          colour?: string
          bold?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          plan_id?: string
          floor_id?: string | null
          text?: string
          x_position?: number
          y_position?: number
          font_size?: string
          colour?: string
          bold?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "plan_annotations_plan_id_fkey"
              columns: ["plan_id"]
              isOneToOne: false
              referencedRelation: "plans"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "plan_annotations_floor_id_fkey"
              columns: ["floor_id"]
              isOneToOne: false
              referencedRelation: "floors"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "plan_annotations_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "plan_annotations_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      plans: {
        Row: {
          id: string
          name: string
          building: string
          image_url: string
          image_width: number | null
          image_height: number | null
          description: string | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          updated_by: string | null
          floor_level: string
          floor_id: string | null
          scale_ref: Json | null
          image_aspect_ratio: number | null
        }
        Insert: {
          id?: string
          name?: string
          building?: string
          image_url?: string
          image_width?: number | null
          image_height?: number | null
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          floor_level?: string
          floor_id?: string | null
          scale_ref?: Json | null
          image_aspect_ratio?: number | null
        }
        Update: {
          id?: string
          name?: string
          building?: string
          image_url?: string
          image_width?: number | null
          image_height?: number | null
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          floor_level?: string
          floor_id?: string | null
          scale_ref?: Json | null
          image_aspect_ratio?: number | null
        }
        Relationships: [
            {
              foreignKeyName: "plans_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "plans_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "plans_floor_id_fkey"
              columns: ["floor_id"]
              isOneToOne: false
              referencedRelation: "floors"
              referencedColumns: ["id"]
            }
          ]
      }
      portal_settings: {
        Row: {
          key: string
          value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          key?: string
          value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          key?: string
          value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "portal_settings_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          created_at: string | null
          updated_at: string | null
          is_admin: boolean | null
          is_read_only: boolean | null
          is_contractor: boolean
        }
        Insert: {
          id?: string
          email?: string
          full_name?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_admin?: boolean | null
          is_read_only?: boolean | null
          is_contractor?: boolean
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_admin?: boolean | null
          is_read_only?: boolean | null
          is_contractor?: boolean
        }
        Relationships: [
            {
              foreignKeyName: "profiles_id_fkey"
              columns: ["id"]
              isOneToOne: false
              referencedRelation: "null"
              referencedColumns: ["null"]
            }
          ]
      }
      public_upload_attempts: {
        Row: {
          id: string
          ip_hash: string
          action: string
          created_at: string
        }
        Insert: {
          id?: string
          ip_hash?: string
          action?: string
          created_at?: string
        }
        Update: {
          id?: string
          ip_hash?: string
          action?: string
          created_at?: string
        }
        Relationships: []
      }
      space_component_overrides: {
        Row: {
          id: string
          space_id: string
          component_id: string
          mode: string
          note: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          space_id?: string
          component_id?: string
          mode?: string
          note?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          space_id?: string
          component_id?: string
          mode?: string
          note?: string | null
          created_at?: string
          created_by?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "space_component_overrides_space_id_fkey"
              columns: ["space_id"]
              isOneToOne: false
              referencedRelation: "spaces"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "space_component_overrides_component_id_fkey"
              columns: ["component_id"]
              isOneToOne: false
              referencedRelation: "components"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "space_component_overrides_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      space_types: {
        Row: {
          id: string
          value: string
          presentation_order: number
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          value?: string
          presentation_order?: number
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          value?: string
          presentation_order?: number
          created_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
      spaces: {
        Row: {
          id: string
          plan_id: string
          floor_id: string | null
          name: string
          type: string | null
          polygon: Json
          colour: string
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
          height_m: number | null
          show_label: boolean
          kind: string
          assigned_id: string | null
          label: string | null
        }
        Insert: {
          id?: string
          plan_id?: string
          floor_id?: string | null
          name?: string
          type?: string | null
          polygon?: Json
          colour?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          height_m?: number | null
          show_label?: boolean
          kind?: string
          assigned_id?: string | null
          label?: string | null
        }
        Update: {
          id?: string
          plan_id?: string
          floor_id?: string | null
          name?: string
          type?: string | null
          polygon?: Json
          colour?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          height_m?: number | null
          show_label?: boolean
          kind?: string
          assigned_id?: string | null
          label?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "spaces_plan_id_fkey"
              columns: ["plan_id"]
              isOneToOne: false
              referencedRelation: "plans"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "spaces_floor_id_fkey"
              columns: ["floor_id"]
              isOneToOne: false
              referencedRelation: "floors"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "spaces_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "spaces_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            }
          ]
      }
      type_attribute_options: {
        Row: {
          id: string
          type_attribute_id: string
          value: string
          presentation_order: number
          visible: boolean
          priority_override: string | null
          created_at: string
        }
        Insert: {
          id?: string
          type_attribute_id?: string
          value?: string
          presentation_order?: number
          visible?: boolean
          priority_override?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          type_attribute_id?: string
          value?: string
          presentation_order?: number
          visible?: boolean
          priority_override?: string | null
          created_at?: string
        }
        Relationships: [
            {
              foreignKeyName: "type_attribute_options_type_attribute_id_fkey"
              columns: ["type_attribute_id"]
              isOneToOne: false
              referencedRelation: "type_attributes"
              referencedColumns: ["id"]
            }
          ]
      }
      type_attributes: {
        Row: {
          id: string
          component_type_id: string | null
          name: string
          display_type: string
          required: boolean
          default_value: string | null
          is_primary: boolean
          presentation_order: number
          visible: boolean
          created_at: string
          building_system_id: string | null
          checkable: boolean
          help_notes: string | null
        }
        Insert: {
          id?: string
          component_type_id?: string | null
          name?: string
          display_type?: string
          required?: boolean
          default_value?: string | null
          is_primary?: boolean
          presentation_order?: number
          visible?: boolean
          created_at?: string
          building_system_id?: string | null
          checkable?: boolean
          help_notes?: string | null
        }
        Update: {
          id?: string
          component_type_id?: string | null
          name?: string
          display_type?: string
          required?: boolean
          default_value?: string | null
          is_primary?: boolean
          presentation_order?: number
          visible?: boolean
          created_at?: string
          building_system_id?: string | null
          checkable?: boolean
          help_notes?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "type_attributes_component_type_id_fkey"
              columns: ["component_type_id"]
              isOneToOne: false
              referencedRelation: "component_types"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "type_attributes_building_system_id_fkey"
              columns: ["building_system_id"]
              isOneToOne: false
              referencedRelation: "building_systems"
              referencedColumns: ["id"]
            }
          ]
      }
      walk_sessions: {
        Row: {
          id: string
          session_type: string
          session_scope: string
          session_preset: string
          type_filter: Json
          emergency_only: boolean
          building: string
          floor_id: string | null
          session_name: string | null
          total_components_count: number
          inspected_components_count: number
          status: string
          started_at: string
          closed_at: string | null
          notes: string | null
          inspector_name: string | null
          created_by: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
          definition_id: string | null
          trigger_component_id: string | null
        }
        Insert: {
          id?: string
          session_type?: string
          session_scope?: string
          session_preset?: string
          type_filter?: Json
          emergency_only?: boolean
          building?: string
          floor_id?: string | null
          session_name?: string | null
          total_components_count?: number
          inspected_components_count?: number
          status?: string
          started_at?: string
          closed_at?: string | null
          notes?: string | null
          inspector_name?: string | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
          definition_id?: string | null
          trigger_component_id?: string | null
        }
        Update: {
          id?: string
          session_type?: string
          session_scope?: string
          session_preset?: string
          type_filter?: Json
          emergency_only?: boolean
          building?: string
          floor_id?: string | null
          session_name?: string | null
          total_components_count?: number
          inspected_components_count?: number
          status?: string
          started_at?: string
          closed_at?: string | null
          notes?: string | null
          inspector_name?: string | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
          definition_id?: string | null
          trigger_component_id?: string | null
        }
        Relationships: [
            {
              foreignKeyName: "walk_sessions_floor_id_fkey"
              columns: ["floor_id"]
              isOneToOne: false
              referencedRelation: "floors"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "walk_sessions_created_by_fkey"
              columns: ["created_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "walk_sessions_updated_by_fkey"
              columns: ["updated_by"]
              isOneToOne: false
              referencedRelation: "profiles"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "walk_sessions_definition_id_fkey"
              columns: ["definition_id"]
              isOneToOne: false
              referencedRelation: "inspection_definitions"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "walk_sessions_trigger_component_id_fkey"
              columns: ["trigger_component_id"]
              isOneToOne: false
              referencedRelation: "components"
              referencedColumns: ["id"]
            }
          ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ── Convenience helpers (hand-added; the official generator ships equivalents) ──
type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update']
export type TableName = keyof PublicSchema['Tables']
