<!-- src/lib/apps/admin/components/DriveUnnamedPanel.svelte -->
<!-- Files in the portal's Drive folder that nothing in the portal names, and
     folders with nothing in them (2026-11-09). The other half of Check files:
     that asks whether each record's file still exists; this asks whether each
     file still has a record. It changes nothing.

     "Open in Drive" goes to Google's own page, deliberately: the portal's file
     proxy serves only files a record names, and these by definition have none.
     Google lets in only someone signed in to the account that holds the folder. -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import { getJson } from '#lib/utils/request.js';
  import { formatFileSize } from '#lib/utils/documentUtils.js';
  import { fmtDate, fmtTime } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';

  /** @type {any} */
  let result = null;
  let running = false;
  let error = '';

  async function compare() {
    running = true; error = '';
    try { result = await getJson('/api/documents/drive-unnamed', 'Drive could not be compared.'); }
    catch (/** @type {any} */ err) { error = errMessage(err); }
    finally { running = false; }
  }

  const driveFile = (/** @type {string} */ id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
  const driveFolder = (/** @type {string} */ id) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
</script>

<section class="space-y-3 border border-slate-700 rounded-lg p-4" data-testid="drive-unnamed">
  <div class="flex flex-wrap items-center gap-3">
    <h3 class="text-sm font-semibold text-slate-200">Files in Drive that nothing names</h3>
    <Button variant="secondary" size="small" disabled={running} on:click={compare}>
      {running ? 'Comparing with Drive…' : result ? 'Compare again' : 'Compare with Drive'}
    </Button>
  </div>
  <p class="text-xs text-slate-400">
    Lists every file in the portal's Drive folder that no document, photo, maintenance record or
    published pack names, and every folder with no file in it. These are what is left behind when
    something is deleted. Nothing is changed. A file uploaded in the last minute or so may show here
    until its record is written.
  </p>

  <ErrorDisplay message={error} onDismiss={() => (error = '')} />

  {#if result}
    <p class="text-sm text-slate-300" data-testid="drive-totals">
      In Drive: {result.totals.files} files ({formatFileSize(result.totals.bytes)}) in {result.totals.folders} folders ·
      named by the portal: {result.totals.named} ({formatFileSize(result.totals.namedBytes)}) ·
      <span class={result.totals.unnamed ? 'text-amber-300' : 'text-green-400'}>
        nothing names {result.totals.unnamed}{result.totals.unnamed ? ` (${formatFileSize(result.totals.unnamedBytes)})` : ''}</span> ·
      <span class={result.totals.emptyFolders ? 'text-amber-300' : 'text-green-400'}>{result.totals.emptyFolders} empty folders</span>
      <span class="text-slate-500">· compared at {fmtTime(result.checkedAt)}</span>
    </p>
    {#if result.truncated}
      <p class="text-sm text-red-300">⚠ Drive holds more than could be listed in one go, so this is not the whole folder.</p>
    {/if}

    {#if result.unnamed.length}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-slate-400 border-b border-slate-700">
              <th class="pb-2 pr-4 font-medium">Where in Drive</th>
              <th class="pb-2 pr-4 font-medium">Size</th>
              <th class="pb-2 pr-4 font-medium">Changed</th>
              <th class="pb-2 font-medium"><span class="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {#each result.unnamed as f (f.fileId)}
              <tr class="border-b border-slate-800">
                <td class="py-1.5 pr-4 text-slate-200 break-all">{f.path}</td>
                <td class="py-1.5 pr-4 text-slate-400 whitespace-nowrap">{formatFileSize(f.size)}</td>
                <td class="py-1.5 pr-4 text-slate-400 whitespace-nowrap">{f.modifiedAt ? fmtDate(f.modifiedAt) : '—'}</td>
                <td class="py-1.5 whitespace-nowrap">
                  <a class="text-xs text-teal-300 hover:underline" href={driveFile(f.fileId)} target="_blank" rel="noopener noreferrer">Open in Drive ↗</a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    {#if result.emptyFolders.length}
      <details>
        <summary class="cursor-pointer text-sm text-slate-300">Empty folders ({result.emptyFolders.length})</summary>
        <ul class="mt-2 space-y-1 text-sm">
          {#each result.emptyFolders as f (f.fileId)}
            <li class="flex flex-wrap gap-3">
              <span class="text-slate-300 break-all">{f.path}</span>
              <a class="text-xs text-teal-300 hover:underline" href={driveFolder(f.fileId)} target="_blank" rel="noopener noreferrer">Open in Drive ↗</a>
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  {/if}
</section>
