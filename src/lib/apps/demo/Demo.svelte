<!-- src/lib/apps/demo/Demo.svelte -->
<!-- Comprehensive Demo App - Shows all features, components, and utilities -->
<script>
  import { onMount } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import { formatDate, formatDateTime, isOverdue, wasModified } from '$lib/utils/dates';
  import { ACTION_STATUS, ACTION_STATUS_OPTIONS, UI_COLORS } from '$lib/utils/constants';
  import { sortActions } from '$lib/utils/actionSort';

  let activeSection = 'components';
  let showModal = false;
  let showConfirm = false;
  let confirmedFlash = false;
  let editingItem = null;
  let selectedTab = 'buttons';

  // Demo data
  let demoActions = [
    { id: 1, action_text: 'Complete documentation', status: 'in-progress', date_deadline: '2024-03-15', created_at: '2024-01-10', name_text: 'John Doe' },
    { id: 2, action_text: 'Review pull request', status: 'pending', date_deadline: '2024-02-20', created_at: '2024-01-12', name_text: 'Jane Smith' },
    { id: 3, action_text: 'Fix login bug', status: 'in-progress', date_deadline: null, created_at: '2024-01-05', name_text: 'Bob Johnson' },
    { id: 4, action_text: 'Deploy to staging', status: 'completed', date_deadline: '2024-02-10', created_at: '2024-01-08', name_text: null }
  ];

  $: sortedActions = sortActions(demoActions);

  const sections = [
    { id: 'components', name: 'Common Components', icon: 'cube' },
    { id: 'css', name: 'CSS Utilities', icon: 'paint' },
    { id: 'forms', name: 'Form Elements', icon: 'edit' },
    { id: 'data', name: 'Data Display', icon: 'table' },
    { id: 'interactive', name: 'Interactive Patterns', icon: 'cursor' },
    { id: 'utilities', name: 'Utilities & Helpers', icon: 'code' }
  ];

  function handleConfirm() {
    showConfirm = false;
    confirmedFlash = true;
    setTimeout(() => { confirmedFlash = false; }, 2000);
  }
</script>

<div class="min-h-screen bg-slate-900 text-white">
  <!-- Header -->
  <div class="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-6 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Icon name="cube" size={8} className="text-purple-400" />
          <div>
            <h1 class="text-2xl font-bold">Component Demo</h1>
            <p class="text-sm text-gray-400">Complete reference for building apps</p>
          </div>
        </div>
        <Badge variant="success">v1.0</Badge>
      </div>
    </div>
  </div>

  <div class="max-w-7xl mx-auto px-6 py-6">
    <div class="grid grid-cols-12 gap-6">
      <!-- Sidebar Navigation -->
      <div class="col-span-3">
        <div class="bg-slate-800/50 rounded-lg p-4 sticky top-24">
          <h3 class="text-sm font-semibold text-gray-400 uppercase mb-3">Sections</h3>
          <div class="space-y-1">
            {#each sections as section}
              <button
                on:click={() => activeSection = section.id}
                class="w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors {activeSection === section.id ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-slate-700'}"
              >
                <Icon name={section.icon} size={4} />
                <span>{section.name}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="col-span-9 space-y-6">
        
        <!-- Components Section -->
        {#if activeSection === 'components'}
          <div class="space-y-6">
            <div>
              <h2 class="text-2xl font-bold mb-2">Common Components</h2>
              <p class="text-gray-400">Reusable UI components available throughout the app</p>
            </div>

            <!-- Buttons -->
            <div class="card-info">
              <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
                <Icon name="cursor" size={5} className="text-blue-400" />
                Buttons
              </h3>
              
              <div class="section-spacing">
                <div>
                  <h4 class="font-semibold mb-2">Button Variants</h4>
                  <div class="btn-group-wrap">
                    <Button variant="primary" size="medium">Primary</Button>
                    <Button variant="secondary" size="medium">Secondary</Button>
                    <Button variant="danger" size="medium">Danger</Button>
                    <Button variant="success" size="medium">Success</Button>
                    <Button variant="amber" size="medium">Amber</Button>
                    <Button variant="blue" size="medium">Blue</Button>
                  </div>
                </div>

                <div>
                  <h4 class="font-semibold mb-2">Button Sizes</h4>
                  <div class="btn-group">
                    <Button variant="primary" size="small">Small</Button>
                    <Button variant="primary" size="medium">Medium</Button>
                    <Button variant="primary" size="large">Large</Button>
                  </div>
                </div>

                <div>
                  <h4 class="font-semibold mb-2">Buttons with Icons</h4>
                  <div class="btn-group-wrap">
                    <Button variant="primary" size="medium" icon="plus">Add Item</Button>
                    <Button variant="danger" size="medium" icon="delete">Delete</Button>
                    <Button variant="success" size="medium" icon="check">Save</Button>
                    <Button variant="secondary" size="medium" icon="edit" iconPosition="only" title="Edit" />
                  </div>
                </div>

                <div>
                  <h4 class="font-semibold mb-2">Protected Button (requires permission)</h4>
                  <ProtectedButton action="modify" variant="amber" size="medium" icon="lock">
                    Protected Action
                  </ProtectedButton>
                </div>
              </div>
            </div>

            <!-- Badges -->
            <div class="card-success">
              <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
                <Icon name="tag" size={5} className="text-green-400" />
                Badges
              </h3>
              
              <div class="section-spacing">
                <div>
                  <h4 class="font-semibold mb-2">Badge Variants</h4>
                  <div class="btn-group-wrap">
                    <Badge variant="primary">Primary</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                    <Badge variant="success">Success</Badge>
                    <Badge variant="warning">Warning</Badge>
                    <Badge variant="danger">Danger</Badge>
                    <Badge variant="info">Info</Badge>
                  </div>
                </div>

                <div>
                  <h4 class="font-semibold mb-2">Badges with Icons</h4>
                  <div class="btn-group-wrap">
                    <Badge variant="success" icon="✓">Completed</Badge>
                    <Badge variant="warning" icon="⚠️">Warning</Badge>
                    <Badge variant="danger" icon="❌">Error</Badge>
                    <Badge variant="info" icon="👤">Assigned</Badge>
                  </div>
                </div>

                <div>
                  <h4 class="font-semibold mb-2">Outline Badges</h4>
                  <div class="btn-group-wrap">
                    <Badge variant="primary" outline>Primary</Badge>
                    <Badge variant="success" outline>Success</Badge>
                    <Badge variant="danger" outline>Danger</Badge>
                  </div>
                </div>
              </div>
            </div>

            <!-- Icons -->
            <div class="bg-slate-800/50 rounded-lg p-6">
              <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
                <Icon name="star" size={5} className="text-amber-400" />
                Icons
              </h3>
              
              <div class="grid grid-cols-8 gap-4">
                {#each ['plus', 'edit', 'delete', 'check', 'close', 'user', 'users', 'home', 'settings', 'search', 'filter', 'download', 'upload', 'mail', 'bell', 'calendar'] as iconName}
                  <div class="flex flex-col items-center gap-2 p-3 bg-slate-700/50 rounded text-center">
                    <Icon name={iconName} size={6} className="text-gray-300" />
                    <span class="text-xs text-gray-400">{iconName}</span>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <!-- CSS Utilities Section -->
        {#if activeSection === 'css'}
          <div class="space-y-6">
            <div>
              <h2 class="text-2xl font-bold mb-2">CSS Utility Classes</h2>
              <p class="text-gray-400">Pre-built utility classes from app.css</p>
            </div>

            <!-- Flex Utilities -->
            <div class="card-info">
              <h3 class="text-xl font-bold mb-4">Flex Layout Utilities</h3>
              
              <div class="section-spacing">
                <div>
                  <h4 class="font-semibold mb-2">flex-row-sm (gap-1)</h4>
                  <div class="flex-row-sm bg-slate-700 p-3 rounded">
                    <div class="bg-purple-600 px-3 py-2 rounded">Item 1</div>
                    <div class="bg-purple-600 px-3 py-2 rounded">Item 2</div>
                    <div class="bg-purple-600 px-3 py-2 rounded">Item 3</div>
                  </div>
                </div>

                <div>
                  <h4 class="font-semibold mb-2">flex-row-md (gap-3)</h4>
                  <div class="flex-row-md bg-slate-700 p-3 rounded">
                    <div class="bg-blue-600 px-3 py-2 rounded">Item 1</div>
                    <div class="bg-blue-600 px-3 py-2 rounded">Item 2</div>
                    <div class="bg-blue-600 px-3 py-2 rounded">Item 3</div>
                  </div>
                </div>

                <div>
                  <h4 class="font-semibold mb-2">btn-group & btn-group-wrap</h4>
                  <div class="btn-group-wrap bg-slate-700 p-3 rounded">
                    <Button variant="primary" size="small">Button 1</Button>
                    <Button variant="primary" size="small">Button 2</Button>
                    <Button variant="primary" size="small">Button 3</Button>
                    <Button variant="primary" size="small">Button 4</Button>
                    <Button variant="primary" size="small">Button 5</Button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Pills -->
            <div class="bg-slate-800/50 rounded-lg p-6">
              <h3 class="text-xl font-bold mb-4">Pill Utilities</h3>
              
              <div class="flex flex-wrap gap-3">
                <div class="pill-purple">Purple Pill</div>
                <div class="pill-amber">Amber Pill</div>
                <div class="pill-slate">Slate Pill</div>
                <div class="pill-blue">Blue Pill</div>
                <div class="pill-red">Red Pill</div>
                <div class="pill-green">Green Pill</div>
              </div>
            </div>

            <!-- Badge Utilities -->
            <div class="bg-slate-800/50 rounded-lg p-6">
              <h3 class="text-xl font-bold mb-4">Badge Utilities</h3>
              
              <div class="flex flex-wrap gap-3">
                <div class="badge-amber">Amber Badge</div>
                <div class="badge-emerald">Emerald Badge</div>
                <div class="badge-blue">Blue Badge</div>
                <div class="badge-gray">Gray Badge</div>
              </div>
            </div>

            <!-- Card Variants -->
            <div class="section-spacing">
              <div class="card-info">
                <h4 class="font-semibold">card-info (Blue Info Card)</h4>
                <p class="text-sm mt-2">Use for informational content</p>
              </div>

              <div class="card-success">
                <h4 class="font-semibold">card-success (Green Success Card)</h4>
                <p class="text-sm mt-2">Use for success messages</p>
              </div>

              <div class="card-warning-light">
                <h4 class="font-semibold">card-warning-light (Amber Warning Card)</h4>
                <p class="text-sm mt-2">Use for warnings or important notices</p>
              </div>
            </div>

            <!-- Code Block -->
            <div class="bg-slate-800/50 rounded-lg p-6">
              <h3 class="text-xl font-bold mb-4">Code Block Utility</h3>
              <div class="code-block">
                <code>const greeting = "Hello World";</code>
                <code>console.log(greeting);</code>
              </div>
            </div>
          </div>
        {/if}

        <!-- Forms Section -->
        {#if activeSection === 'forms'}
          <div class="space-y-6">
            <div>
              <h2 class="text-2xl font-bold mb-2">Form Elements</h2>
              <p class="text-gray-400">Standard form inputs and patterns</p>
            </div>

            <div class="card-info">
              <h3 class="text-xl font-bold mb-4">Complete Form Example</h3>
              
              <form class="section-spacing" on:submit|preventDefault>
                <div>
                  <label for="demo-text" class="block text-sm font-medium mb-2">Text Input</label>
                  <input
                    id="demo-text"
                    type="text"
                    placeholder="Enter text..."
                    class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label for="demo-textarea" class="block text-sm font-medium mb-2">Textarea</label>
                  <textarea
                    id="demo-textarea"
                    rows="4"
                    placeholder="Enter longer text..."
                    class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  ></textarea>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label for="demo-select" class="block text-sm font-medium mb-2">Select</label>
                    <select
                      id="demo-select"
                      class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">-- Select option --</option>
                      <option value="1">Option 1</option>
                      <option value="2">Option 2</option>
                      <option value="3">Option 3</option>
                    </select>
                  </div>

                  <div>
                    <label for="demo-date" class="block text-sm font-medium mb-2">Date</label>
                    <input
                      id="demo-date"
                      type="date"
                      class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
                    />
                    <span class="text-sm">I agree to the terms and conditions</span>
                  </label>
                </div>

                <div class="btn-group">
                  <Button variant="primary" size="large" icon="check">Submit</Button>
                  <Button variant="secondary" size="large">Cancel</Button>
                </div>
              </form>
            </div>
          </div>
        {/if}

        <!-- Data Display Section -->
        {#if activeSection === 'data'}
          <div class="space-y-6">
            <div>
              <h2 class="text-2xl font-bold mb-2">Data Display</h2>
              <p class="text-gray-400">Patterns for showing data</p>
            </div>

            <!-- Sorted Actions Demo -->
            <div class="card-success">
              <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
                <Icon name="clipboard" size={5} className="text-green-400" />
                Sorted Actions (Using sortActions utility)
              </h3>
              
              <p class="text-sm text-gray-300 mb-4">
                Actions are sorted by: Status (in-progress → pending → completed) → Deadline (earliest first) → Created date
              </p>

              <div class="space-y-2">
                {#each sortedActions as action}
                  <div class="bg-slate-700/50 rounded p-3 border-l-2 {action.status === 'completed' ? 'border-green-500' : action.status === 'in-progress' ? 'border-purple-500' : 'border-blue-500'}">
                    <div class="flex justify-between items-start">
                      <div class="flex-1">
                        <p class="font-medium {action.status === 'completed' ? 'line-through opacity-60' : ''}">
                          {action.action_text}
                        </p>
                        <div class="flex flex-wrap gap-2 mt-2">
                          {#if action.name_text}
                            <Badge variant="info" icon="👤" outline>{action.name_text}</Badge>
                          {/if}
                          {#if action.date_deadline}
                            <Badge variant={isOverdue(action.date_deadline) ? 'danger' : 'warning'} icon="📅" outline>
                              {formatDate(action.date_deadline)}
                            </Badge>
                          {/if}
                          <Badge 
                            variant={action.status === 'completed' ? 'success' : action.status === 'in-progress' ? 'primary' : 'info'}
                            outline
                          >
                            {action.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Table Example -->
            <div class="bg-slate-800/50 rounded-lg p-6 overflow-x-auto">
              <h3 class="text-xl font-bold mb-4">Table Display</h3>
              
              <table class="w-full">
                <thead>
                  <tr class="border-b border-slate-700">
                    <th class="text-left py-3 px-4 font-semibold">Name</th>
                    <th class="text-left py-3 px-4 font-semibold">Status</th>
                    <th class="text-left py-3 px-4 font-semibold">Priority</th>
                    <th class="text-left py-3 px-4 font-semibold">Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td class="py-3 px-4">Task Alpha</td>
                    <td class="py-3 px-4"><Badge variant="success">Complete</Badge></td>
                    <td class="py-3 px-4"><Badge variant="danger">High</Badge></td>
                    <td class="py-3 px-4">2024-02-15</td>
                  </tr>
                  <tr class="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td class="py-3 px-4">Task Beta</td>
                    <td class="py-3 px-4"><Badge variant="warning">Pending</Badge></td>
                    <td class="py-3 px-4"><Badge variant="warning">Medium</Badge></td>
                    <td class="py-3 px-4">2024-02-20</td>
                  </tr>
                  <tr class="hover:bg-slate-700/30">
                    <td class="py-3 px-4">Task Gamma</td>
                    <td class="py-3 px-4"><Badge variant="info">In Progress</Badge></td>
                    <td class="py-3 px-4"><Badge variant="secondary">Low</Badge></td>
                    <td class="py-3 px-4">2024-03-01</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        {/if}

        <!-- Interactive Patterns Section -->
        {#if activeSection === 'interactive'}
          <div class="space-y-6">
            <div>
              <h2 class="text-2xl font-bold mb-2">Interactive Patterns</h2>
              <p class="text-gray-400">Common interaction patterns</p>
            </div>

            <div class="card-info">
              <h3 class="text-xl font-bold mb-4">Modal Dialog</h3>
              <p class="mb-4">Click the button to see a modal dialog example</p>
              <Button variant="primary" size="medium" icon="plus" on:click={() => showModal = true}>
                Open Modal
              </Button>
            </div>

            <div class="bg-slate-800/50 rounded-lg p-6">
              <h3 class="text-xl font-bold mb-4">Confirm Dialog</h3>
              <p class="mb-4">Click the button to see a confirmation dialog</p>
              <Button variant="danger" size="medium" icon="delete" on:click={() => showConfirm = true}>
                Delete Item
              </Button>
              {#if confirmedFlash}
                <p class="mt-3 text-sm text-green-400">✅ Action confirmed!</p>
              {/if}
            </div>

            <div class="bg-slate-800/50 rounded-lg p-6">
              <h3 class="text-xl font-bold mb-4">Toggle States</h3>
              <div class="space-y-3">
                <Button 
                  variant="secondary" 
                  size="medium" 
                  on:click={() => editingItem = editingItem === 1 ? null : 1}
                >
                  {editingItem === 1 ? 'Cancel Edit' : 'Edit Item'}
                </Button>
                
                {#if editingItem === 1}
                  <div class="card-warning-light">
                    <h4 class="font-semibold mb-2">Edit Mode Active</h4>
                    <p class="text-sm">This content appears when editing is enabled</p>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/if}

        <!-- Utilities Section -->
        {#if activeSection === 'utilities'}
          <div class="space-y-6">
            <div>
              <h2 class="text-2xl font-bold mb-2">Utilities & Helpers</h2>
              <p class="text-gray-400">Utility functions and constants</p>
            </div>

            <div class="card-info">
              <h3 class="text-xl font-bold mb-4">Date Utilities</h3>
              
              <div class="section-spacing">
                <div class="code-block">
                  <code>formatDate('2024-02-15') → {formatDate('2024-02-15')}</code>
                  <code>formatDateTime('2024-02-15T10:30:00', 'John Doe') → {formatDateTime('2024-02-15T10:30:00', 'John Doe')}</code>
                  <code>isOverdue('2024-01-01') → {isOverdue('2024-01-01')}</code>
                  <code>wasModified('2024-01-01', '2024-01-05') → {wasModified('2024-01-01', '2024-01-05')}</code>
                </div>
              </div>
            </div>

            <div class="bg-slate-800/50 rounded-lg p-6">
              <h3 class="text-xl font-bold mb-4">Action Status Constants</h3>
              
              <div class="code-block">
                <code>ACTION_STATUS.PENDING → {ACTION_STATUS.PENDING}</code>
                <code>ACTION_STATUS.IN_PROGRESS → {ACTION_STATUS.IN_PROGRESS}</code>
                <code>ACTION_STATUS.COMPLETED → {ACTION_STATUS.COMPLETED}</code>
              </div>
            </div>

            <div class="bg-slate-800/50 rounded-lg p-6">
              <h3 class="text-xl font-bold mb-4">Action Sorting</h3>
              
              <p class="mb-3 text-sm">
                The <code class="px-2 py-1 bg-slate-700 rounded text-purple-400">sortActions()</code> utility sorts actions by:
              </p>
              
              <ol class="list-decimal list-inside space-y-2 text-sm text-gray-300 ml-4">
                <li>Status (in-progress → pending → completed)</li>
                <li>Deadline (earliest first, no deadline last)</li>
                <li>Created date (earliest first)</li>
              </ol>

              <div class="mt-4 code-block">
                <code>import &#123; sortActions &#125; from '$lib/utils/actionSort';</code>
                <code>$: sortedActions = sortActions(actions);</code>
              </div>
            </div>
          </div>
        {/if}

      </div>
    </div>
  </div>
</div>

<!-- Modal Example -->
{#if showModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-slate-800 rounded-lg p-6 max-w-lg w-full border border-slate-700">
      <h3 class="text-xl font-bold mb-4">Example Modal</h3>
      <p class="mb-4">This is an example of a modal dialog. You can put any content here.</p>
      <div class="space-y-3">
        <input
          type="text"
          placeholder="Enter something..."
          class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <div class="btn-group justify-end">
          <Button variant="secondary" size="medium" on:click={() => showModal = false}>
            Cancel
          </Button>
          <Button variant="primary" size="medium" on:click={() => showModal = false}>
            Save
          </Button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Confirm Dialog -->
<ConfirmDialog
  show={showConfirm}
  title="Delete Item"
  message="Are you sure you want to delete this item? This action cannot be undone."
  confirmText="Delete"
  cancelText="Cancel"
  danger={true}
  on:confirm={handleConfirm}
  on:cancel={() => showConfirm = false}
/>
