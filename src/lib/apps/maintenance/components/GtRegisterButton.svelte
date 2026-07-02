<!-- src/lib/apps/maintenance/components/GtRegisterButton.svelte -->
<!-- Register a maintenance certificate into the Golden Thread register (Stage B).
     Shows the GT reference once registered, or a Register action for editors on
     documents that live in document_library (library_doc_id set). Shared by the
     per-job list (DocumentUpload) and the global Documents tab. -->
<script>
  import { onMount } from 'svelte';
  import { auth }        from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { logAudit }    from '$lib/utils/auditLogger';
  import {
    registerCertificateToGoldenThread, findRegisteredCertificate,
  } from '../public.js';

  export let doc; // maintenance_document row

  /** @type {{ id: string, reference: string } | null} */
  let registered = null;
  let checking    = true;
  let registering = false;
  let error       = '';

  $: canEdit = $permissions.isAdmin || $permissions.canModify;

  onMount(async () => {
    try { registered = await findRegisteredCertificate(doc.id); }
    catch { /* treat as not registered */ }
    finally { checking = false; }
  });

  async function register() {
    registering = true;
    error = '';
    try {
      const gt = await registerCertificateToGoldenThread(doc.id, {}, $auth.user?.id);
      registered = { id: gt.id, reference: gt.reference };
      logAudit('create', 'gt_document', gt.id, gt.title, {
        appId: 'maintenance', eventCategory: 'golden_thread', severity: 'info',
        afterData: { producedBy: 'maintenance_document', maintenance_document_id: doc.id },
      });
    } catch (e) {
      error = e.message;
    } finally {
      registering = false;
    }
  }
</script>

{#if registered}
  <span class="text-xs text-emerald-400 whitespace-nowrap" title="Registered in the Golden Thread">
    ✓ {registered.reference}
  </span>
{:else if !checking && canEdit && doc.library_doc_id}
  <button
    type="button"
    on:click={register}
    disabled={registering}
    class="text-xs text-purple-300 hover:text-purple-200 disabled:opacity-50 whitespace-nowrap"
    title="Register this certificate in the Golden Thread"
  >{registering ? 'Registering…' : '↗ Register to GT'}</button>
{/if}
{#if error}<span class="text-xs text-red-400">{error}</span>{/if}
