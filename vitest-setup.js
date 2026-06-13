// vitest-setup.js
// Registers @testing-library/jest-dom matchers (toBeInTheDocument,
// toBeVisible, toBeDisabled, …) for component tests. Harmless for the
// node-environment pure tests — the matchers are only evaluated when used.
import '@testing-library/jest-dom/vitest';
