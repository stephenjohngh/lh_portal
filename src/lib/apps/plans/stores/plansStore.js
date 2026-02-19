// src/lib/apps/plans/stores/plansStore.js
// State management for Plans app

import { writable } from 'svelte/store';
import { getLogger } from '$lib/utils/logger';
import { logAuditEvent } from '$lib/utils/auditLogger';
import { api } from '$lib/utils/api';
import { supabase } from '$lib/supabaseClient';

const logger = getLogger('plansStore');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user.id;
}

// Fire-and-forget audit log — never throws, never blocks the main operation.
function audit(eventType, eventAction, targetType, targetId, targetName, changes = null) {
  logAuditEvent({
    event_type:     eventType,
    event_category: 'plans',
    event_action:   eventAction,
    target_type:    targetType,
    target_id:      targetId,
    target_name:    targetName,
    app_id:         'plans',
    severity:       eventType === 'delete' ? 'warning' : 'info',
    changes
  }).catch(err => logger('⚠️ Audit log failed (non-fatal):', err.message));
}

// Return a subset of an object by key list
function pick(obj, keys) {
  return Object.fromEntries(keys.map(k => [k, obj[k]]));
}

// ── Store ─────────────────────────────────────────────────────────────────────
function createPlansStore() {
  const { subscribe, set, update } = writable({
    plans:    [],
    elements: {}, // keyed by plan_id
    loading:  false,
    error:    null
  });

  return {
    subscribe,

    async loadPlans() {
      logger('Loading plans...');
      update(s => ({ ...s, loading: true, error: null }));
      try {
        const plans = await api.get('plans', {
          select:    '*, created_by_profile:profiles!created_by(full_name), updated_by_profile:profiles!updated_by(full_name)',
          orderBy:   'created_at',
          ascending: false
        });
        logger('✅ Loaded plans:', plans.length);
        update(s => ({ ...s, plans, loading: false }));
        return plans;
      } catch (error) {
        logger('❌ Error loading plans:', error.message);
        update(s => ({ ...s, error: error.message, loading: false }));
        throw error;
      }
    },

    async loadElements(planId) {
      logger('Loading elements for plan:', planId);
      try {
        const elements = await api.get('plan_elements', {
          filters:   { plan_id: planId },
          select:    '*',
          orderBy:   'created_at',
          ascending: false
        });
        logger('✅ Loaded elements:', elements.length);
        update(s => ({ ...s, elements: { ...s.elements, [planId]: elements } }));
        return elements;
      } catch (error) {
        logger('❌ Error loading elements:', error.message);
        throw error;
      }
    },

    async createPlan(planData) {
      logger('Creating plan:', planData.name);
      try {
        const userId = await getCurrentUserId();
        const plan   = await api.create('plans', { ...planData, created_by: userId, updated_by: userId });
        logger('✅ Created plan:', plan.id);
        update(s => ({ ...s, plans: [plan, ...s.plans] }));
        audit('create', 'create_plan', 'plan', plan.id, plan.name);
        return plan;
      } catch (error) {
        logger('❌ Error creating plan:', error.message);
        throw error;
      }
    },

    async updatePlan(planId, updates) {
      logger('Updating plan:', planId);
      try {
        const userId = await getCurrentUserId();
        let oldPlan  = null;
        update(s => { oldPlan = s.plans.find(p => p.id === planId); return s; });

        const plan = await api.update('plans', planId, { ...updates, updated_by: userId });
        logger('✅ Updated plan:', plan.id);
        update(s => ({ ...s, plans: s.plans.map(p => p.id === planId ? plan : p) }));

        const changedFields = Object.keys(updates).filter(k => oldPlan && oldPlan[k] !== updates[k]);
        audit('update', 'update_plan', 'plan', plan.id, plan.name,
          oldPlan ? { before: pick(oldPlan, changedFields), after: pick(updates, changedFields), fields_changed: changedFields } : null
        );
        return plan;
      } catch (error) {
        logger('❌ Error updating plan:', error.message);
        throw error;
      }
    },

    async deletePlan(planId) {
      logger('Deleting plan:', planId);
      try {
        let imageUrl = null;
        let planName = null;
        update(s => {
          const plan = s.plans.find(p => p.id === planId);
          if (plan) { imageUrl = plan.image_url; planName = plan.name; }
          return s;
        });

        await api.delete('plans', planId);
        logger('✅ Deleted plan:', planId);
        audit('delete', 'delete_plan', 'plan', planId, planName);

        // Best-effort storage cleanup
        if (imageUrl) {
          try {
            const match = imageUrl.match(/\/plan-images\/(.+)$/);
            if (match) {
              const { error: storageError } = await supabase.storage.from('plan-images').remove([match[1]]);
              if (storageError) logger('⚠️ Storage cleanup failed:', storageError.message);
              else logger('✅ Deleted image from storage:', match[1]);
            }
          } catch (err) { logger('⚠️ Storage cleanup error:', err.message); }
        }

        update(s => ({
          ...s,
          plans:    s.plans.filter(p => p.id !== planId),
          elements: Object.fromEntries(Object.entries(s.elements).filter(([k]) => k !== planId))
        }));
      } catch (error) {
        logger('❌ Error deleting plan:', error.message);
        throw error;
      }
    },

    async createElement(planId, elementData) {
      logger('Creating element:', elementData.asset_id);
      try {
        const userId  = await getCurrentUserId();
        const element = await api.create('plan_elements', {
          ...elementData, plan_id: planId, created_by: userId, updated_by: userId
        });
        logger('✅ Created element:', element.id);
        update(s => ({
          ...s,
          elements: { ...s.elements, [planId]: [element, ...(s.elements[planId] || [])] }
        }));
        const elementName = element.asset_id || element.label || element.element_type;
        audit('create', 'create_element', 'plan_element', element.id, elementName);
        return element;
      } catch (error) {
        logger('❌ Error creating element:', error.message);
        throw error;
      }
    },

    async updateElement(elementId, updates) {
      logger('Updating element:', elementId);
      try {
        const userId = await getCurrentUserId();
        let oldElement = null;
        update(s => {
          for (const elList of Object.values(s.elements)) {
            const found = elList.find(e => e.id === elementId);
            if (found) { oldElement = found; break; }
          }
          return s;
        });

        const element = await api.update('plan_elements', elementId, { ...updates, updated_by: userId });
        logger('✅ Updated element:', element.id);
        update(s => {
          const planId = element.plan_id;
          return {
            ...s,
            elements: {
              ...s.elements,
              [planId]: (s.elements[planId] || []).map(e => e.id === elementId ? element : e)
            }
          };
        });

        const elementName = element.asset_id || element.label || element.element_type;
        const changedFields = Object.keys(updates).filter(k => k !== 'updated_by' && oldElement && oldElement[k] !== updates[k]);
        audit('update', 'update_element', 'plan_element', element.id, elementName,
          oldElement ? { before: pick(oldElement, changedFields), after: pick(updates, changedFields), fields_changed: changedFields } : null
        );
        return element;
      } catch (error) {
        logger('❌ Error updating element:', error.message);
        throw error;
      }
    },

    async deleteElement(elementId, planId) {
      logger('Deleting element:', elementId);
      try {
        let elementName = elementId;
        update(s => {
          const el = (s.elements[planId] || []).find(e => e.id === elementId);
          if (el) elementName = el.asset_id || el.label || el.element_type;
          return s;
        });

        await api.delete('plan_elements', elementId);
        logger('✅ Deleted element:', elementId);
        audit('delete', 'delete_element', 'plan_element', elementId, elementName);

        update(s => ({
          ...s,
          elements: { ...s.elements, [planId]: (s.elements[planId] || []).filter(e => e.id !== elementId) }
        }));
      } catch (error) {
        logger('❌ Error deleting element:', error.message);
        throw error;
      }
    },

    async uploadImage(file) {
      logger('Uploading image:', file.name, `${(file.size / 1024 / 1024).toFixed(2)}MB`);
      try {
        const fileExt  = file.name.split('.').pop();
        const filePath = `plans/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error } = await supabase.storage.from('plan-images').upload(filePath, file, { cacheControl: '3600', upsert: false });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('plan-images').getPublicUrl(filePath);
        logger('✅ Uploaded image:', urlData.publicUrl);
        return { url: urlData.publicUrl, path: filePath };
      } catch (error) {
        logger('❌ Error uploading image:', error.message);
        throw error;
      }
    },

    async getImageDimensions(imageUrl) {
      return new Promise((resolve, reject) => {
        const img    = new Image();
        img.onload   = () => { logger('Image dimensions:', img.width, 'x', img.height); resolve({ width: img.width, height: img.height }); };
        img.onerror  = () => reject(new Error('Failed to load image'));
        img.src      = imageUrl;
      });
    }
  };
}

export const plansStore = createPlansStore();
