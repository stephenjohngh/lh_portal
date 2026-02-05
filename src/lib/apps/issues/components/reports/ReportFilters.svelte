<!-- src/lib/components/reports/ReportFilters.svelte -->
<script>
  import Button from '$lib/components/common/Button.svelte';
  import Checkbox from '$lib/components/common/Checkbox.svelte';
  import { getFilterSummary, getTodayDate } from './reportUtils';

  export let includeCurrent;
  export let includeParked;
  export let includeCompleted;
  export let filterDate;
  export let onDownloadWord;
  export let onClose;

  function clearDateFilter() {
    filterDate = '';
  }
</script>

<div class="flex justify-between items-center p-6 border-b border-gray-300 print:hidden bg-slate-800 text-white rounded-t-lg">
  <div>
    <h2 class="text-2xl font-bold mb-3">Issues Report</h2>
    <div class="flex flex-col gap-3">
      <!-- Status Checkboxes -->
      <div class="flex gap-4 text-sm">
        <Checkbox bind:checked={includeCurrent} color="blue" label="Current" />
        <Checkbox bind:checked={includeParked} color="purple" label="Parked" />
        <Checkbox bind:checked={includeCompleted} color="green" label="Completed" />
      </div>
      
      <!-- Date Filter -->
      <div class="flex items-center gap-2 text-sm">
        <label for="filter-date" class="whitespace-nowrap">Changes since:</label>
        <input 
          id="filter-date" 
          type="date" 
          bind:value={filterDate} 
          class="px-3 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
        />
        <Button
          variant="secondary"
          size="small"
          on:click={clearDateFilter}
          title="Clear date filter"
        >
          Clear
        </Button>
      </div>
    </div>
  </div>
  
  <!-- Action Buttons -->
  <div class="flex space-x-2">
    <Button
      variant="primary"
      size="large"
      icon="download"
      on:click={onDownloadWord}
      title="Download as Word document (.docx)"
    >
      Download
    </Button>
    <Button
      variant="secondary"
      size="medium"
      icon="close"
      iconPosition="only"
      on:click={onClose}
      title="Close report"
    />
  </div>
</div>

<!-- Print Header (only visible when printing) -->
<div class="hidden print:block mb-8 p-8">
  <h1 class="text-3xl font-bold text-gray-900 mb-2">Issues Report</h1>
  <p class="text-gray-600">Generated: {getTodayDate()}</p>
  <p class="text-gray-600 text-sm mt-1">
    {getFilterSummary(includeCurrent, includeParked, includeCompleted, filterDate)}
  </p>
  <div class="border-b-2 border-gray-300 mt-4"></div>
</div>
