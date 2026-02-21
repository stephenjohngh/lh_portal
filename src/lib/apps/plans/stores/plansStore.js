// src/lib/apps/plans/stores/plansStore.js
// State management for Plans app

import { writable } from 'svelte/store';
import { getLogger } from '$lib/utils/logger';
import { logAudit } from '$lib/utils/auditLogger';
import { api } from '$lib/utils/api';
import { supabase } from '$lib/supabaseClient';
import { FLOOR_LEVELS } from '$lib/utils/planConstants';

// Custom floor level sort order — mirrors the dropdown menu order exactly.
// L (Lower), U (Upper), G (Ground), 1–7
const FLOOR_LEVEL_ORDER = Object.fromEntries(
  FLOOR_LEVELS.map((f, i) => [f.value, i])
);

function sortPlans(plans) {
  return plans.slice().sort((a, b) => {
    // Primary: building name alphabetically
    const buildingCmp = (a.building ?? '').localeCompare(b.building ?? '');
    if (buildingCmp !== 0) return buildingCmp;
    // Secondary: floor level by dropdown order (L, U, G, 1, 2 … 7)
    const aOrder = FLOOR_LEVEL_ORDER[String(a.floor_level)] ?? 999;
    const bOrder = FLOOR_LEVEL_ORDER[String(b.floor_level)] ?? 999;
    return aOrder - bOrder;
  });
}

const logger = getLogger('plansStore');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user.id;
}

// Thin wrapper — bakes in app-level defaults, stays fire-and-forget.
function audit(eventType, targetType, targetId, targetName, data = {}) {
  logAudit(eventType, targetType, targetId, targetName, {
    appId:         'plans',
    eventCategory: 'plans',
    severity:      eventType === 'delete' ? 'warning' : 'info',
    ...data
  });
  // Intentionally not awaited — audit must never block or throw to the caller.
}

// Return a subset of an object by key list (for before/after diffs)
function pick(obj, keys) {
  if (!obj) return {};
  return Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));
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
          orderBy:   'building',
          ascending: true
        });
        const sorted = sortPlans(plans);
        logger('✅ Loaded plans:', sorted.length);
        update(s => ({ ...s, plans: sorted, loading: false }));
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
        audit('create', 'plan', plan.id, plan.name, {
          eventAction: 'create_plan',
          afterData:   { name: plan.name, building: plan.building, floor_level: plan.floor_level }
        });
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

        const fields = Object.keys(updates);
        audit('update', 'plan', plan.id, plan.name, {
          eventAction: 'update_plan',
          beforeData:  pick(oldPlan, fields),
          afterData:   pick(updates, fields)
        });
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
        let oldPlan  = null;
        update(s => {
          oldPlan = s.plans.find(p => p.id === planId);
          if (oldPlan) { imageUrl = oldPlan.image_url; planName = oldPlan.name; }
          return s;
        });

        await api.delete('plans', planId);
        logger('✅ Deleted plan:', planId);
        audit('delete', 'plan', planId, planName, {
          eventAction: 'delete_plan',
          beforeData:  oldPlan ? { name: oldPlan.name, building: oldPlan.building, floor_level: oldPlan.floor_level } : undefined
        });

        // Storage cleanup — delete the image file from the plan-images bucket.
        // We parse the URL properly rather than using a bare regex so that
        // query-string cache tokens (e.g. ?t=...) and URL-encoded characters
        // don't corrupt the storage path passed to remove().
        if (imageUrl) {
          try {
            // Supabase public URL format:
            //   https://<project>.supabase.co/storage/v1/object/public/plan-images/<path>
            // We need just <path> — everything after /plan-images/
            const parsed    = new URL(imageUrl);
            const marker    = '/plan-images/';
            const markerIdx = parsed.pathname.indexOf(marker);
            if (markerIdx !== -1) {
              // Decode any %2F / %20 etc so the path matches what was uploaded
              const storagePath = decodeURIComponent(
                parsed.pathname.slice(markerIdx + marker.length)
              );
              logger('Removing storage file:', storagePath);
              const { error: storageError } = await supabase.storage
                .from('plan-images')
                .remove([storagePath]);
              if (storageError) logger('⚠️ Storage cleanup failed:', storageError.message);
              else              logger('✅ Deleted image from storage:', storagePath);
            } else {
              logger('⚠️ Could not parse storage path from URL:', imageUrl);
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
        audit('create', 'plan_element', element.id, elementName, {
          eventAction: 'create_element',
          afterData:   { element_type: element.element_type, subtype: element.subtype, asset_id: element.asset_id, status: element.status }
        });
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
        const fields = Object.keys(updates).filter(k => k !== 'updated_by');
        audit('update', 'plan_element', element.id, elementName, {
          eventAction: 'update_element',
          beforeData:  pick(oldElement, fields),
          afterData:   pick(updates, fields)
        });
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
        let oldElement  = null;
        update(s => {
          oldElement = (s.elements[planId] || []).find(e => e.id === elementId);
          if (oldElement) elementName = oldElement.asset_id || oldElement.label || oldElement.element_type;
          return s;
        });

        await api.delete('plan_elements', elementId);
        logger('✅ Deleted element:', elementId);
        audit('delete', 'plan_element', elementId, elementName, {
          eventAction: 'delete_element',
          beforeData:  oldElement ? { element_type: oldElement.element_type, subtype: oldElement.subtype, asset_id: oldElement.asset_id, status: oldElement.status } : undefined
        });

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

    // Replace the image of a plan with a new file.
    // Always uploads to a NEW storage path so copied plans sharing the same
    // original file are not affected. The old file is deleted from storage.
    async replaceImage(plan, file) {
      logger('Replacing image for plan:', plan.id, file.name);
      try {
        // Upload to a fresh path (same as uploadImage — never overwrites shared files)
        const fileExt    = file.name.split('.').pop();
        const newPath    = `plans/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        logger('Uploading replacement to new path:', newPath);
        const { error: uploadError } = await supabase.storage
          .from('plan-images')
          .upload(newPath, file, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('plan-images').getPublicUrl(newPath);
        const newUrl = urlData.publicUrl;

        // Measure new image dimensions
        const dims = await this.getImageDimensions(newUrl);

        // Update this plan's record to point at the new file
        await this.updatePlan(plan.id, {
          image_url:    newUrl,
          image_width:  dims.width,
          image_height: dims.height
        });

        // Delete the old file — but only if no other plan shares it.
        // Check by scanning current plans in the store.
        let oldPlans = [];
        update(s => { oldPlans = s.plans; return s; });
        const oldUrl     = plan.image_url.split('?')[0]; // strip any ?t= param
        const stillUsed  = oldPlans.some(p => p.id !== plan.id && p.image_url.split('?')[0] === oldUrl);
        if (!stillUsed) {
          try {
            const marker    = '/plan-images/';
            const parsed    = new URL(plan.image_url);
            const markerIdx = parsed.pathname.indexOf(marker);
            if (markerIdx !== -1) {
              const oldPath = decodeURIComponent(parsed.pathname.slice(markerIdx + marker.length));
              await supabase.storage.from('plan-images').remove([oldPath]);
              logger('✅ Old image deleted from storage:', oldPath);
            }
          } catch (delErr) {
            logger('⚠️ Could not delete old image (non-fatal):', delErr.message);
          }
        } else {
          logger('ℹ Old image still used by another plan — not deleted');
        }

        logger('✅ Image replaced successfully:', newUrl);
        return { url: newUrl, width: dims.width, height: dims.height };
      } catch (error) {
        logger('❌ Error replacing image:', error.message);
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
