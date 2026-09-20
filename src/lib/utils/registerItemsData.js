// src/lib/utils/registerItemsData.js
//
// The register's rows that are NOT periodic duties: the outstanding actions,
// the reasoned absences, and the caveats about what the list does not claim.
//
// ⭐ WHERE THESE CAME FROM, AND WHY THEY ARE ROWS NOW. All of this was prose in
// the obligations statement — §5, §7 and §8 — wrapped round the register in a
// Word document. It was never prose in substance: it was three lists written as
// paragraphs. A list written as prose cannot be filtered, counted, assigned or
// handed to the person who must act on it, and it decays in silence: four of
// that document’s own tallies went stale because they were sentences about a
// table rather than queries over it.
//
// ⭐ AND THE A/D/H NUMBERING WAS NEVER A DISTINCTION. The statement numbered its
// actions A1–A23, the delivery plan D1–D19 and the human backlog H1–H7 — and the
// delivery plan’s own §3 already listed A1, D19, D1, A17, A18 and D2 in one
// table. One kind of thing, three numbering origins. The refs are kept because
// people and documents cite them; the real division is `category` — WHO MUST
// ACT — which is how the delivery plan was already organised.
//
// ⛔ OWNER, TECHNICAL AUTHORITY AND DUE DATE ARE DELIBERATELY EMPTY. They are
// facts about this building’s arrangements, and filling them with plausible
// names would defeat the purpose — an unassigned action with a blank owner is
// conspicuous every time the list is produced, where a paragraph is not.
// `consequence` IS filled in, because that is the half we can assess and the
// half that decides the order.
//
// ⚠ THE FILE USES THE TYPOGRAPHIC APOSTROPHE (’) THROUGHOUT, like
// `statutoryRegisterData.js`, and for the same reason: a straight apostrophe
// inside a single-quoted string once broke sixteen rows at once.

/** @typedef {import('./registerKinds.js').RegisterKind} RegisterKind */

/** An outstanding action. Owner/authority/due stay null — see the header. */
const action = (key, o) => ({
  key,
  kind: /** @type {RegisterKind} */ ('action'),
  name: o.name,
  description: o.description ?? '',
  category: o.category,
  priority: o.priority,
  unblocks: o.unblocks ?? '',
  consequence: o.consequence,
  sortOrder: o.sortOrder ?? 0,
});

/** A duty a reader would expect to find, and why it is not here. */
const absence = (key, o) => ({
  key, kind: /** @type {RegisterKind} */ ('absence'),
  name: o.name, description: o.description, sortOrder: o.sortOrder ?? 0,
});

/** A limit on what the register asserts. */
const caveat = (key, o) => ({
  key, kind: /** @type {RegisterKind} */ ('caveat'),
  name: o.name, description: o.description, sortOrder: o.sortOrder ?? 0,
});

// ── Decisions only the duty holder can make ──────────────────────────────────
// Nobody else can take these. They are not technical questions with right
// answers; they are choices about how this building is run.

const DUTY_HOLDER = [
  action('a1', {
    category: 'duty_holder_decision', priority: 'critical', sortOrder: 10,
    name: 'Determine and formally approve the building’s evacuation strategy',
    description:
      'And with it the relationship between the common-parts alarm, alarm coverage within ' +
      'dwellings, the instructions given to residents, the simultaneous-evacuation assumption, ' +
      'and the building emergency evacuation plan. ⭐ The operative question is not “what ' +
      'strategy do we have?” but “does the installed alarm arrangement actually support the ' +
      'strategy being relied upon?” The record must carry the approval itself — who adopted the ' +
      'strategy, on what evidence and when — and the relationship between the strategy, the fire ' +
      'risk assessment and the safety case.',
    unblocks:
      'The building emergency evacuation plan · the resident instructions · two interim-measure rows.',
    consequence:
      '⛔ A statutory deliverable is blocked, not delayed. SI 2025/797 reg 13(2) requires the plan ' +
      'to contain the instructions to residents relating to the evacuation strategy, and FSER ' +
      'reg 9 requires residents to be told the same thing; neither can be written until the ' +
      'strategy is settled. The building is described as not operating stay-put while the alarm ' +
      'is described as covering the COMMON PARTS — which is the stay-put arrangement. If those do ' +
      'not match, residents are relying on an evacuation that nothing initiates for them. ' +
      '⛔ Do not treat the plan as signed off merely because the 2025 paperwork exists: a plan can ' +
      'satisfy reg 13 in form and still record a strategy the building cannot deliver. ' +
      '⛔ Nor is an absent plan acceptable because the strategy is “under review”.',
  }),
  action('d19', {
    category: 'duty_holder_decision', priority: 'critical', sortOrder: 20,
    name: 'Establish and record WHO THE RESPONSIBLE PERSON IS under the Fire Safety Order',
    description:
      'And exchange the article 22 particulars. ⭐ Art 22(A1) requires each responsible person to ' +
      'take such steps as are reasonably practicable to ASCERTAIN whether another shares or has ' +
      'duties in respect of the premises — so an unanswered question is a contravention rather ' +
      'than a neutral state. ⚠ And art 5(3)–(4) distribute duty by CONTROL, not appointment: a ' +
      'party with a contractual maintenance, repair or safety obligation is treated as having ' +
      'control and bears arts 8–22B duties to that extent, which no agreement can reallocate. ' +
      'The document to hand over is the Responsible Person interface.',
    unblocks:
      'Allocation of 45 register rows · the art 22(1)(zb) record · who is answerable for every ' +
      'fire door, alarm, lighting and compartmentation entry.',
    consequence:
      '⛔ The single largest block of duties in this register has no named holder. Those rows ' +
      'cannot read as compliant, an inspector asks this first, and the failure to ascertain is ' +
      'itself the breach.',
  }),
  action('d1', {
    category: 'duty_holder_decision', priority: 'critical', sortOrder: 30,
    name: 'Record the outstanding applicability decisions',
    description:
      'The rows that are conditional and not true today: mechanical stair smoke control · ' +
      'corridor smoke control · car park mechanical ventilation · evacuation alert system · ' +
      'EV charging equipment · the firefighting lift weekly test. Each needs a reason, a name ' +
      'and a review date.',
    unblocks: 'Those rows stop reading as gaps and start reading as decisions.',
    consequence:
      'Until they are recorded, those rows report as UNMANAGED — which is the opposite of what ' +
      'holding them was for. The register was built so an absence could be shown as considered; ' +
      'the decision is the half only a person can supply.',
  }),
  action('a17', {
    category: 'duty_holder_decision', priority: 'medium', sortOrder: 40,
    name: 'Rationalise the stair and escape route controls',
    description:
      'Rather than merely justifying their frequencies. For each of the daily stair walk, the ' +
      'weekly lobby-to-stair door check, the weekly stair lighting check, the escape route ' +
      'obstruction check and the quarterly statutory fire door round: the failure mode it ' +
      'addresses, why that frequency, and whether another control already covers it.',
    unblocks: 'Removes duplication across five overlapping controls on one route.',
    consequence:
      'The daily walk’s original justification has gone — it was set for a single unventilated ' +
      'route, and there are two ventilated ones. Its likely real reason (obstruction and ' +
      'combustible storage, which accumulates daily regardless of ventilation) may already be the ' +
      'escape-route obstruction row written twice. ⭐ Reducing frequencies is not the answer; ' +
      'eliminating duplication is.',
  }),
  action('a18', {
    category: 'duty_holder_decision', priority: 'medium', sortOrder: 50,
    name: 'Whether annual portable appliance testing rests on any risk judgement here',
    description:
      'For these appliances in this environment — and the per-row retention basis beyond ' +
      '“internal policy”: statutory, regulator guidance, contract or policy.',
    unblocks: 'Closes the last two “ours by habit” items.',
    consequence:
      'HSE is explicit that there is no legal requirement to test portable appliances, nor to do ' +
      'so annually; the row is classed as our own decision, which is what it has always been. ' +
      'Retention is currently one policy number standing in for six kinds of record that age ' +
      'differently.',
  }),
  action('d2', {
    category: 'duty_holder_decision', priority: 'medium', sortOrder: 60,
    name: 'Who fills the blank competence lines',
    description:
      'And whether a house standard covers the governance rows.',
    unblocks: 'Auditability of the non-statutory assurance checks.',
    consequence:
      '⚠ The blanks are NOT all governance rows — the roof and façade check and drainage ' +
      'clearance are among them. Treat a missing competence line as unanswered, never as ' +
      '“anyone”.',
  }),
];

// ── Technical determinations needing a competent person ──────────────────────
// ⚠ A guess here would be indistinguishable afterwards from a determination,
// which is why none of these has been resolved inside the register.

const TECHNICAL = [
  action('a2', {
    category: 'technical_determination', priority: 'critical', sortOrder: 10,
    name: 'Establish the fire alarm’s designed and current coverage, audibility and cause-and-effect',
    description: 'And its relationship to the evacuation strategy.',
    unblocks: 'A1 — the evacuation strategy cannot be answered without it.',
    consequence:
      'Two rows in the register currently AGE this finding rather than resolve it, and both say ' +
      'so. Until the survey exists they are compensatory controls, not controls.',
  }),
  action('a6', {
    category: 'technical_determination', priority: 'high', sortOrder: 20,
    name: 'The suppression system’s design basis',
    description:
      'The design and commissioning standard (BS 9251 or BS EN 12845), system classification, ' +
      'pump arrangement, tank arrangement, applicable LPC Rules, manufacturer’s requirements, ' +
      'insurer requirements, and the exact servicing tiers each of those sets.',
    consequence:
      'Both suppression rows are marked TECHNICALLY UNVERIFIED and will stay so. The adopted ' +
      'six-monthly and annual cycles record what we do, not a regime anyone has confirmed is ' +
      'right for this installation. ⚠ The adopted interval reflects suppression serving the CAR ' +
      'PARK; it would not carry across to suppression serving residential accommodation.',
  }),
  action('a7', {
    category: 'technical_determination', priority: 'high', sortOrder: 30,
    name: 'The dry riser’s standard and test method',
    description:
      'The BS 9990 edition adopted, whether an annual wet pressure test is the correct test for ' +
      'this installation and at what pressure and duration, what the six-monthly visual adds, ' +
      'and any fire and rescue service or insurer requirement.',
    consequence:
      'The riser is expressly within the STATUTORY monthly check as essential fire-fighting ' +
      'equipment under FSER reg 6(7), so four rows touch one asset and their relationship has ' +
      'never been settled. Marked technically unverified.',
  }),
  action('a9', {
    category: 'technical_determination', priority: 'high', sortOrder: 40,
    name: 'Whether a compartmentation survey has ever been done, and whether drawings exist',
    consequence:
      'Without a drawing to inspect against there is no datum, and a report saying ' +
      '“compartmentation inspected” records an OPINION rather than a finding.',
  }),
  action('a11', {
    category: 'technical_determination', priority: 'high', sortOrder: 50,
    name: 'What the approved fire strategy requires of the stair’s openable windows',
    description:
      'Which storeys, the free area and opening each must achieve, manual or automatic, how they ' +
      'operate in a fire, who has access, what counts as a failure, and who accepted the ' +
      'arrangement on what evidence.',
    consequence:
      '⭐ A precondition, not an improvement. Checking that a window “opens” is not a check until ' +
      'OPEN has a value to test against. Separately: do not classify them as FSER reg 7 equipment ' +
      'until a competent fire engineer has recorded that determination.',
  }),
  action('a13', {
    category: 'technical_determination', priority: 'high', sortOrder: 60,
    name: 'The lightning protection system’s LPS classification',
    description:
      '⚠ And note that the system belongs to the ADJOINING building — see D13.',
    consequence:
      'BS EN 62305-3 sets inspection periodicity by protection level and class. Annual is ' +
      'recorded as our selection, not as the standard’s answer for this installation.',
  }),
  action('a23', {
    category: 'technical_determination', priority: 'high', sortOrder: 70,
    name: 'Confirm the fire alarm’s adopted BS 5839-1 edition and system category',
    description: 'Before finalising the servicing regime. Overlaps A20.',
    consequence:
      'Six-monthly is the conventional period, not a universal one: the edition, the category and ' +
      'the installation’s own documentation determine the permitted interval, and the fire risk ' +
      'assessment may require more.',
  }),
  action('a20', {
    category: 'technical_determination', priority: 'high', sortOrder: 80,
    name: 'Confirm the fire alarm system’s full configuration',
    description:
      'BS 5839-1 edition, system category, cause-and-effect schedule, whether any detectors are ' +
      'linked to smoke control, the automatic door-release interfaces, the standby power ' +
      'arrangement, who performs the statutory monthly check, and how defects escalate.',
    consequence:
      'The servicing regime cannot be finalised without them, and the cause-and-effect is the ' +
      'part that connects the alarm to A1 and A2.',
  }),
];

// ── Information to obtain ────────────────────────────────────────────────────

const INFORMATION = [
  action('a10', {
    category: 'information', priority: 'high', sortOrder: 10,
    name: 'What the residential corridors and lobbies are provided with for smoke ventilation',
    description:
      'Obtain the approved fire strategy, the as-built information and the commissioning records, ' +
      'and record one of: mechanical system installed · natural ventilation accepted · another ' +
      'arrangement · information unavailable, investigation required.',
    consequence:
      'Decides whether an entire system — with its own dampers, fans, cause-and-effect and ' +
      'standby power — is missing from this register or correctly absent from it. Either answer ' +
      'closes it; the silence does not. ⛔ “Not established either way” is a status with a shelf ' +
      'life: left standing it becomes a permanent shrug.',
  }),
  action('a12', {
    category: 'information', priority: 'high', sortOrder: 20,
    name: 'Whether ducted ventilation, smoke extract or pressurisation crosses a compartment line',
    description:
      '⚠ One damper is confirmed, on the bin chute, which alone makes the damper row apply. The ' +
      'open question is whether there are OTHERS.',
    consequence:
      'If it does, the building has fire or smoke dampers needing annual testing, and an untested ' +
      'damper is indistinguishable from a working one for its whole life. ⭐ “Not known” is not ' +
      'the same answer as “none”.',
  }),
  action('a14', {
    category: 'information', priority: 'high', sortOrder: 30,
    name: 'Whether the legionella written scheme names the little-used outlets',
    description: 'And who keeps that list current.',
    consequence:
      'Temperature monitoring, tank inspection and the risk assessment review were all present ' +
      'and none reaches water standing still in a dead leg. The list is the control — and it is a ' +
      'living list.',
  }),
  action('a15', {
    category: 'information', priority: 'high', sortOrder: 40,
    name: 'Who holds the records for roof access equipment',
    description:
      '✅ Answered in part: there are NO roof anchors, so the row was widened to the access ' +
      'ladders and steps that do exist. What remains is who holds their records.',
    consequence:
      'The classic unowned asset: installed by one contractor, relied on by window cleaners and ' +
      'surveyors, inspected by nobody unless somebody schedules it.',
  }),
  action('a16', {
    category: 'information', priority: 'high', sortOrder: 50,
    name: 'Whether the powered gate’s closing force has ever been measured',
    description:
      '✅ Answered in part: there IS a powered car park gate, so the row applies. The second gate ' +
      'is manual and decorative and the shutters are unused — ⚠ “unused” is not “out of scope” ' +
      'while it can still be operated.',
    consequence:
      'A powered gate goes on working perfectly while being unsafe — the two are unrelated, which ' +
      'is why “it opens and closes fine” is not the test.',
  }),
  action('d13', {
    category: 'information', priority: 'high', sortOrder: 60,
    name: 'The lightning protection system belongs to the ADJOINING building',
    description:
      'Establish the arrangement under which this building relies on it, who maintains it, and ' +
      'what notice we would get of a change.',
    consequence:
      '⛔ We rely on a measure we neither own nor maintain. The likeliest way it is lost is the ' +
      'neighbour reroofing or decommissioning it — which no inspection regime here detects.',
  }),
];

// ── Operational processes to establish ───────────────────────────────────────

const PROCESS = [
  action('a3', {
    category: 'process', priority: 'critical', sortOrder: 10,
    name: 'Implement and evidence resident access to the monthly FSER check records',
    consequence:
      '⛔ FSER reg 7(4) is UNCONDITIONAL — the responsible person must make a record of the ' +
      'monthly checks “and make that record accessible to the residents of the building”. Not on ' +
      'request. The record is made; it is not accessible. The method is ours to choose; the duty ' +
      'is not. ⭐ This is a control deficiency, not an open question.',
  }),
  action('a8', {
    category: 'process', priority: 'high', sortOrder: 20,
    name: 'How a contractor penetration is permitted, recorded and reinstated',
    description:
      'And whether any gate exists at all for utilities, telecoms, leaseholder fit-out and ' +
      'emergency repairs. The action must specify: owner · scope · every work route covered · the ' +
      'emergency and out-of-hours process · the utility and telecoms interface · the ' +
      'leaseholder-works interface · who may authorise a penetration · the fire-stopping ' +
      'specification · verification before the opening is closed up · where the record lives.',
    consequence:
      'The register carries a penetration control row, but it describes what the control SHOULD ' +
      'be rather than what exists. ⛔ If no gate exists, that is a more urgent finding than any ' +
      'defect the annual compartmentation survey will produce — the survey finds historic damage; ' +
      'only this prevents new damage. ⛔ Until the gate exists, the annual survey must not be ' +
      'treated as compensating for its absence.',
  }),
  action('a4', {
    category: 'process', priority: 'critical', sortOrder: 30,
    name: 'Assign and technically close the nine conditional and interim measures',
    description:
      'Each needs: action reference · originating defect or finding · technical authority · the ' +
      'risk being controlled · residual risk accepted · interim-control owner · escalation ' +
      'threshold · stop-use or evacuation authority · permanent solution · target date · end ' +
      'condition · evidence that residents and the fire and rescue authority have been told where ' +
      'required.',
    consequence:
      'All nine still read NOT ASSIGNED. ⭐ It has stopped being a documentation problem: a ' +
      'frequent check standing beside an open defect makes the register look controlled while ' +
      'nothing is resolved.',
  }),
  action('a21', {
    category: 'process', priority: 'medium', sortOrder: 40,
    name: 'A prescribed-information matrix',
    description:
      'For each category of information the regime requires us to provide: statutory source, ' +
      'recipient, whether proactive or on request, the response period, the grounds for ' +
      'withholding or redacting, the owner, and the evidence of provision.',
    consequence:
      'Provision duties are currently spread across several rows and an interface. ⭐ A matrix is ' +
      'how you see that one recipient, one clock or one redaction ground has been missed; ' +
      'row-by-row reading does not show it.',
  }),
];

// ── Records to create in the portal ──────────────────────────────────────────

const RECORDS = [
  action('a5', {
    category: 'record', priority: 'critical', sortOrder: 10,
    name: 'Name the evidence holder, the assurance owner and the escalation recipient on each row',
    description:
      '✅ The other two are done: every row now separates the statutory duty holder from who is ' +
      'operationally responsible.',
    consequence:
      'The statutory duty holder was derivable from the instrument, so it has been filled in — ' +
      'and it removed a real misstatement, because “Responsible: Site staff” could be read as the ' +
      'Responsible Person’s duty having been transferred. The remaining three are FACTS ABOUT ' +
      'THIS BUILDING’S ARRANGEMENTS, not about the law, so they cannot be derived and will not be ' +
      'guessed. ⚠ Being outside the catalogue does not make this optional: the register can say ' +
      'who bears the duty in law and who performs the work, and cannot yet say who proves it ' +
      'happened, who checks the system operates, or who decides what happens when it fails.',
  }),
  action('d5', {
    category: 'record', priority: 'critical', sortOrder: 20,
    name: 'Apply the register to this building — scope and switch on the schedulable rows',
    description:
      'Of the requirements, roughly 80 can be scheduled here; the rest are tracked in another app ' +
      'or have no home. Eleven arrive pre-scoped and fourteen carry a scoping note instead of a ' +
      'scope, because the right scope is caveated.',
    unblocks: 'Everything downstream — there is currently a catalogue and no schedule.',
    consequence:
      '⛔ The headline of the whole compliance position: the register is substantially complete ' +
      'and almost nothing downstream of it is. Zero live obligations.',
  }),
  action('d3', {
    category: 'record', priority: 'critical', sortOrder: 30,
    name: 'Link the existing obligations to their register entries',
    description:
      'The seeded obligations all have a null template_key, so they are unlinked. Four register ' +
      'entries offer a match.',
    consequence:
      '⛔ Apply the register over them without linking first and you get two obligations across ' +
      'the same fire doors, each reporting independently.',
  }),
  action('d4', {
    category: 'record', priority: 'high', sortOrder: 40,
    name: 'Record the citation verifications that exist only in a gitignored document',
    description:
      '14 rows carry a dated legislation.gov.uk check. The rest carry none, and that is a ' +
      'filterable worklist rather than a defect.',
    consequence:
      '⚠ “Citation not individually recorded” is not “unverified” — but only a recorded check can ' +
      'be shown to a reviewer.',
  }),
];

// ── Software that does not exist yet ─────────────────────────────────────────

const SOFTWARE = [
  action('a22', {
    category: 'software', priority: 'critical', sortOrder: 10,
    name: 'Build a source for the event-driven duties that have none',
    description:
      'Starting with the BUILDING-WORK CHANGE-CONTROL SCREEN — four other rows name it as their ' +
      'trigger source and it does not exist as a system. The others: compartmentation ' +
      'penetrations · the “reason to suspect” limb of the fire risk assessment review · the ' +
      'residential evacuation events held in another party’s process · asbestos checks before ' +
      'intrusive work · KBI and registration change awareness · dwelling access · ' +
      'consultation-triggering decisions · contractor certificate expiry · and a change in the law.',
    consequence:
      '⭐ A duty with a correct trigger and no detector is a duty that runs on somebody ' +
      'remembering. These are the rows most likely to be found breached after the event, because ' +
      'nothing about them looks wrong until then.',
  }),
  action('d6', {
    category: 'software', priority: 'high', sortOrder: 20,
    name: 'Nothing notifies',
    description:
      'The portal shows and never tells. An overdue statutory check waits for someone to open the ' +
      'tab. Specced in the notifications document, not agreed.',
    consequence:
      'The single thing that would most change how this area is used.',
  }),
  action('d14', {
    category: 'software', priority: 'high', sortOrder: 30,
    name: 'Split the component types too coarse to scope a duty',
    description:
      'A scope has type codes, systems, floors, statuses and attribute filters — and no component ' +
      'ids, so it cannot name one component. Where a duty applies to some members of a type and ' +
      'nothing distinguishes them, the type is doing the work of a category.',
    consequence:
      '⚠ The audit that found these inferred kind from type codes and labels, by someone who has ' +
      'not seen the building. Sound for finding candidates, unreliable for confirming them — each ' +
      'needs someone who has.',
  }),
  action('d12', {
    category: 'software', priority: 'high', sortOrder: 40,
    name: 'Model the stair windows as components',
    description: 'Until they are, the stair smoke ventilation provision is scheduled against nothing.',
    consequence: 'A provision relied on, with nothing to inspect it against.',
  }),
  action('d15', {
    category: 'software', priority: 'high', sortOrder: 50,
    name: 'Separate the powered gate from the decorative one',
    description: 'One is machinery with a closing force; the other is not.',
    consequence: 'A single type means the machinery duty reads as applying to both, or to neither.',
  }),
  action('d16', {
    category: 'software', priority: 'high', sortOrder: 60,
    name: 'Model the refuse chute itself',
    description:
      'It exists only as its parts — 8 hoppers, 8 vent segments and the damper at its foot — and ' +
      'none of them carries what makes it significant: ⭐ a vertical shaft breaching eight ' +
      'compartment floors, ending in a refuse store. Decided: one component per floor.',
    consequence:
      'A hopper is an opening, a vent stack is ventilation, the damper is the protection, and ' +
      'nothing is the shaft.',
  }),
  action('d17', {
    category: 'software', priority: 'high', sortOrder: 70,
    name: 'Separate the lobby-to-stair doors from the other fire doors',
    description: 'They need a weekly check the rest do not.',
    consequence: 'Without the split, the weekly duty cannot be scoped without over-scoping it.',
  }),
  action('d18', {
    category: 'software', priority: 'medium', sortOrder: 80,
    name: 'Distinguish sentinel taps from little-used outlets',
    consequence:
      'The flushing check applies to sentinel taps only. Encoding the type would over-scope it to ' +
      'all of them — ⛔ worse than leaving it unscoped, because an unscoped row is badged and a ' +
      'wrongly-scoped one looks finished.',
  }),
  action('d7', {
    category: 'software', priority: 'high', sortOrder: 90,
    name: 'Deferred RLS on document_library and media_attachments',
    description: 'Both need an entity_type to owning-app policy.',
    consequence: 'Named in the security sweep and deliberately deferred, not forgotten.',
  }),
  action('d8', {
    category: 'software', priority: 'high', sortOrder: 100,
    name: 'A latent provider-switch break in the media proxy',
    description:
      'The file-id guard fits Drive and OneDrive ids and rejects Supabase storage paths.',
    consequence:
      'Latent only — the active provider is Drive. Switching to Supabase storage would 400 every ' +
      'inspection photo and Dossier preview at read time. Pinned by a test.',
  }),
  action('d9', {
    category: 'software', priority: 'high', sortOrder: 110,
    name: 'The two complaints SLA clocks are not built',
    description:
      'ack_due_at and response_due_at exist as columns and no application code reads or writes ' +
      'either.',
    consequence:
      'The designed 5-working-day acknowledge and 20-day respond targets are designed, not ' +
      'shipped. ⚠ Do not describe them as working.',
  }),
  action('d10', {
    category: 'software', priority: 'medium', sortOrder: 120,
    name: 'Works schedules — asset ids need sorting',
    description:
      'Data, not code. Components without an asset_id fall back to a uuid fragment, so refs read ' +
      'U/L/244739a8. ⛔ Do not “fix” the ref format.',
    consequence: 'Contractor-facing references that are unreadable.',
  }),
];

// ── Interfaces with other parties ────────────────────────────────────────────

const INTERFACES = [
  action('a19', {
    category: 'interface', priority: 'high', sortOrder: 10,
    name: 'Where is the PRESCRIBED FORM of the BSA s.82 notice prescribed',
    description:
      'And is what is currently displayed in that form? Confirm the display position against ' +
      '“conspicuous”, who swaps the building assessment certificate when a new one issues, and ' +
      'who removes it if a special measures order is made. The action must identify: the ' +
      'instrument prescribing the form · the current form and its version · who replaces it · the ' +
      'evidence of display · the special-measures exception · the trigger for review.',
    consequence:
      '⛔ The only duty in the register whose breach is an imprisonable offence on its own terms — ' +
      's.82(6), up to two years on indictment. It is also the cheapest to discharge and the ' +
      'easiest to lose to redecoration. ⭐ A notice in the wrong form is a notice not given.',
  }),
  action('h4', {
    category: 'interface', priority: 'high', sortOrder: 20,
    name: 'Whether to reopen EX-2, the fire and rescue authority interface',
    consequence:
      'The fire and rescue authority already appears in five register rows as a recipient. ' +
      'Whether that warrants an interface document is a scope call.',
  }),
];

// ── Testing by a person ──────────────────────────────────────────────────────
// ⚠ The order is deliberate: admin pass FIRST, ordinary low-permission user
// LATER. That is a sequence somebody chose, not a backlog nobody got to.

const TESTING = [
  action('h_register', {
    category: 'testing', priority: 'critical', sortOrder: 10,
    name: 'Compliance register — set it up for real',
    description:
      'The walkthrough doubles as the acceptance test, and it is done on live data: the ' +
      'applicability decisions it records are this building’s actual compliance record.',
    unblocks: 'D5 and D1 — it IS the work rather than a rehearsal of it.',
    consequence: 'There is a catalogue and no schedule until somebody does this.',
  }),
  action('h_works', {
    category: 'testing', priority: 'high', sortOrder: 20,
    name: 'Works schedules — never exercised',
    description: 'Applying a schedule back to the register is the part nobody has watched work.',
    consequence: 'A shipped feature with no evidence it works end to end.',
  }),
  action('h_complaints', {
    category: 'testing', priority: 'high', sortOrder: 30,
    name: 'Complaints — log one case and walk it to Responded',
    description:
      '⚠ Grant yourself the permission first: RLS gates on app_permissions, so no grant shows an ' +
      'EMPTY app rather than an error — the single most likely thing to be mistaken for a bug.',
    consequence: 'Confirm it is still in the Open queue: responded is not closed.',
  }),
  action('h_mor', {
    category: 'testing', priority: 'high', sortOrder: 40,
    name: 'MOR — built, reviewed accurate, never tested',
    consequence: 'A statutory reporting workflow nobody has run.',
  }),
  action('h_planner', {
    category: 'testing', priority: 'high', sortOrder: 50,
    name: 'Planner — nothing gates this now',
    consequence: 'The print work it was waiting on has landed.',
  }),
  action('h_offline', {
    category: 'testing', priority: 'high', sortOrder: 60,
    name: 'Inspection offline walk — never run offline',
    description:
      '⛔ Dev database ONLY. Prod photo rows point at real Google Drive files, and deleting a ' +
      'session there destroys them.',
    consequence: 'An offline-first feature with no offline evidence.',
  }),
  action('h_rls', {
    category: 'testing', priority: 'high', sortOrder: 70,
    name: 'RLS as a real low-permission user',
    description:
      '⭐ Part 1 — anonymous and logged-out — is the one to do if only one gets done.',
    consequence:
      'The second pass by design. Public exposure is the severity tier that matters here.',
  }),
  action('h1', {
    category: 'duty_holder_decision', priority: 'critical', sortOrder: 70,
    name: 'A retention period for complaints records, and for audit',
    description: 'One decision, several call sites — make them together.',
    unblocks: 'A18 — the per-row retention basis.',
    consequence:
      'The register states a retention BASIS on every row, and for almost all of them the honest ' +
      'answer is “internal policy”. This decision is what turns that into a real one.',
  }),
  action('h2', {
    category: 'duty_holder_decision', priority: 'critical', sortOrder: 80,
    name: 'The public plan-images and inspection-photos storage buckets',
    description: 'Genuinely unauthenticated-public.',
    consequence:
      'Needs a private bucket plus signed URLs across five UI consumers, and ⚠ conflicts with ' +
      'Mobile Plan’s offline caching, which needs stable non-expiring URLs. That conflict IS the ' +
      'decision.',
  }),
  action('h3', {
    category: 'duty_holder_decision', priority: 'high', sortOrder: 90,
    name: 'Validate the scheduler consolidation against the real statutory task list',
    unblocks: 'Follows D5 rather than preceding it.',
    consequence: 'There has never BEEN a real task list to validate it against.',
  }),
  action('h5', {
    category: 'duty_holder_decision', priority: 'medium', sortOrder: 100,
    name: 'auth_leaked_password_protection needs the Supabase Pro plan',
    consequence: 'A purchase, not a task.',
  }),
  action('h6', {
    category: 'duty_holder_decision', priority: 'medium', sortOrder: 110,
    name: 'Confirm the GitHub repo is private, and that both deploy targets still build',
    consequence: 'Cheap, and the kind of thing nobody checks until it matters.',
  }),
  action('h7', {
    category: 'duty_holder_decision', priority: 'medium', sortOrder: 120,
    name: 'Fill in TEST_DB_URL in .env',
    description: 'Still the .env.example placeholder.',
    consequence:
      'The documented db:push:test step fails immediately; db:push:dev has been used instead.',
  }),
];

// ── Reasoned absences ────────────────────────────────────────────────────────
// ⭐ A duty a reader would expect to find. Stated as a reasoned absence rather
// than left as a silence, because a reviewer listing "what is missing" is
// looking at the BUILDING, where the duty genuinely exists.

const ABSENCES = [
  absence('abs_fraew', {
    sortOrder: 10,
    name: 'There is no periodic external wall fire appraisal, and that is deliberate',
    description:
      'A PAS 9980 appraisal is commissioned to answer a question, not run on a cycle, and no ' +
      'instrument imposes a repeat. What brings it back is a CHANGE — caught by the external wall ' +
      'record row and by the fire risk assessment’s statutory trigger, which since the Fire ' +
      'Safety Act 2021 expressly reaches the structure, the external walls and the flat entrance ' +
      'doors. ⛔ Adding a periodic row would invent a duty and imply the trigger rows were not ' +
      'enough. ⚠ Two things DO carry forward from an appraisal: any interim measure it recommends ' +
      'belongs in Conditional and interim measures with an end condition, and the risk level and ' +
      'mitigating steps it produces are what the external wall record is legally required to ' +
      'contain.',
  }),
  absence('abs_resident_data', {
    sortOrder: 20,
    name: 'Resident personal data is deliberately held elsewhere',
    description:
      'Names, contacts, and the content of personal evacuation plans. ⚠ That is a decision about ' +
      'WHERE RECORDS LIVE, not a decision to ignore a duty: the 2025 evacuation duties are all in ' +
      'the register, and the four that touch residents are marked as interfaces — we hold that ' +
      'the process exists, is current, who owns it and when it was last confirmed, and nothing ' +
      'else.',
  }),
  absence('abs_dwellings', {
    sortOrder: 30,
    name: 'Inspections inside individual flats are not in this register',
    description:
      'The scope is the common parts, the structure and the building’s own systems. Duties inside ' +
      'a dwelling sit with each leaseholder, or with the landlord of each individually let flat, ' +
      'and neither the accountable person nor the managing agent can discharge or evidence them. ' +
      '⚠ ONE QUALIFICATION: FSER reg 10(4) requires best endeavours to check every flat entrance ' +
      'door at least every 12 months — a periodic duty that DOES reach through a front door. It ' +
      'is a compartment boundary onto the common escape route, not an inspection of the home ' +
      'behind it, and it is held on its own row.',
  }),
];

// ── What this list does not claim ────────────────────────────────────────────
// ⛔ Stated plainly, because a statement of intent read as a statement of
// performance would be the most damaging way for this register to be wrong.

const CAVEATS = [
  caveat('cav_intent', {
    sortOrder: 10,
    name: 'This is what we intend to do, not a record of what has been done',
    description:
      'The register says which duties apply and how they are discharged. What was actually done, ' +
      'and when, is the evidence held against each obligation — a different question with a ' +
      'different answer.',
  }),
  caveat('cav_intervals', {
    sortOrder: 20,
    name: 'The intervals have not all been independently verified',
    description:
      'The statutory CITATIONS were checked against legislation.gov.uk, and a dozen statutory ' +
      'periods are carried verbatim on the rows that have them. ⚠ What remains unverified is the ' +
      'STANDARD-based and adopted cadences — the BS 5839-1 edition and system category, BS 9990, ' +
      'the suppression design basis, the LPS class, BS 1703. Rows marked “established practice” ' +
      'are our judgement, and rows marked “our scheduling tolerance” carry our arithmetic on a ' +
      'word rather than a figure any instrument states.',
  }),
  caveat('cav_applicability', {
    sortOrder: 30,
    name: 'Whether each duty applies to this building is our assessment',
    description:
      'Recorded as an attributed decision with a reason and, where the answer could change, a ' +
      'review date — not as a silence.',
  }),
  caveat('cav_catalogue', {
    sortOrder: 40,
    name: 'This is a catalogue, and almost nothing is ever removed from it',
    description:
      '⭐ Where a duty exists but does not bite here, it STAYS on the list and a separate reasoned ' +
      'decision is recorded against it. A deleted requirement is indistinguishable from one ' +
      'nobody thought of. The bar for removing one outright is that it can never apply here or ' +
      'can never be ours; two have met it. ⚠ A row here is therefore not a live obligation: the ' +
      'catalogue, the applicability decision and the scheduled work are three different objects.',
  }),
  caveat('cav_interim', {
    sortOrder: 50,
    name: 'Nine rows are interim measures standing beside open defects',
    description:
      '⛔ Each is marked OPERATIONALLY INCOMPLETE and carries a completion action that reads NOT ' +
      'ASSIGNED. ⭐ The warning matters more than it looks: a frequent inspection beside an ' +
      'unfixed defect reads as control it does not provide, and prose reads the same two years ' +
      'later — which is how a warning becomes wallpaper. Seven things all nine lack: the hazard · ' +
      'the residual risk accepted · the technical authority · the escalation threshold · who may ' +
      'declare it unsafe · the permanent solution · the date.',
  }),
  caveat('cav_assurance', {
    sortOrder: 60,
    name: 'An assurance row completing does NOT discharge the duty it watches',
    description:
      '⛔ Six duties are held as two rows: the event-driven statutory duty, and an annual ' +
      'confirmation that it is being operated. Completing the confirmation says only that the ' +
      'confirmation happened. Rendered as a pass it would rebuild in software the exact ' +
      'conflation the two rows were separated to prevent — and with more authority than prose, ' +
      'because a green row is read as an answer. ⚠ Only the GREEN outcome is reinterpreted: an ' +
      'assurance row overdue or never run is still a breach and still says so.',
  }),
  caveat('cav_detector', {
    sortOrder: 70,
    name: 'Ten event-driven duties have a correct trigger and nothing that detects it',
    description:
      '⭐ An honest note that nobody is watching is still nobody watching. Among them is the ' +
      'building-work change-control screen, which four other rows name as their own trigger ' +
      'source and which does not exist as a system. See action A22.',
  }),
];

/**
 * Everything in the register that is not a periodic requirement.
 *
 * ⛔ Deliberately NOT merged into `STATUTORY_TEMPLATE`. That constant means THE
 * REQUIREMENTS, and 173 claims plus every existing test assert things about it
 * — an action appearing in that list would be counted as a duty by code written
 * before actions existed. Anything wanting these asks for them by name.
 */
export const REGISTER_ITEMS = [
  ...DUTY_HOLDER, ...TECHNICAL, ...INFORMATION, ...PROCESS,
  ...RECORDS, ...SOFTWARE, ...INTERFACES, ...TESTING,
  ...ABSENCES, ...CAVEATS,
];

/** Just the actions, in category then priority then author order. */
export const REGISTER_ACTIONS = REGISTER_ITEMS.filter(i => i.kind === 'action');
