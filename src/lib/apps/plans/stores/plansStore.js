// src/lib/apps/plans/stores/plansStore.js
// State management for Plans app

import { writable } from 'svelte/store';
import { getLogger } from '$lib/utils/logger';
import { api } from '$lib/utils/api';
import { supabase } from '$lib/supabaseClient';

const logger = getLogger('plansStore');

function createPlansStore() {
  const { subscribe, set, update } = writable({
    plans: [],
    elements: {}, // Keyed by plan_id
    loading: false,
    error: null
  });

  return {
    subscribe,

    /**
     * Load all floor plans
     */
    async loadPlans() {
      logger('Loading plans...');
      update(state => ({ ...state, loading: true, error: null }));

      try {
        const plans = await api.get('plans', {
          select: '*, created_by_profile:profiles!created_by(full_name), updated_by_profile:profiles!updated_by(full_name)',
          orderBy: 'created_at',
          ascending: false
        });

        logger('✅ Loaded plans:', plans.length);
        update(state => ({ ...state, plans, loading: false }));
        
        return plans;
      } catch (error) {
        logger('❌ Error loading plans:', error.message);
        update(state => ({ ...state, error: error.message, loading: false }));
        throw error;
      }
    },

    /**
     * Load elements for a specific plan
     */
    async loadElements(planId) {
      logger('Loading elements for plan:', planId);

      try {
        const elements = await api.get('plan_elements', {
          filters: { plan_id: planId },
          select: '*, created_by_profile:profiles!created_by(full_name), updated_by_profile:profiles!updated_by(full_name)',
          orderBy: 'created_at',
          ascending: false
        });

        logger('✅ Loaded elements:', elements.length);
        
        update(state => ({
          ...state,
          elements: {
            ...state.elements,
            [planId]: elements
          }
        }));

        return elements;
      } catch (error) {
        logger('❌ Error loading elements:', error.message);
        throw error;
      }
    },

    /**
     * Create a new floor plan
     */
    async createPlan(planData) {
      logger('Creating plan:', planData.name);

      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        
        const plan = await api.create('plans', {
          ...planData,
          created_by: user.id,
          updated_by: user.id
        });
        
        logger('✅ Created plan:', plan.id);
        
        // Add to store
        update(state => ({
          ...state,
          plans: [plan, ...state.plans]
        }));

        return plan;
      } catch (error) {
        logger('❌ Error creating plan:', error.message);
        throw error;
      }
    },

    /**
     * Update a floor plan
     */
    async updatePlan(planId, updates) {
      logger('Updating plan:', planId);

      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        
        const plan = await api.update('plans', planId, {
          ...updates,
          updated_by: user.id
        });
        
        logger('✅ Updated plan:', plan.id);
        
        // Update in store
        update(state => ({
          ...state,
          plans: state.plans.map(p => p.id === planId ? plan : p)
        }));

        return plan;
      } catch (error) {
        logger('❌ Error updating plan:', error.message);
        throw error;
      }
    },

    /**
     * Delete a floor plan
     */
    async deletePlan(planId) {
      logger('Deleting plan:', planId);

      try {
        await api.delete('plans', planId);
        
        logger('✅ Deleted plan:', planId);
        
        // Remove from store
        update(state => ({
          ...state,
          plans: state.plans.filter(p => p.id !== planId),
          elements: Object.fromEntries(
            Object.entries(state.elements).filter(([key]) => key !== planId)
          )
        }));
      } catch (error) {
        logger('❌ Error deleting plan:', error.message);
        throw error;
      }
    },

    /**
     * Create a new element on a plan
     */
    async createElement(planId, elementData) {
      logger('Creating element:', elementData.name);

      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        
        const element = await api.create('plan_elements', {
          ...elementData,
          plan_id: planId,
          created_by: user.id,
          updated_by: user.id
        });

        logger('✅ Created element:', element.id);

        // Add to store
        update(state => ({
          ...state,
          elements: {
            ...state.elements,
            [planId]: [element, ...(state.elements[planId] || [])]
          }
        }));

        return element;
      } catch (error) {
        logger('❌ Error creating element:', error.message);
        throw error;
      }
    },

    /**
     * Update an element
     */
    async updateElement(elementId, updates) {
      logger('Updating element:', elementId);

      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        
        const element = await api.update('plan_elements', elementId, {
          ...updates,
          updated_by: user.id
        });
        
        logger('✅ Updated element:', element.id);

        // Update in store
        update(state => {
          const planId = element.plan_id;
          return {
            ...state,
            elements: {
              ...state.elements,
              [planId]: (state.elements[planId] || []).map(e => 
                e.id === elementId ? element : e
              )
            }
          };
        });

        return element;
      } catch (error) {
        logger('❌ Error updating element:', error.message);
        throw error;
      }
    },

    /**
     * Delete an element
     */
    async deleteElement(elementId, planId) {
      logger('Deleting element:', elementId);

      try {
        await api.delete('plan_elements', elementId);
        
        logger('✅ Deleted element:', elementId);

        // Remove from store
        update(state => ({
          ...state,
          elements: {
            ...state.elements,
            [planId]: (state.elements[planId] || []).filter(e => e.id !== elementId)
          }
        }));
      } catch (error) {
        logger('❌ Error deleting element:', error.message);
        throw error;
      }
    },

    /**
     * Upload an image to Supabase Storage
     */
    async uploadImage(file) {
      logger('Uploading image:', file.name, 'Size:', (file.size / 1024 / 1024).toFixed(2), 'MB');

      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `plans/${fileName}`;

        logger('Uploading to path:', filePath);

        const { data, error } = await supabase.storage
          .from('plan-images')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) {
          logger('❌ Upload error:', error.message);
          throw error;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('plan-images')
          .getPublicUrl(filePath);

        logger('✅ Uploaded image:', urlData.publicUrl);

        return {
          url: urlData.publicUrl,
          path: filePath
        };
      } catch (error) {
        logger('❌ Error uploading image:', error.message);
        throw error;
      }
    },

    /**
     * Get image dimensions
     */
    async getImageDimensions(imageUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          logger('Image dimensions:', img.width, 'x', img.height);
          resolve({ width: img.width, height: img.height });
        };
        img.onerror = () => {
          reject(new Error('Failed to load image'));
        };
        img.src = imageUrl;
      });
    }
  };
}

export const plansStore = createPlansStore();
