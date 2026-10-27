import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SECTION_GROUPS, SCREEN_IDS as SECTION_IDS, NEEDS_BUILDING_DATA, leavesOf, sectionOf } from './adminSections.js';

const shell = readFileSync('src/lib/apps/admin/AdminApp.svelte', 'utf8');

describe('Admin sections', () => {
  it('lists each section once', () => {
    expect(new Set(SECTION_IDS).size).toBe(SECTION_IDS.length);
  });

  it('every section the list offers is rendered by the shell, so none is a dead link', () => {
    const rendered = new Set([...shell.matchAll(/activeTab === '([a-z-]+)'/g)].map((m) => m[1]));
    for (const id of SECTION_IDS) expect(rendered, `no content for "${id}"`).toContain(id);
  });

  it('the shell renders nothing the list does not offer, so none is unreachable', () => {
    const rendered = [...shell.matchAll(/activeTab === '([a-z-]+)'/g)].map((m) => m[1]);
    for (const id of rendered) expect(SECTION_IDS, `"${id}" cannot be reached`).toContain(id);
  });

  it('only Users is open to a non-admin', () => {
    const open = SECTION_GROUPS.flatMap((g) => g.sections).filter((s) => !s.adminOnly).map((s) => s.id);
    expect(open).toEqual(['users']);
  });

  it('the sections that read the type hierarchy are real sections', () => {
    for (const id of NEEDS_BUILDING_DATA) expect(SECTION_IDS).toContain(id);
  });

  it('keeps every group non-empty and labelled', () => {
    for (const g of SECTION_GROUPS) {
      expect(g.label).toBeTruthy();
      expect(g.sections.length).toBeGreaterThan(0);
    }
  });

  it('every screen belongs to exactly one section, and a section opens on a real screen', () => {
    for (const id of SECTION_IDS) expect(sectionOf(id), id).toBeTruthy();
    for (const g of SECTION_GROUPS) for (const s of g.sections) {
      expect(leavesOf(s).length).toBeGreaterThan(0);
      for (const l of leavesOf(s)) expect(sectionOf(l.id)).toBe(s);
    }
  });
});
