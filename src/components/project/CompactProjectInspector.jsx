import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SECTION_ORDER = [
  'Kartbild',
  'Manuell kalibrering',
  'Takpolygoner',
  'Paneler på aktivt tak',
  'Tak',
  'Takmått',
  'Taktyp',
  'Lutning',
  'Solpanel',
  'Montagesystem',
  'Panelgrupp',
];

let activeTitle = 'Kartbild';
let expanded = true;

const icon = title => {
  const svg = body => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
  if (title === 'Kartbild') return svg('<path d="m3 5 5-2 8 3 5-2v15l-5 2-8-3-5 2Z"/><path d="M8 3v15M16 6v15"/>');
  if (title === 'Manuell kalibrering') return svg('<path d="m4 17 13-13 3 3L7 20H4Z"/><path d="m8 14 2 2M11 11l2 2M14 8l2 2"/>');
  if (title === 'Takpolygoner') return svg('<path d="m4 16 5-9 9-2 3 10-7 6Z"/><circle cx="4" cy="16" r="1.4"/><circle cx="9" cy="7" r="1.4"/><circle cx="18" cy="5" r="1.4"/><circle cx="21" cy="15" r="1.4"/><circle cx="14" cy="21" r="1.4"/>');
  if (title === 'Paneler på aktivt tak' || title === 'Solpanel') return svg('<circle cx="18" cy="5" r="2"/><path d="M18 1v1M18 8v1M14 5h1M21 5h1"/><path d="M4 9h12l3 10H7Z"/><path d="M8 9 7 19M12 9v10M16 9l2 10M6 14h12"/>');
  if (title === 'Tak') return svg('<path d="m3 12 9-7 9 7"/><path d="M5 11v9h14v-9"/><path d="M9 20v-6h6v6"/>');
  if (title === 'Takmått') return svg('<path d="m3 13 9-7 9 7"/><path d="M5 12v8h14v-8"/><path d="M4 3h16M4 3l2-2M4 3l2 2M20 3l-2-2M20 3l-2 2"/>');
  if (title === 'Taktyp') return svg('<path d="m3 10 9-6 9 6"/><path d="M5 10h14"/><path d="M7 10v9M11 10v9M15 10v9M19 10v9"/>');
  if (title === 'Lutning') return svg('<path d="M3 20h18"/><path d="m5 19 14-9"/><path d="M7 19a5 5 0 0 1 2-4"/>');
  if (title === 'Montagesystem') return svg('<path d="M3 20h18"/><path d="m6 18 5-11h6l3 11"/><path d="M8 14h10M11 7v11M16 7v11"/>');
  if (title === 'Panelgrupp') return svg('<rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="4" width="8" height="7" rx="1"/><rect x="3" y="13" width="8" height="7" rx="1"/><rect x="13" y="13" width="8" height="7" rx="1"/>');
  return svg('<circle cx="12" cy="12" r="8"/>');
};

const collapseIcon = isExpanded => iconMarkup(
  isExpanded
    ? '<path d="m14 6-6 6 6 6"/>'
    : '<path d="m10 6 6 6-6 6"/>',
);

function iconMarkup(body) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

function sectionTitle(section) {
  const headerText = (section.firstElementChild?.textContent || section.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
  return SECTION_ORDER.find(title => headerText.startsWith(title) || headerText.includes(title)) || '';
}

function clearOldDecoration(root) {
  root.querySelectorAll('.compact-section-icon, .roof-material-icon, .compact-roof-row-icon').forEach(node => node.remove());
  root.querySelectorAll('[data-inspector-title], [data-roof-material], [data-compact-roof-row], [data-compact-help-text]').forEach(node => {
    delete node.dataset.inspectorTitle;
    delete node.dataset.roofMaterial;
    delete node.dataset.compactRoofRow;
    delete node.dataset.compactHelpText;
  });
  root.classList.remove('solar-compact-inspector');
  root.closest('aside')?.classList.remove('solar-compact-inspector-aside');
}

function collectSections(list, mapHost) {
  const sections = [
    ...Array.from(list.querySelectorAll(':scope > section')),
    ...Array.from(mapHost.querySelectorAll(':scope > section')),
  ];
  return sections
    .map(section => ({ section, title: sectionTitle(section) }))
    .filter(item => item.title);
}

function makeButton(title, selected) {
  const button = document.createElement('button');
  button.type = 'button';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.dataset.inspectorRailButton = title;
  button.className = `right-inspector-icon-button${selected ? ' is-active' : ''}`;
  button.innerHTML = icon(title);
  return button;
}

function showActiveSection(list, mapHost, sections) {
  const available = new Set(sections.map(item => item.title));
  if (!available.has(activeTitle)) activeTitle = available.has('Kartbild') ? 'Kartbild' : sections[0]?.title || '';

  sections.forEach(({ section, title }) => {
    const active = title === activeTitle;
    section.dataset.inspectorSection = title;
    section.style.display = active ? '' : 'none';
  });

  const mapSectionActive = sections.some(item => item.title === activeTitle && mapHost.contains(item.section));
  mapHost.style.display = mapSectionActive ? '' : 'none';

  Array.from(list.children).forEach(child => {
    if (child === mapHost || child.tagName === 'SECTION') return;
    const text = (child.textContent || '').trim();
    const isSaveAction = /^Spara (kartprojektering|ritning|tom ritning)/i.test(text);
    child.style.display = expanded && isSaveAction ? '' : 'none';
  });
}

function rebuildRail(aside, list, mapHost, sections) {
  aside.querySelector('[data-right-inspector-rail]')?.remove();

  const rail = document.createElement('div');
  rail.dataset.rightInspectorRail = 'true';
  rail.className = 'right-inspector-icon-rail';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.title = expanded ? 'Dölj inställningar' : 'Visa inställningar';
  toggle.setAttribute('aria-label', toggle.title);
  toggle.className = 'right-inspector-toggle';
  toggle.innerHTML = collapseIcon(expanded);
  toggle.addEventListener('click', () => {
    expanded = !expanded;
    decorateInspector();
  });
  rail.appendChild(toggle);

  const divider = document.createElement('div');
  divider.className = 'right-inspector-divider';
  rail.appendChild(divider);

  SECTION_ORDER.filter(title => sections.some(item => item.title === title)).forEach(title => {
    const button = makeButton(title, title === activeTitle);
    button.addEventListener('click', () => {
      activeTitle = title;
      expanded = true;
      decorateInspector();
    });
    rail.appendChild(button);
  });

  aside.insertBefore(rail, aside.firstChild);
  aside.dataset.inspectorExpanded = expanded ? 'true' : 'false';
  list.dataset.inspectorContent = 'true';
  list.style.display = expanded ? '' : 'none';
  showActiveSection(list, mapHost, sections);
}

function decorateInspector() {
  const mapHost = document.querySelector('[data-map-host="settings"]');
  const list = mapHost?.parentElement;
  const aside = list?.closest('aside');
  if (!mapHost || !list || !aside) return;

  clearOldDecoration(list);
  aside.querySelectorAll('[data-inspector-original-header]').forEach(node => delete node.dataset.inspectorOriginalHeader);

  const originalHeader = Array.from(aside.children).find(child => child !== list && !child.hasAttribute('data-right-inspector-rail'));
  if (originalHeader) originalHeader.dataset.inspectorOriginalHeader = 'true';

  aside.classList.add('solar-icon-inspector-aside');
  list.classList.add('solar-icon-inspector-content');
  const sections = collectSections(list, mapHost);
  rebuildRail(aside, list, mapHost, sections);
}

export default function CompactProjectInspector() {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith('/projects/')) return undefined;

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        decorateInspector();
      });
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      document.querySelector('[data-right-inspector-rail]')?.remove();
    };
  }, [location.pathname]);

  return (
    <style>{`
      .solar-icon-inspector-aside {
        display: grid !important;
        grid-template-columns: 58px minmax(0, 300px) !important;
        width: 358px !important;
        min-width: 58px !important;
        padding: 0 !important;
        overflow: hidden !important;
        background: #f8fafc !important;
        transition: width 160ms ease, grid-template-columns 160ms ease;
      }
      .solar-icon-inspector-aside[data-inspector-expanded="false"] {
        grid-template-columns: 58px 0 !important;
        width: 58px !important;
      }
      .solar-icon-inspector-aside > [data-inspector-original-header] {
        display: none !important;
      }
      .right-inspector-icon-rail {
        grid-column: 1;
        display: flex;
        min-height: 100%;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        overflow-y: auto;
        border-left: 1px solid #e2e8f0;
        border-right: 1px solid #e2e8f0;
        background: #f8fafc;
        padding: 8px 7px;
      }
      .right-inspector-toggle,
      .right-inspector-icon-button {
        display: inline-flex;
        width: 42px;
        height: 42px;
        flex: 0 0 42px;
        align-items: center;
        justify-content: center;
        border: 1px solid transparent;
        border-radius: 12px;
        color: #64748b;
        background: transparent;
        transition: border-color 120ms ease, background 120ms ease, color 120ms ease;
      }
      .right-inspector-toggle:hover,
      .right-inspector-icon-button:hover {
        border-color: #cbd5e1;
        background: #fff;
        color: #0f172a;
      }
      .right-inspector-icon-button.is-active {
        border-color: #fdba74;
        background: #fff7ed;
        color: #f97316;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      }
      .right-inspector-toggle svg,
      .right-inspector-icon-button svg {
        width: 20px;
        height: 20px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .right-inspector-divider {
        width: 30px;
        height: 1px;
        flex: 0 0 1px;
        margin: 2px 0 4px;
        background: #e2e8f0;
      }
      .solar-icon-inspector-content {
        grid-column: 2;
        min-width: 0;
        overflow-y: auto !important;
        padding: 10px !important;
        background: #f8fafc;
      }
      .solar-icon-inspector-aside[data-inspector-expanded="false"] .solar-icon-inspector-content {
        display: none !important;
      }
      .solar-icon-inspector-content section {
        border-radius: 14px !important;
        border: 1px solid #e2e8f0 !important;
        background: #fff !important;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05) !important;
      }
      .solar-icon-inspector-content [data-map-host="settings"] {
        display: contents;
      }
    `}</style>
  );
}
