<!-- src/lib/components/reports/ReportFilters.svelte -->
<script>
  import { getFilterSummary, getTodayDate } from './reportUtils';

  export let includeCurrent;
  export let includeParked;
  export let includeCompleted;
  export let filterDate;
  export let onPrint;
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
        <label class="flex items-center gap-2 cursor-pointer">
          <input 
            type="checkbox" 
            bind:checked={includeCurrent} 
            class="w-4 h-4 rounded border-gray-400 text-blue-600 focus:ring-blue-500"
          />
          <span>Current</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input 
            type="checkbox" 
            bind:checked={includeParked} 
            class="w-4 h-4 rounded border-gray-400 text-amber-600 focus:ring-amber-500"
          />
          <span>Parked</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input 
            type="checkbox" 
            bind:checked={includeCompleted} 
            class="w-4 h-4 rounded border-gray-400 text-green-600 focus:ring-green-500"
          />
          <span>Completed</span>
        </label>
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
        <button 
          on:click={clearDateFilter} 
          class="px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs" 
          title="Clear date filter"
        >
          Clear
        </button>
      </div>
    </div>
  </div>
  
  <!-- Action Buttons -->
  <div class="flex space-x-2">
    <button 
      on:click={onPrint} 
      class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2" 
      title="In the print dialog, select 'Save as PDF' as the destination"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
      </svg>
      Save as PDF
    </button>
    <button 
      on:click={onClose} 
      class="p-2 hover:bg-slate-700 rounded"
    >
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </button>
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
